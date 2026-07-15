import { Router } from "express";
import prisma from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

async function generateInvoiceNumber(): Promise<string> {
  const prefix = "INV";
  const year = new Date().getFullYear().toString().slice(-2);
  const month = (new Date().getMonth() + 1).toString().padStart(2, "0");
  
  const lastInvoice = await prisma.invoice.findFirst({
    where: {
      invoiceNumber: {
        startsWith: `${prefix}${year}${month}`,
      },
    },
    orderBy: { invoiceNumber: "desc" },
  });
  
  let sequence = 1;
  if (lastInvoice) {
    const lastSeq = parseInt(lastInvoice.invoiceNumber.slice(-4), 10);
    sequence = lastSeq + 1;
  }
  
  return `${prefix}${year}${month}${sequence.toString().padStart(4, "0")}`;
}

router.get("/", async (_req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: {
        dealer: {
          select: { firmName: true, city: true, gstNumber: true },
        },
        order: {
          select: { orderNumber: true },
        },
        items: {
          include: {
            product: {
              select: { name: true, productCode: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(invoices);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        dealer: true,
        order: {
          include: {
            items: {
              include: { product: true },
            },
          },
        },
        items: {
          include: {
            product: true,
          },
        },
        createdBy: { select: { fullName: true } },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Not found" });
    }

    return res.json(invoice);
  } catch (error) {
    console.error("Error fetching invoice:", error);
    return res.status(500).json({ error: "Failed" });
  }
});

interface InvoiceItemInput {
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
}

interface CreateInvoiceBody {
  dealerId: string;
  orderId?: string;
  invoiceDate?: string;
  dueDate: string;
  placeOfSupply?: string;
  reverseCharge?: boolean;
  shippingName?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPincode?: string;
  shippingGstn?: string;
  transportMode?: string;
  vehicleNumber?: string;
  eWayBillNumber?: string;
  eWayBillDate?: string;
  termsAndConditions?: string;
  bankDetails?: string;
  items: InvoiceItemInput[];
}

router.post(
  "/",
  requireRole("MANAGEMENT_ADMIN", "ACCOUNT"),
  async (req, res) => {
    try {
      const body = req.body as CreateInvoiceBody;
      
      if (!body.dealerId || !body.items || body.items.length === 0) {
        return res.status(400).json({ error: "dealerId and items are required" });
      }

      const dealer = await prisma.dealer.findUnique({
        where: { id: body.dealerId },
      });
      
      if (!dealer) {
        return res.status(404).json({ error: "Dealer not found" });
      }

      const productIds = body.items.map((item) => item.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
      });
      
      const productMap = new Map(products.map((p) => [p.id, p]));

      let subtotal = 0;
      let totalCgst = 0;
      let totalSgst = 0;
      let totalIgst = 0;

      const invoiceItems = body.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }

        const qty = item.quantity;
        const price = item.unitPrice ?? product.basePrice;
        const discount = item.discount ?? 0;
        const taxableValue = qty * price - discount;

        const cgstRate = item.cgstRate ?? (product.gstRate / 2);
        const sgstRate = item.sgstRate ?? (product.gstRate / 2);
        const igstRate = item.igstRate ?? 0;

        const cgstAmount = (taxableValue * cgstRate) / 100;
        const sgstAmount = (taxableValue * sgstRate) / 100;
        const igstAmount = (taxableValue * igstRate) / 100;
        const totalAmount = taxableValue + cgstAmount + sgstAmount + igstAmount;

        subtotal += taxableValue;
        totalCgst += cgstAmount;
        totalSgst += sgstAmount;
        totalIgst += igstAmount;

        return {
          productId: item.productId,
          description: item.description ?? product.name,
          hsnCode: product.hsnCode ?? "",
          quantity: qty,
          unitPrice: price,
          discount,
          taxableValue,
          cgstRate,
          cgstAmount,
          sgstRate,
          sgstAmount,
          igstRate,
          igstAmount,
          totalAmount,
        };
      });

      const totalTax = totalCgst + totalSgst + totalIgst;
      const totalAmount = subtotal + totalTax;

      const invoiceNumber = await generateInvoiceNumber();

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : new Date(),
          dealerId: body.dealerId,
          orderId: body.orderId || null,
          subtotal,
          cgstAmount: totalCgst,
          sgstAmount: totalSgst,
          igstAmount: totalIgst,
          totalTax,
          totalAmount,
          balanceAmount: totalAmount,
          dueDate: new Date(body.dueDate),
          status: "DRAFT",
          placeOfSupply: body.placeOfSupply,
          reverseCharge: body.reverseCharge ?? false,
          shippingName: body.shippingName,
          shippingAddress: body.shippingAddress,
          shippingCity: body.shippingCity,
          shippingState: body.shippingState,
          shippingPincode: body.shippingPincode,
          shippingGstn: body.shippingGstn,
          transportMode: body.transportMode,
          vehicleNumber: body.vehicleNumber,
          eWayBillNumber: body.eWayBillNumber,
          eWayBillDate: body.eWayBillDate ? new Date(body.eWayBillDate) : null,
          termsAndConditions: body.termsAndConditions,
          bankDetails: body.bankDetails,
          createdById: req.user!.id,
          items: {
            create: invoiceItems,
          },
        },
        include: {
          dealer: true,
          items: {
            include: { product: true },
          },
          createdBy: { select: { fullName: true } },
        },
      });

      return res.status(201).json(invoice);
    } catch (error) {
      console.error("Error creating invoice:", error);
      return res.status(500).json({ error: "Failed to create invoice" });
    }
  }
);

router.patch(
  "/:id",
  requireRole("MANAGEMENT_ADMIN", "ACCOUNT"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body;

      const existing = await prisma.invoice.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const updateData: Record<string, unknown> = {};
      
      const allowedFields = [
        "status",
        "placeOfSupply",
        "reverseCharge",
        "shippingName",
        "shippingAddress",
        "shippingCity",
        "shippingState",
        "shippingPincode",
        "shippingGstn",
        "transportMode",
        "vehicleNumber",
        "eWayBillNumber",
        "eWayBillDate",
        "irnNumber",
        "irnDate",
        "qrCode",
        "termsAndConditions",
        "bankDetails",
      ];

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          if (field === "eWayBillDate" || field === "irnDate") {
            updateData[field] = body[field] ? new Date(body[field]) : null;
          } else {
            updateData[field] = body[field];
          }
        }
      }

      const updated = await prisma.invoice.update({
        where: { id },
        data: updateData,
        include: {
          dealer: true,
          items: { include: { product: true } },
          createdBy: { select: { fullName: true } },
        },
      });

      return res.json(updated);
    } catch (error) {
      console.error("Error updating invoice:", error);
      return res.status(500).json({ error: "Failed to update invoice" });
    }
  }
);

router.post(
  "/:id/finalize",
  requireRole("MANAGEMENT_ADMIN", "ACCOUNT"),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.status !== "DRAFT") {
        return res.status(400).json({ error: "Only draft invoices can be finalized" });
      }

      const updated = await prisma.invoice.update({
        where: { id },
        data: { status: "SENT" },
        include: {
          dealer: true,
          items: { include: { product: true } },
        },
      });

      return res.json(updated);
    } catch (error) {
      console.error("Error finalizing invoice:", error);
      return res.status(500).json({ error: "Failed to finalize invoice" });
    }
  }
);

export default router;
