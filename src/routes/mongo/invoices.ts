import { Router } from "express";
import { Db } from "mongodb";
import { getDb, Invoice, Order, Dealer, Product, DaichiDealer, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";
import { sendEmail } from "../../lib/email";
import { amountToWords, getStateCodeFromGSTIN, getStateNameFromCode, getUQCCode } from "../../lib/utils";

const SUPPLIER_DETAILS = {
  name: "Daichi International",
  gstin: "27AAXFD5184H1ZT",
  pan: "AAXFD5184H",
  address: "S.No.35/2525, Om Sai Warewhouse",
  addressLine2: "Manterwadi, Urulidevachi, Tal-Haveli",
  district: "Pune",
  state: "Maharashtra",
  stateCode: "27",
  pincode: "412207",
  contact: "9822504069",
  email: "accounts@daichi-international.in",
  bankName: "Canara Bank",
  bankAccountNo: "120034852783",
  bankBranch: "Hadapsar",
  bankIfsc: "CNRB0000259",
};

const router = Router();

router.use(requireAuth);

function getFiscalYearLabel(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 3) {
    return `${String(year).slice(-2)}-${String(year + 1).slice(-2)}`;
  }
  return `${String(year - 1).slice(-2)}-${String(year).slice(-2)}`;
}

async function generateInvoiceNumber(): Promise<string> {
  const db = await getDb();
  const invoicesCol = db.collection<Invoice>("invoices");

  const now = new Date();
  const fy = getFiscalYearLabel(now);
  const prefix = `DI/`;

  const lastInvoice = await invoicesCol
    .find({ invoiceNumber: { $regex: `^DI/\\d+/${fy.replace(/-/g, "\\-")}$` } })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();

  let seq = 1;
  if (lastInvoice.length > 0) {
    const match = lastInvoice[0].invoiceNumber.match(/^DI\/(\d+)\//);
    if (match) seq = parseInt(match[1], 10) + 1;
  }

  return `${prefix}${seq}/${fy}`;
}

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const invoicesCol = db.collection<Invoice>("invoices");
    
    const { status, dealerId, startDate, endDate } = req.query;
    
    const filter: Record<string, unknown> = {};
    
    if (status && status !== "all") {
      filter.status = status;
    }
    
    if (dealerId && ObjectId.isValid(dealerId as string)) {
      filter.dealerId = new ObjectId(dealerId as string);
    }
    
    if (startDate || endDate) {
      filter.invoiceDate = {};
      if (startDate) {
        (filter.invoiceDate as Record<string, Date>).$gte = new Date(startDate as string);
      }
      if (endDate) {
        (filter.invoiceDate as Record<string, Date>).$lte = new Date(endDate as string);
      }
    }
    
    const invoices = await invoicesCol
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    
    return res.json(invoices.map((inv) => ({
      ...inv,
      id: inv._id?.toString(),
      dealer: {
        id: inv.dealerId?.toString(),
        firmName: inv.dealerName,
        city: inv.dealerCity,
        gstNumber: inv.dealerGst,
      },
      order: inv.orderId ? {
        id: inv.orderId?.toString(),
        orderNumber: inv.orderNumber,
      } : null,
    })));
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const invoicesCol = db.collection<Invoice>("invoices");
    
    const { id } = req.params;
    
    let invoice;
    
    if (ObjectId.isValid(id)) {
      invoice = await invoicesCol.findOne({ _id: new ObjectId(id) });
    }
    
    if (!invoice) {
      invoice = await invoicesCol.findOne({ invoiceNumber: id });
    }
    
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    
    const dealersCol = db.collection<Dealer>("dealers");
    const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
    let dealer: Dealer | DaichiDealer | null = null;
    
    if (invoice.dealerId) {
      dealer = await dealersCol.findOne({ _id: invoice.dealerId });
    }
    if (!dealer && invoice.dealerId) {
      dealer = await daichiDealersCol.findOne({ _id: invoice.dealerId });
    }
    
    const contactPersonName =
      invoice.contactPersonName ||
      (dealer && "contactPersonName" in dealer ? dealer.contactPersonName : undefined) ||
      (dealer && "proprietorName" in dealer ? dealer.proprietorName : undefined);
    const contactNumber =
      invoice.contactNumber ||
      (dealer && "mobileNumber" in dealer ? dealer.mobileNumber || dealer.telephoneNumber : undefined) ||
      (dealer && "contactNumber" in dealer ? dealer.contactNumber : undefined);
    
    return res.json({
      ...invoice,
      id: invoice._id?.toString(),
      contactPersonName,
      contactNumber,
      supplierContact: invoice.supplierContact || SUPPLIER_DETAILS.contact,
      supplierEmail: invoice.supplierEmail || SUPPLIER_DETAILS.email,
      bankName: invoice.bankName || SUPPLIER_DETAILS.bankName,
      bankAccountNo: invoice.bankAccountNo || SUPPLIER_DETAILS.bankAccountNo,
      bankBranch: invoice.bankBranch || SUPPLIER_DETAILS.bankBranch,
      bankIfsc: invoice.bankIfsc || SUPPLIER_DETAILS.bankIfsc,
      dealer: dealer ? {
        ...dealer,
        id: dealer._id?.toString(),
      } : {
        id: invoice.dealerId?.toString(),
        firmName: invoice.dealerName,
        city: invoice.dealerCity,
        gstNumber: invoice.dealerGst,
        businessAddress: invoice.dealerAddress,
      },
      order: invoice.orderId ? {
        id: invoice.orderId?.toString(),
        orderNumber: invoice.orderNumber,
      } : null,
      items: invoice.items.map((item) => ({
        ...item,
        id: item.productId?.toString(),
        product: {
          id: item.productId?.toString(),
          name: item.productName,
          productCode: item.productCode,
          hsnCode: item.hsnCode,
          lotSize: item.lotSize,
          packingSize: item.packingSize,
        },
      })),
      createdBy: {
        fullName: invoice.createdByName,
      },
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    return res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

interface InvoiceItemInput {
  productId: string;
  description?: string;
  lotSize?: string;
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
  orderNumber?: string;
  invoiceDate?: string;
  dueDate: string;
  placeOfSupply?: string;
  reverseCharge?: boolean;
  shippingName?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingStateCode?: string;
  shippingPincode?: string;
  shippingGstn?: string;
  transportMode?: string;
  vehicleNumber?: string;
  eWayBillNumber?: string;
  eWayBillDate?: string;
  freightCharges?: number;
  termsAndConditions?: string;
  bankDetails?: string;
  remarks?: string;
  items: InvoiceItemInput[];
}

/**
 * Build a complete Invoice document from a request body (shared by the manual
 * create route and the "generate from approved order" route). Throws on
 * validation problems; the caller maps errors to HTTP responses.
 */
async function buildInvoiceDoc(
  db: Db,
  body: CreateInvoiceBody,
  userId: string,
  userEmail: string
): Promise<Invoice> {
      const dealersCol = db.collection<Dealer>("dealers");
      const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
      const productsCol = db.collection<Product>("products");

      if (!body.dealerId || !body.items || body.items.length === 0) {
        throw new Error("dealerId and items are required");
      }
      
      let dealer: Dealer | DaichiDealer | null = null;
      let dealerGst = "";
      let dealerState = "";
      let dealerStateCode = "";
      let dealerCity = "";
      let dealerAddress = "";
      let dealerPincode = "";
      let dealerName = "";
      let dealerPan = "";
      let contactPersonName = "";
      let contactNumber = "";
      
      if (ObjectId.isValid(body.dealerId)) {
        dealer = await dealersCol.findOne({ _id: new ObjectId(body.dealerId) });
      }
      
      if (!dealer) {
        dealer = await daichiDealersCol.findOne({ 
          $or: [
            { _id: ObjectId.isValid(body.dealerId) ? new ObjectId(body.dealerId) : undefined },
            { externalId: body.dealerId }
          ].filter(Boolean) as Array<{ _id: ObjectId } | { externalId: string }>
        });
      }
      
      if (!dealer) {
        throw new Error("DEALER_NOT_FOUND");
      }
      
      const isDaichiDealer = "externalId" in dealer;

      if (isDaichiDealer) {
        const d = dealer as DaichiDealer;
        dealerName = d.firmName || "";
        dealerGst = d.gstNumber || "";
        dealerPan = d.panNumber || "";
        dealerCity = d.city || "";
        dealerState = d.state || "";
        dealerAddress = d.firmAddress || "";
        dealerPincode = d.pincode || "";
        contactPersonName = d.contactPersonName || "";
        contactNumber = d.mobileNumber || d.telephoneNumber || "";
      } else {
        const d = dealer as Dealer;
        dealerName = d.firmName || "";
        dealerGst = d.gstNumber || "";
        dealerPan = d.panNumber || "";
        dealerCity = d.city || "";
        dealerState = d.state || "";
        dealerAddress = d.businessAddress || "";
        dealerPincode = d.pinCode || "";
        contactPersonName = d.proprietorName || "";
        contactNumber = d.contactNumber || d.alternateContact || "";
      }
      
      dealerStateCode = getStateCodeFromGSTIN(dealerGst) || "";
      if (!dealerState && dealerStateCode) {
        dealerState = getStateNameFromCode(dealerStateCode);
      }
      
      const productIds = body.items.map((i) => new ObjectId(i.productId));
      const products = await productsCol.find({ _id: { $in: productIds } }).toArray();
      const productMap = new Map(products.map((p) => [p._id!.toString(), p]));
      
      let subtotal = 0;
      let totalCgst = 0;
      let totalSgst = 0;
      let totalIgst = 0;
      
      const isInterState = dealerStateCode !== SUPPLIER_DETAILS.stateCode;
      
      const invoiceItems = body.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        
        const qty = item.quantity;
        const price = item.unitPrice ?? product.basePrice;
        const discount = item.discount ?? 0;
        const taxableValue = qty * price - discount;
        
        let cgstRate = 0;
        let sgstRate = 0;
        let igstRate = 0;
        
        if (isInterState) {
          igstRate = item.igstRate ?? product.gstRate;
        } else {
          cgstRate = item.cgstRate ?? (product.gstRate / 2);
          sgstRate = item.sgstRate ?? (product.gstRate / 2);
        }
        
        const cgstAmount = (taxableValue * cgstRate) / 100;
        const sgstAmount = (taxableValue * sgstRate) / 100;
        const igstAmount = (taxableValue * igstRate) / 100;
        const totalAmount = taxableValue + cgstAmount + sgstAmount + igstAmount;
        
        subtotal += taxableValue;
        totalCgst += cgstAmount;
        totalSgst += sgstAmount;
        totalIgst += igstAmount;
        
        return {
          productId: new ObjectId(item.productId),
          productName: product.name,
          productCode: product.productCode,
          hsnCode: product.hsnCode ?? "",
          description: item.description ?? product.name,
          packingSize: product.packingSize || "",
          lotSize: item.lotSize?.trim() || product.lotSize || "",
          unitOfMeasure: "Nos",
          uqc: getUQCCode(product.unitOfMeasure || ""),
          mrp: product.mrp || product.basePrice,
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
      const freightCharges = body.freightCharges ?? 0;
      const rawTotal = subtotal + totalTax + freightCharges;
      const roundedTotal = Math.round(rawTotal);
      const roundOff = Math.round((roundedTotal - rawTotal) * 100) / 100;
      const totalAmount = roundedTotal;
      
      const invoiceNumber = await generateInvoiceNumber();
      
      const placeOfSupply = body.placeOfSupply || dealerState || dealerCity;
      const placeOfSupplyCode = dealerStateCode || getStateCodeFromGSTIN(body.shippingGstn || dealerGst) || "";
      
      const invoice: Invoice = {
        invoiceNumber,
        invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : new Date(),
        orderId: body.orderId ? new ObjectId(body.orderId) : undefined,
        orderNumber: body.orderNumber,
        
        supplierName: SUPPLIER_DETAILS.name,
        supplierGstin: SUPPLIER_DETAILS.gstin,
        supplierPan: SUPPLIER_DETAILS.pan,
        supplierAddress: SUPPLIER_DETAILS.address,
        supplierCity: SUPPLIER_DETAILS.addressLine2,
        supplierState: SUPPLIER_DETAILS.state,
        supplierStateCode: SUPPLIER_DETAILS.stateCode,
        supplierPincode: SUPPLIER_DETAILS.pincode,
        supplierContact: SUPPLIER_DETAILS.contact,
        supplierEmail: SUPPLIER_DETAILS.email,
        
        dealerId: dealer._id!,
        dealerName,
        dealerGst,
        dealerPan,
        dealerAddress,
        dealerCity,
        dealerState,
        dealerStateCode,
        dealerPincode,
        contactPersonName,
        contactNumber,
        
        items: invoiceItems,
        subtotal,
        cgstAmount: totalCgst,
        sgstAmount: totalSgst,
        igstAmount: totalIgst,
        totalTax,
        freightCharges: freightCharges || undefined,
        roundOff: roundOff !== 0 ? roundOff : undefined,
        totalAmount,
        totalAmountInWords: amountToWords(totalAmount),
        dueDate: new Date(body.dueDate),
        paidAmount: 0,
        balanceAmount: totalAmount,
        status: "DRAFT",
        logisticsStatus: "READY_FOR_DISPATCH",
        
        placeOfSupply,
        placeOfSupplyCode,
        reverseCharge: body.reverseCharge ?? false,
        invoiceType: isInterState ? "Regular B2B (Inter-State)" : "Regular B2B (Intra-State)",
        
        shippingName: body.shippingName ?? dealerName,
        shippingAddress: body.shippingAddress ?? dealerAddress,
        shippingCity: body.shippingCity ?? dealerCity,
        shippingState: body.shippingState ?? dealerState,
        shippingStateCode: body.shippingStateCode || dealerStateCode,
        shippingPincode: body.shippingPincode ?? dealerPincode,
        shippingGstn: body.shippingGstn ?? dealerGst,
        
        transportMode: body.transportMode,
        vehicleNumber: body.vehicleNumber,
        eWayBillNumber: body.eWayBillNumber,
        eWayBillDate: body.eWayBillDate ? new Date(body.eWayBillDate) : undefined,
        
        bankName: SUPPLIER_DETAILS.bankName,
        bankAccountNo: SUPPLIER_DETAILS.bankAccountNo,
        bankBranch: SUPPLIER_DETAILS.bankBranch,
        bankIfsc: SUPPLIER_DETAILS.bankIfsc,
        termsAndConditions: body.termsAndConditions,
        bankDetails: body.bankDetails,
        
        createdById: new ObjectId(userId),
        createdByName: userEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return invoice;
}

function mapInvoiceError(error: unknown): { status: number; message: string } {
  const message = error instanceof Error ? error.message : "Failed to create invoice";
  if (message === "DEALER_NOT_FOUND") return { status: 404, message: "Dealer not found" };
  if (message === "dealerId and items are required" || message.includes("not found")) {
    return { status: 400, message };
  }
  return { status: 500, message: "Failed to create invoice" };
}

router.post(
  "/",
  requireRole("MANAGEMENT_ADMIN", "ACCOUNT"),
  async (req, res) => {
    try {
      const db = await getDb();
      const invoicesCol = db.collection<Invoice>("invoices");
      const body = req.body as CreateInvoiceBody;

      const invoice = await buildInvoiceDoc(db, body, req.user!.id, req.user!.email);
      const result = await invoicesCol.insertOne(invoice);

      return res.status(201).json({
        ...invoice,
        id: result.insertedId.toString(),
        _id: result.insertedId,
      });
    } catch (error) {
      console.error("Error creating invoice:", error);
      const { status, message } = mapInvoiceError(error);
      return res.status(status).json({ error: message });
    }
  }
);

// Generate a DRAFT invoice from an approved order (Accounts / Admin).
router.post(
  "/from-order/:orderId",
  requireRole("MANAGEMENT_ADMIN", "ACCOUNT"),
  async (req, res) => {
    try {
      const db = await getDb();
      const invoicesCol = db.collection<Invoice>("invoices");
      const ordersCol = db.collection<Order>("orders");

      const { orderId } = req.params;
      if (!ObjectId.isValid(orderId)) {
        return res.status(400).json({ error: "Invalid order ID" });
      }

      const order = await ordersCol.findOne({ _id: new ObjectId(orderId) });
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.status === "DRAFT" || order.status === "PENDING_APPROVAL") {
        return res
          .status(400)
          .json({ error: "Order must be approved before generating an invoice" });
      }

      const existing = await invoicesCol.findOne({ orderId: order._id! });
      if (existing) {
        return res.status(400).json({
          error: "An invoice already exists for this order",
          invoiceId: existing._id?.toString(),
        });
      }

      // Default due date: 30 days from today.
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const body: CreateInvoiceBody = {
        dealerId: order.dealerId.toString(),
        orderId: order._id!.toString(),
        orderNumber: order.orderNumber,
        dueDate: dueDate.toISOString(),
        items: order.items.map((it) => ({
          productId: it.productId.toString(),
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
      };

      const invoice = await buildInvoiceDoc(db, body, req.user!.id, req.user!.email);
      const result = await invoicesCol.insertOne(invoice);

      return res.status(201).json({
        ...invoice,
        id: result.insertedId.toString(),
        _id: result.insertedId,
      });
    } catch (error) {
      console.error("Error generating invoice from order:", error);
      const { status, message } = mapInvoiceError(error);
      return res.status(status).json({ error: message });
    }
  }
);

router.patch(
  "/:id",
  requireRole("MANAGEMENT_ADMIN", "ACCOUNT"),
  async (req, res) => {
    try {
      const db = await getDb();
      const invoicesCol = db.collection<Invoice>("invoices");
      
      const { id } = req.params;
      
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid invoice ID" });
      }
      
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
        "termsAndConditions",
        "bankDetails",
      ];
      
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (field === "eWayBillDate" || field === "irnDate") {
            updateData[field] = req.body[field] ? new Date(req.body[field]) : null;
          } else {
            updateData[field] = req.body[field];
          }
        }
      }
      
      const result = await invoicesCol.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: "after" }
      );
      
      if (!result) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      
      return res.json({
        ...result,
        id: result._id?.toString(),
      });
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
      const db = await getDb();
      const invoicesCol = db.collection<Invoice>("invoices");
      
      const { id } = req.params;
      
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid invoice ID" });
      }
      
      const result = await invoicesCol.findOneAndUpdate(
        { _id: new ObjectId(id), status: "DRAFT" },
        {
          $set: {
            status: "SENT",
            logisticsStatus: "READY_FOR_DISPATCH",
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );
      
      if (!result) {
        return res.status(404).json({ error: "Invoice not found or not in draft status" });
      }
      
      return res.json({
        ...result,
        id: result._id?.toString(),
      });
    } catch (error) {
      console.error("Error finalizing invoice:", error);
      return res.status(500).json({ error: "Failed to finalize invoice" });
    }
  }
);

router.post(
  "/:id/send-email",
  requireRole("MANAGEMENT_ADMIN", "ACCOUNT"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { to, cc, message } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid invoice ID" });
      }
      if (!to?.trim()) {
        return res.status(400).json({ error: "Recipient email (to) is required" });
      }

      const db = await getDb();
      const invoicesCol = db.collection<Invoice>("invoices");
      const invoice = await invoicesCol.findOne({ _id: new ObjectId(id) });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const appUrl = process.env.FRONTEND_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
      const printUrl = `${appUrl}/print/invoices/${id}`;
      const dealerLabel = invoice.dealerName || "Customer";
      const amount = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(invoice.totalAmount);

      const customMessage = message?.trim()
        ? `<p>${String(message).replace(/\n/g, "<br/>")}</p>`
        : "";

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; color: #1e293b;">
          <h2 style="color: #1e40af; margin-bottom: 8px;">Tax Invoice from Daichi International</h2>
          <p>Dear ${dealerLabel},</p>
          ${customMessage}
          <p>Please find your tax invoice details below:</p>
          <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr><td style="padding: 6px 0;"><strong>Invoice No.</strong></td><td>${invoice.invoiceNumber}</td></tr>
            <tr><td style="padding: 6px 0;"><strong>Date</strong></td><td>${new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}</td></tr>
            <tr><td style="padding: 6px 0;"><strong>Amount</strong></td><td>${amount}</td></tr>
            <tr><td style="padding: 6px 0;"><strong>Status</strong></td><td>${invoice.status}</td></tr>
          </table>
          <p>
            <a href="${printUrl}" style="display: inline-block; background: #1e40af; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 6px;">
              View / Print Invoice
            </a>
          </p>
          <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
            Daichi International · accounts@daichi-international.in · 9822504069
          </p>
        </div>
      `;

      const result = await sendEmail({
        to: to.trim(),
        cc: cc?.trim() || undefined,
        subject: `Tax Invoice ${invoice.invoiceNumber} — Daichi International`,
        html,
        emailType: "INVOICE",
        sentById: req.user!.id,
      });

      if (!result.ok) {
        return res.status(500).json({ error: result.error || "Failed to send email" });
      }

      return res.json({
        ok: true,
        simulated: result.simulated,
        logId: result.logId,
        message: result.simulated
          ? "Email saved to log (configure SMTP in backend .env to send real emails)"
          : "Invoice email sent successfully",
      });
    } catch (error) {
      console.error("Error sending invoice email:", error);
      return res.status(500).json({ error: "Failed to send invoice email" });
    }
  }
);

export default router;
