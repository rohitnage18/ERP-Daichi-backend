import { Router } from "express";
import * as XLSX from "xlsx";
import { getDb, Invoice, ObjectId } from "../lib/mongodb";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);
router.use(requireRole("MANAGEMENT_ADMIN", "ACCOUNT"));

interface GSTNInvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dealerName: string;
  dealerGstn: string;
  placeOfSupply: string;
  reverseCharge: string;
  invoiceType: string;
  eCommerceGstn: string;
  taxRate: number;
  taxableValue: number;
  cessAmount: number;
  totalInvoiceValue: number;
  items: GSTNItemData[];
}

interface GSTNItemData {
  slNo: number;
  productDescription: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxableValue: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalAmount: number;
}

function formatDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

async function fetchInvoicesForExport(
  startDate?: string,
  endDate?: string,
  dealerId?: string,
  status?: string
) {
  const db = await getDb();
  const invoicesCol = db.collection<Invoice>("invoices");
  
  const filter: Record<string, unknown> = {};

  if (startDate || endDate) {
    filter.invoiceDate = {};
    if (startDate) {
      (filter.invoiceDate as Record<string, Date>).$gte = new Date(startDate);
    }
    if (endDate) {
      (filter.invoiceDate as Record<string, Date>).$lte = new Date(endDate);
    }
  }

  if (dealerId && ObjectId.isValid(dealerId)) {
    filter.dealerId = new ObjectId(dealerId);
  }

  if (status) {
    filter.status = status;
  }

  const invoices = await invoicesCol
    .find(filter)
    .sort({ invoiceDate: 1 })
    .toArray();
  
  return invoices.map((inv) => ({
    ...inv,
    dealer: {
      firmName: inv.dealerName || "",
      gstNumber: inv.dealerGst || "",
      city: inv.dealerCity || "",
    },
  }));
}

function transformToGSTNFormat(invoices: Awaited<ReturnType<typeof fetchInvoicesForExport>>): GSTNInvoiceData[] {
  return invoices.map((inv) => ({
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: formatDate(inv.invoiceDate),
    dealerName: inv.dealer.firmName,
    dealerGstn: inv.dealer.gstNumber,
    placeOfSupply: inv.placeOfSupply || inv.dealer.city,
    reverseCharge: inv.reverseCharge ? "Y" : "N",
    invoiceType: "Regular B2B",
    eCommerceGstn: "",
    taxRate: inv.items.length > 0 ? inv.items[0].cgstRate + inv.items[0].sgstRate + inv.items[0].igstRate : 0,
    taxableValue: inv.subtotal,
    cessAmount: 0,
    totalInvoiceValue: inv.totalAmount,
    items: inv.items.map((item, idx) => ({
      slNo: idx + 1,
      productDescription: item.description || item.productName,
      hsnCode: item.hsnCode || "",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxableValue: item.taxableValue,
      cgstRate: item.cgstRate,
      cgstAmount: item.cgstAmount,
      sgstRate: item.sgstRate,
      sgstAmount: item.sgstAmount,
      igstRate: item.igstRate,
      igstAmount: item.igstAmount,
      totalAmount: item.totalAmount,
    })),
  }));
}

router.get("/gstn/json", async (req, res) => {
  try {
    const { startDate, endDate, dealerId, status } = req.query as Record<string, string>;
    
    const invoices = await fetchInvoicesForExport(startDate, endDate, dealerId, status);
    const gstnData = transformToGSTNFormat(invoices);

    const response = {
      exportDate: new Date().toISOString(),
      exportedBy: req.user!.email,
      period: {
        from: startDate || "All",
        to: endDate || "All",
      },
      summary: {
        totalInvoices: gstnData.length,
        totalTaxableValue: gstnData.reduce((sum, inv) => sum + inv.taxableValue, 0),
        totalCGST: invoices.reduce((sum, inv) => sum + inv.cgstAmount, 0),
        totalSGST: invoices.reduce((sum, inv) => sum + inv.sgstAmount, 0),
        totalIGST: invoices.reduce((sum, inv) => sum + inv.igstAmount, 0),
        totalInvoiceValue: gstnData.reduce((sum, inv) => sum + inv.totalInvoiceValue, 0),
      },
      invoices: gstnData,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="gstn-export-${formatDate(new Date())}.json"`
    );
    return res.json(response);
  } catch (error) {
    console.error("Error exporting GSTN JSON:", error);
    return res.status(500).json({ error: "Failed to export GSTN data" });
  }
});

router.get("/gstn/excel", async (req, res) => {
  try {
    const { startDate, endDate, dealerId, status } = req.query as Record<string, string>;
    
    const invoices = await fetchInvoicesForExport(startDate, endDate, dealerId, status);

    const summaryData = [
      ["GSTN Filing Export - B2B Invoices"],
      ["Export Date:", formatDate(new Date())],
      ["Period:", startDate || "All", "to", endDate || "All"],
      ["Total Invoices:", invoices.length],
      [],
    ];

    const b2bHeaders = [
      "GSTN of Recipient",
      "Recipient Name",
      "Invoice Number",
      "Invoice Date",
      "Invoice Value",
      "Place of Supply",
      "Reverse Charge",
      "Invoice Type",
      "E-Commerce GSTN",
      "Rate",
      "Taxable Value",
      "Cess Amount",
    ];

    const b2bData = invoices.map((inv) => [
      inv.dealer.gstNumber,
      inv.dealer.firmName,
      inv.invoiceNumber,
      formatDate(inv.invoiceDate),
      inv.totalAmount,
      inv.placeOfSupply || inv.dealer.city,
      inv.reverseCharge ? "Y" : "N",
      "Regular B2B",
      "",
      inv.items.length > 0 ? inv.items[0].cgstRate + inv.items[0].sgstRate + inv.items[0].igstRate : 0,
      inv.subtotal,
      0,
    ]);

    const itemHeaders = [
      "Invoice Number",
      "Sl. No",
      "Product Description",
      "HSN Code",
      "Quantity",
      "Unit Price",
      "Discount",
      "Taxable Value",
      "CGST Rate",
      "CGST Amount",
      "SGST Rate",
      "SGST Amount",
      "IGST Rate",
      "IGST Amount",
      "Total Amount",
    ];

    const itemData: (string | number)[][] = [];
    invoices.forEach((inv) => {
      inv.items.forEach((item, idx) => {
        itemData.push([
          inv.invoiceNumber,
          idx + 1,
          item.description || item.productName,
          item.hsnCode || "",
          item.quantity,
          item.unitPrice,
          item.discount,
          item.taxableValue,
          item.cgstRate,
          item.cgstAmount,
          item.sgstRate,
          item.sgstAmount,
          item.igstRate,
          item.igstAmount,
          item.totalAmount,
        ]);
      });
    });

    const hsnSummaryHeaders = [
      "HSN Code",
      "Description",
      "UQC",
      "Total Quantity",
      "Total Value",
      "Taxable Value",
      "IGST",
      "CGST",
      "SGST",
    ];

    const hsnMap = new Map<string, {
      description: string;
      quantity: number;
      totalValue: number;
      taxableValue: number;
      igst: number;
      cgst: number;
      sgst: number;
    }>();

    invoices.forEach((inv) => {
      inv.items.forEach((item) => {
        const hsn = item.hsnCode || "NA";
        const existing = hsnMap.get(hsn) || {
          description: item.description || item.productName,
          quantity: 0,
          totalValue: 0,
          taxableValue: 0,
          igst: 0,
          cgst: 0,
          sgst: 0,
        };
        existing.quantity += item.quantity;
        existing.totalValue += item.totalAmount;
        existing.taxableValue += item.taxableValue;
        existing.igst += item.igstAmount;
        existing.cgst += item.cgstAmount;
        existing.sgst += item.sgstAmount;
        hsnMap.set(hsn, existing);
      });
    });

    const hsnData = Array.from(hsnMap.entries()).map(([hsn, data]) => [
      hsn,
      data.description,
      "NOS",
      data.quantity,
      data.totalValue,
      data.taxableValue,
      data.igst,
      data.cgst,
      data.sgst,
    ]);

    const wb = XLSX.utils.book_new();

    const summaryWs = XLSX.utils.aoa_to_sheet([
      ...summaryData,
      b2bHeaders,
      ...b2bData,
    ]);
    summaryWs["!cols"] = b2bHeaders.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, summaryWs, "B2B");

    const itemsWs = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemData]);
    itemsWs["!cols"] = itemHeaders.map(() => ({ wch: 15 }));
    XLSX.utils.book_append_sheet(wb, itemsWs, "Items");

    const hsnWs = XLSX.utils.aoa_to_sheet([hsnSummaryHeaders, ...hsnData]);
    hsnWs["!cols"] = hsnSummaryHeaders.map(() => ({ wch: 15 }));
    XLSX.utils.book_append_sheet(wb, hsnWs, "HSN Summary");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="gstn-export-${formatDate(new Date())}.xlsx"`
    );
    return res.send(buffer);
  } catch (error) {
    console.error("Error exporting GSTN Excel:", error);
    return res.status(500).json({ error: "Failed to export GSTN data" });
  }
});

router.get("/invoices/excel", async (req, res) => {
  try {
    const { startDate, endDate, dealerId, status } = req.query as Record<string, string>;
    
    const invoices = await fetchInvoicesForExport(startDate, endDate, dealerId, status);

    const headers = [
      "Invoice Number",
      "Invoice Date",
      "Due Date",
      "Dealer Name",
      "Dealer GST",
      "Dealer City",
      "Subtotal",
      "CGST",
      "SGST",
      "IGST",
      "Total Tax",
      "Total Amount",
      "Paid Amount",
      "Balance",
      "Status",
      "Place of Supply",
      "E-Way Bill",
    ];

    const data = invoices.map((inv) => [
      inv.invoiceNumber,
      formatDate(inv.invoiceDate),
      formatDate(inv.dueDate),
      inv.dealer.firmName,
      inv.dealer.gstNumber,
      inv.dealer.city,
      inv.subtotal,
      inv.cgstAmount,
      inv.sgstAmount,
      inv.igstAmount,
      inv.totalTax,
      inv.totalAmount,
      inv.paidAmount,
      inv.balanceAmount,
      inv.status,
      inv.placeOfSupply || "",
      inv.eWayBillNumber || "",
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    ws["!cols"] = headers.map(() => ({ wch: 15 }));
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoices-${formatDate(new Date())}.xlsx"`
    );
    return res.send(buffer);
  } catch (error) {
    console.error("Error exporting invoices:", error);
    return res.status(500).json({ error: "Failed to export invoices" });
  }
});

export default router;
