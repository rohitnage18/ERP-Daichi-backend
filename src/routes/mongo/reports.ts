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

/** Top products & dealers performance from finalized invoices. */
router.get("/analytics", requireRole("MANAGEMENT_ADMIN", "ACCOUNT"), async (req, res) => {
  try {
    const monthParam = req.query.month as string | undefined;
    const month = monthParam ? new Date(monthParam) : new Date();
    const { from, to } = monthRange(month);
    const limit = Math.min(50, Math.max(5, parseInt(String(req.query.limit || "10"), 10) || 10));

    const db = await getDb();
    const invoicesCol = db.collection<Invoice>("invoices");

    const match = {
      invoiceDate: { $gte: from, $lte: to },
      status: { $nin: ["DRAFT", "CANCELLED"] },
    };

    const [topProducts, topDealers, totals] = await Promise.all([
      invoicesCol
        .aggregate([
          { $match: match },
          { $unwind: "$items" },
          {
            $group: {
              _id: {
                productId: "$items.productId",
                name: "$items.productName",
                code: "$items.productCode",
              },
              quantity: { $sum: "$items.quantity" },
              revenue: { $sum: "$items.totalAmount" },
              invoices: { $addToSet: "$_id" },
            },
          },
          {
            $project: {
              _id: 0,
              productId: { $toString: "$_id.productId" },
              productName: "$_id.name",
              productCode: "$_id.code",
              quantity: 1,
              revenue: 1,
              invoiceCount: { $size: "$invoices" },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: limit },
        ])
        .toArray(),
      invoicesCol
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: { dealerId: "$dealerId", name: "$dealerName", city: "$dealerCity" },
              revenue: { $sum: "$totalAmount" },
              invoices: { $sum: 1 },
              balance: { $sum: "$balanceAmount" },
            },
          },
          {
            $project: {
              _id: 0,
              dealerId: { $toString: "$_id.dealerId" },
              dealerName: "$_id.name",
              city: "$_id.city",
              revenue: 1,
              invoiceCount: "$invoices",
              outstanding: "$balance",
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: limit },
        ])
        .toArray(),
      invoicesCol
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$totalAmount" },
              invoices: { $sum: 1 },
              outstanding: { $sum: "$balanceAmount" },
            },
          },
        ])
        .toArray(),
    ]);

    return res.json({
      month: from.toISOString().slice(0, 7),
      summary: {
        revenue: totals[0]?.revenue ?? 0,
        invoices: totals[0]?.invoices ?? 0,
        outstanding: totals[0]?.outstanding ?? 0,
      },
      topProducts,
      topDealers,
    });
  } catch (error) {
    console.error("Analytics report error:", error);
    return res.status(500).json({ error: "Failed to generate analytics" });
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

const REPORT_TYPES = ["monthly", "sales", "aging", "products", "dealers"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

function isReportType(value: string): value is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}

function inr(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function explainSendError(message: string): string {
  if (/timeout|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNECTION/i.test(message)) {
    return "The report was not sent. The server could not connect to the email service.";
  }
  return message || "The report was not sent.";
}

async function saveFounderEmail(email: string) {
  const db = await getDb();
  await db.collection("appSettings").updateOne(
    { key: "management_report_emails" },
    { $set: { key: "management_report_emails", value: email, updatedAt: new Date() } },
    { upsert: true }
  );
}

router.post("/send", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const report = String(req.body?.report || "");
    const to = String(req.body?.to || "").trim().toLowerCase();
    if (!isReportType(report)) {
      return res.status(400).json({ error: "Choose a report to send" });
    }
    if (!to.includes("@")) {
      return res.status(400).json({ error: "Enter the founder's email" });
    }

    await saveFounderEmail(to);
    const { subject, html } = await buildReportEmail(report);
    const result = await sendEmail({
      to,
      subject,
      html,
      emailType: `REPORT_${report.toUpperCase()}`,
      sentById: req.user!.id,
    });
    if (!result.ok) {
      return res.status(502).json({ error: explainSendError(result.error || "") });
    }
    return res.json({ sent: true, to, report, subject });
  } catch (error) {
    console.error("Send report error:", error);
    return res.status(500).json({ error: "Failed to send report" });
  }
});

router.post("/monthly", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const body = req.body ?? {};
    const recipients: string[] =
      body.recipients?.length > 0 ? body.recipients : await getManagementReportEmails();

    if (recipients.length === 0) {
      return res.status(400).json({ error: "Enter the founder's email" });
    }

    const { subject, html } = await buildReportEmail("monthly");
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
    const failed = results.find((item) => item.ok === false);
    if (failed) {
      return res.status(502).json({ error: explainSendError(failed.error || ""), sent: results });
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

function emailShell(title: string, body: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto;">
      <h1 style="color: #14532d;">${title}</h1>
      ${body}
      <p style="margin-top: 24px; font-size: 12px; color: #94a3b8;">Generated by Daichi AgriFlow ERP.</p>
    </div>
  `;
}

async function buildReportEmail(type: ReportType): Promise<{ subject: string; html: string }> {
  const monthLabel = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });
  if (type === "monthly") {
    return {
      subject: `Daichi — Monthly report (${monthLabel})`,
      html: await buildMonthlyReportHtml(),
    };
  }

  const db = await getDb();
  const { from, to } = monthRange();

  if (type === "sales") {
    const orders = await db
      .collection<Order>("orders")
      .find({ orderDate: { $gte: from, $lte: to }, status: { $nin: ["DRAFT", "CANCELLED"] } })
      .toArray();
    const revenue = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const byZone = new Map<string, { orders: number; revenue: number }>();
    for (const order of orders) {
      const zone = order.dealerCity || "Unassigned";
      const row = byZone.get(zone) || { orders: 0, revenue: 0 };
      row.orders += 1;
      row.revenue += Number(order.totalAmount || 0);
      byZone.set(zone, row);
    }
    const rows = [...byZone.entries()]
      .map(([zone, row]) => `<tr><td>${zone}</td><td>${row.orders}</td><td>${inr(row.revenue)}</td></tr>`)
      .join("");
    return {
      subject: `Daichi — Sales report (${monthLabel})`,
      html: emailShell(
        `Sales report — ${monthLabel}`,
        `<p><strong>Orders:</strong> ${orders.length} &nbsp; <strong>Revenue:</strong> ${inr(revenue)}</p>
         <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
           <tr><th>Zone</th><th>Orders</th><th>Revenue</th></tr>
           ${rows || "<tr><td colspan='3'>No orders this month</td></tr>"}
         </table>`
      ),
    };
  }

  if (type === "aging") {
    const now = new Date();
    const invoices = await db
      .collection<Invoice>("invoices")
      .find({ balanceAmount: { $gt: 0 }, status: { $nin: ["PAID", "CANCELLED"] } })
      .sort({ dueDate: 1 })
      .limit(25)
      .toArray();
    const total = invoices.reduce((sum, invoice) => sum + Number(invoice.balanceAmount || 0), 0);
    const rows = invoices
      .map((invoice) => {
        const days = Math.max(
          0,
          Math.floor((now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24))
        );
        return `<tr><td>${invoice.invoiceNumber}</td><td>${invoice.dealerName || "—"}</td><td>${days}</td><td>${inr(invoice.balanceAmount)}</td></tr>`;
      })
      .join("");
    return {
      subject: "Daichi — Aging report",
      html: emailShell(
        "Outstanding aging report",
        `<p><strong>Open invoices in this email:</strong> ${invoices.length} &nbsp; <strong>Balance:</strong> ${inr(total)}</p>
         <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
           <tr><th>Invoice</th><th>Dealer</th><th>Days overdue</th><th>Balance</th></tr>
           ${rows || "<tr><td colspan='4'>No outstanding invoices</td></tr>"}
         </table>`
      ),
    };
  }

  const invoicesCol = db.collection<Invoice>("invoices");
  const match = {
    invoiceDate: { $gte: from, $lte: to },
    status: { $nin: ["DRAFT", "CANCELLED"] },
  };

  if (type === "products") {
    const products = await invoicesCol
      .aggregate<{ productName?: string; productCode?: string; quantity: number; revenue: number }>([
        { $match: match },
        { $unwind: "$items" },
        {
          $group: {
            _id: { name: "$items.productName", code: "$items.productCode" },
            quantity: { $sum: "$items.quantity" },
            revenue: { $sum: "$items.totalAmount" },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 15 },
        {
          $project: {
            _id: 0,
            productName: "$_id.name",
            productCode: "$_id.code",
            quantity: 1,
            revenue: 1,
          },
        },
      ])
      .toArray();
    const rows = products
      .map(
        (row) =>
          `<tr><td>${row.productName || "—"}</td><td>${row.productCode || "—"}</td><td>${row.quantity}</td><td>${inr(row.revenue)}</td></tr>`
      )
      .join("");
    return {
      subject: `Daichi — Product report (${monthLabel})`,
      html: emailShell(
        `Product report — ${monthLabel}`,
        `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
           <tr><th>Product</th><th>Code</th><th>Qty</th><th>Revenue</th></tr>
           ${rows || "<tr><td colspan='4'>No invoices this month</td></tr>"}
         </table>`
      ),
    };
  }

  const dealers = await invoicesCol
    .aggregate<{ dealerName?: string; city?: string; revenue: number; invoices: number; outstanding: number }>([
      { $match: match },
      {
        $group: {
          _id: { name: "$dealerName", city: "$dealerCity" },
          revenue: { $sum: "$totalAmount" },
          invoices: { $sum: 1 },
          outstanding: { $sum: "$balanceAmount" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 15 },
      {
        $project: {
          _id: 0,
          dealerName: "$_id.name",
          city: "$_id.city",
          revenue: 1,
          invoices: 1,
          outstanding: 1,
        },
      },
    ])
    .toArray();
  const rows = dealers
    .map(
      (row) =>
        `<tr><td>${row.dealerName || "—"}</td><td>${row.city || "—"}</td><td>${row.invoices}</td><td>${inr(row.revenue)}</td><td>${inr(row.outstanding)}</td></tr>`
    )
    .join("");
  return {
    subject: `Daichi — Dealer report (${monthLabel})`,
    html: emailShell(
      `Dealer report — ${monthLabel}`,
      `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
         <tr><th>Dealer</th><th>City</th><th>Invoices</th><th>Revenue</th><th>Outstanding</th></tr>
         ${rows || "<tr><td colspan='5'>No invoices this month</td></tr>"}
       </table>`
    ),
  };
}

export default router;
