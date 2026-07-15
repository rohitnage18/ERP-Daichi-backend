import { Router } from "express";
import { getDb, Invoice, Order, Zone } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";
import { sendEmail, getManagementReportEmails } from "../../lib/email";

const router = Router();

router.use(requireAuth);

function monthRange(date = new Date()) {
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

router.get("/sales", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const monthParam = req.query.month as string | undefined;
    const month = monthParam ? new Date(monthParam) : new Date();
    const { from, to } = monthRange(month);

    const db = await getDb();
    const zonesCol = db.collection<Zone>("zones");
    const ordersCol = db.collection<Order>("orders");

    const zones = await zonesCol.find({}).toArray();
    const orders = await ordersCol
      .find({
        orderDate: { $gte: from, $lte: to },
        status: { $nin: ["DRAFT", "CANCELLED"] },
      })
      .toArray();

    if (zones.length === 0) {
      const totalRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);
      return res.json([
        {
          zoneId: "all",
          zone: "All Zones",
          orders: orders.length,
          revenue: totalRevenue,
          dealers: new Set(orders.map((o) => o.dealerId.toString())).size,
        },
      ]);
    }

    const zoneStats = zones.map((zone) => ({
      zoneId: zone._id?.toString(),
      zone: zone.name,
      orders: 0,
      revenue: 0,
      dealers: 0,
    }));

    const dealerZoneMap = new Map<string, string>();
    for (const order of orders) {
      const zoneName = order.dealerCity || "Unassigned";
      let stat = zoneStats.find((z) => z.zone === zoneName);
      if (!stat) {
        stat = { zoneId: zoneName, zone: zoneName, orders: 0, revenue: 0, dealers: 0 };
        zoneStats.push(stat);
      }
      stat.orders += 1;
      stat.revenue += order.totalAmount;
      dealerZoneMap.set(order.dealerId.toString(), zoneName);
    }

    for (const stat of zoneStats) {
      stat.dealers = [...dealerZoneMap.entries()].filter(([, z]) => z === stat.zone).length;
    }

    return res.json(zoneStats);
  } catch (error) {
    console.error("Sales report error:", error);
    return res.status(500).json({ error: "Failed to generate report" });
  }
});

router.get("/aging", requireRole("MANAGEMENT_ADMIN"), async (_req, res) => {
  try {
    const db = await getDb();
    const invoicesCol = db.collection<Invoice>("invoices");
    const now = new Date();

    const invoices = await invoicesCol
      .find({
        balanceAmount: { $gt: 0 },
        status: { $nin: ["PAID", "CANCELLED"] },
      })
      .sort({ dueDate: 1 })
      .limit(500)
      .toArray();

    return res.json(
      invoices.map((inv) => {
        const daysOverdue = Math.max(
          0,
          Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))
        );
        let bucket = "Current";
        if (daysOverdue > 60) bucket = "60+ days";
        else if (daysOverdue > 30) bucket = "31-60 days";
        else if (daysOverdue > 0) bucket = "1-30 days";

        return {
          invoiceId: inv._id?.toString(),
          invoiceNumber: inv.invoiceNumber,
          dealer: inv.dealerName,
          zone: inv.dealerCity || "—",
          dueDate: inv.dueDate,
          balanceAmount: inv.balanceAmount,
          daysOverdue,
          bucket,
        };
      })
    );
  } catch (error) {
    console.error("Aging report error:", error);
    return res.status(500).json({ error: "Failed to generate report" });
  }
});

router.get("/monthly", requireRole("MANAGEMENT_ADMIN"), async (_req, res) => {
  try {
    const html = await buildMonthlyReportHtml();
    return res.json({ previewHtml: html });
  } catch (error) {
    console.error("Monthly report preview error:", error);
    return res.status(500).json({ error: "Failed to build preview" });
  }
});

router.post("/monthly", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const body = req.body ?? {};
    const recipients: string[] =
      body.recipients?.length > 0 ? body.recipients : await getManagementReportEmails();

    if (recipients.length === 0) {
      return res.status(400).json({
        error: "No recipients. Set MANAGEMENT_REPORT_EMAIL in .env or add emails in Settings.",
      });
    }

    const html = await buildMonthlyReportHtml();
    const monthLabel = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });
    const subject = `Daichi International — Management Report (${monthLabel})`;

    const results = [];
    for (const to of recipients) {
      const result = await sendEmail({
        to,
        subject,
        html,
        emailType: "MONTHLY_REPORT",
        sentById: req.user!.id,
      });
      results.push({ to, ...result });
    }

    return res.json({ sent: results });
  } catch (error) {
    console.error("Monthly report error:", error);
    return res.status(500).json({ error: "Failed to send report" });
  }
});

async function buildMonthlyReportHtml(): Promise<string> {
  const db = await getDb();
  const ordersCol = db.collection<Order>("orders");
  const invoicesCol = db.collection<Invoice>("invoices");
  const { from, to } = monthRange();

  const [ordersThisMonth, revenueAgg, aging] = await Promise.all([
    ordersCol.countDocuments({ orderDate: { $gte: from, $lte: to } }),
    ordersCol
      .aggregate<{ total: number }>([
        {
          $match: {
            orderDate: { $gte: from, $lte: to },
            status: { $nin: ["DRAFT", "CANCELLED"] },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ])
      .toArray(),
    invoicesCol
      .find({ balanceAmount: { $gt: 0 }, status: { $nin: ["PAID", "CANCELLED"] } })
      .toArray(),
  ]);

  const revenueMtd = revenueAgg[0]?.total ?? 0;
  const totalOutstanding = aging.reduce((s, a) => s + a.balanceAmount, 0);
  const monthLabel = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });

  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <h1 style="color: #1e40af;">Daichi International — Monthly Management Report</h1>
      <p style="color: #64748b;">Period: ${monthLabel}</p>
      <ul>
        <li><strong>Orders this month:</strong> ${ordersThisMonth}</li>
        <li><strong>Revenue (MTD):</strong> ₹${revenueMtd.toLocaleString("en-IN")}</li>
        <li><strong>Outstanding receivables:</strong> ₹${totalOutstanding.toLocaleString("en-IN")} (${aging.length} invoices)</li>
      </ul>
      <p style="margin-top: 24px; font-size: 12px; color: #94a3b8;">Generated by Daichi AgriFlow ERP.</p>
    </div>
  `;
}

export default router;
