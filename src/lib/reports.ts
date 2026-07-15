import prisma from "./prisma";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";

export function monthRange(date = new Date()) {
  return { from: startOfMonth(date), to: endOfMonth(date) };
}

export async function getDashboardStats(zoneId?: string | null) {
  const dealerWhere = zoneId ? { district: { zoneId } } : {};
  const orderWhere = zoneId ? { dealer: { district: { zoneId } } } : {};
  const { from, to } = monthRange();

  const [
    totalDealers,
    pendingDealerApprovals,
    ordersThisMonth,
    pendingOrders,
    revenueAgg,
    activeProducts,
    lowStockCount,
    overdueInvoices,
    pendingAllowances,
    todayVisits,
    todayLogs,
  ] = await Promise.all([
    prisma.dealer.count({ where: { ...dealerWhere, status: "APPROVED" } }),
    prisma.dealer.count({ where: { ...dealerWhere, status: "SUBMITTED" } }),
    prisma.order.count({
      where: { ...orderWhere, orderDate: { gte: from, lte: to } },
    }),
    prisma.order.count({
      where: { ...orderWhere, status: "PENDING_APPROVAL" },
    }),
    prisma.order.aggregate({
      where: {
        ...orderWhere,
        orderDate: { gte: from, lte: to },
        status: { notIn: ["DRAFT", "CANCELLED", "REJECTED"] },
      },
      _sum: { totalAmount: true },
    }),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.inventoryItem.findMany().then((items) =>
      items.filter((i) => i.quantity <= i.reorderLevel).length
    ),
    prisma.invoice.count({
      where: {
        status: { in: ["OVERDUE", "GENERATED", "SENT", "PARTIALLY_PAID"] },
        dueDate: { lt: new Date() },
        balanceAmount: { gt: 0 },
        ...(zoneId ? { dealer: { district: { zoneId } } } : {}),
      },
    }),
    prisma.allowanceClaim.count({ where: { status: "PENDING" } }),
    prisma.salesVisit.count({
      where: {
        visitDate: { gte: startOfDay(), lte: endOfDay() },
        ...(zoneId ? { user: { zoneId } } : {}),
      },
    }),
    prisma.dailyLog.count({
      where: {
        logDate: { gte: startOfDay(), lte: endOfDay() },
        ...(zoneId ? { user: { zoneId } } : {}),
      },
    }),
  ]);

  let lowStock = lowStockCount;
  if (typeof lowStock !== "number" || Number.isNaN(lowStock)) {
    const items = await prisma.inventoryItem.findMany();
    lowStock = items.filter((i) => i.quantity <= i.reorderLevel).length;
  }

  return {
    totalDealers,
    pendingDealerApprovals,
    ordersThisMonth,
    pendingOrders,
    revenueMtd: revenueAgg._sum.totalAmount ?? 0,
    activeProducts,
    lowStockCount: lowStock,
    overdueInvoices,
    pendingAllowances,
    todayVisits,
    todayLogs,
  };
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export async function getZoneSalesReport(month = new Date()) {
  const { from, to } = monthRange(month);

  const zones = await prisma.zone.findMany({
    include: {
      districts: {
        include: {
          dealers: {
            include: {
              orders: {
                where: {
                  orderDate: { gte: from, lte: to },
                  status: { notIn: ["DRAFT", "CANCELLED", "REJECTED"] },
                },
              },
            },
          },
        },
      },
    },
  });

  return zones.map((zone) => {
    const dealerIds = new Set<string>();
    let orders = 0;
    let revenue = 0;
    for (const district of zone.districts) {
      for (const dealer of district.dealers) {
        if (dealer.status === "APPROVED") dealerIds.add(dealer.id);
        for (const order of dealer.orders) {
          orders += 1;
          revenue += order.totalAmount;
        }
      }
    }
    return {
      zoneId: zone.id,
      zone: zone.name,
      orders,
      revenue,
      dealers: dealerIds.size,
    };
  });
}

export async function getAgingReport() {
  const invoices = await prisma.invoice.findMany({
    where: {
      balanceAmount: { gt: 0 },
      status: { notIn: ["PAID", "CANCELLED"] },
    },
    include: {
      dealer: {
        select: {
          firmName: true,
          city: true,
          district: { select: { name: true, zone: { select: { name: true } } } },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();
  return invoices.map((inv) => {
    const daysOverdue = Math.max(
      0,
      Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    let bucket = "Current";
    if (daysOverdue > 60) bucket = "60+ days";
    else if (daysOverdue > 30) bucket = "31-60 days";
    else if (daysOverdue > 0) bucket = "1-30 days";

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      dealer: inv.dealer.firmName,
      zone: inv.dealer.district.zone.name,
      dueDate: inv.dueDate,
      balanceAmount: inv.balanceAmount,
      daysOverdue,
      bucket,
    };
  });
}

export async function buildMonthlyManagementReportHtml() {
  const thisMonth = new Date();
  const lastMonth = subMonths(thisMonth, 1);
  const stats = await getDashboardStats();
  const zoneSales = await getZoneSalesReport(thisMonth);
  const lastMonthSales = await getZoneSalesReport(lastMonth);
  const aging = await getAgingReport();
  const totalOutstanding = aging.reduce((s, a) => s + a.balanceAmount, 0);

  const zoneRows = zoneSales
    .map(
      (z) =>
        `<tr><td>${z.zone}</td><td>${z.orders}</td><td>₹${z.revenue.toLocaleString("en-IN")}</td><td>${z.dealers}</td></tr>`
    )
    .join("");

  const lastMonthRevenue = lastMonthSales.reduce((s, z) => s + z.revenue, 0);
  const thisMonthRevenue = zoneSales.reduce((s, z) => s + z.revenue, 0);
  const growth =
    lastMonthRevenue > 0
      ? (((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
      : "—";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <h1 style="color: #1e40af;">Daichi International — Monthly Management Report</h1>
      <p style="color: #64748b;">Period: ${thisMonth.toLocaleString("en-IN", { month: "long", year: "numeric" })}</p>
      <h2>Summary</h2>
      <ul>
        <li><strong>Active dealers:</strong> ${stats.totalDealers}</li>
        <li><strong>Orders this month:</strong> ${stats.ordersThisMonth}</li>
        <li><strong>Revenue (MTD):</strong> ₹${stats.revenueMtd.toLocaleString("en-IN")}</li>
        <li><strong>MoM revenue change:</strong> ${growth}%</li>
        <li><strong>Pending approvals:</strong> ${stats.pendingDealerApprovals} dealers, ${stats.pendingOrders} orders</li>
        <li><strong>Outstanding receivables:</strong> ₹${totalOutstanding.toLocaleString("en-IN")} (${aging.length} invoices)</li>
        <li><strong>Low stock SKUs:</strong> ${stats.lowStockCount}</li>
        <li><strong>Pending allowances:</strong> ${stats.pendingAllowances}</li>
      </ul>
      <h2>Zone-wise sales (current month)</h2>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <thead><tr style="background: #f1f5f9;"><th>Zone</th><th>Orders</th><th>Revenue</th><th>Dealers</th></tr></thead>
        <tbody>${zoneRows}</tbody>
      </table>
      <p style="margin-top: 24px; font-size: 12px; color: #94a3b8;">Generated by Daichi AgriFlow ERP. GST extra as applicable.</p>
    </div>
  `;
}
