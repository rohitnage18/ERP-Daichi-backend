import { MongoClient, Db, Collection, ObjectId, Document } from "mongodb";

const DB_NAME = "daichi_erp";

function getMongoUri(): string {
  const uri = process.env.DATABASE_URL?.trim() || "";
  if (!uri) {
    throw new Error("DATABASE_URL environment variable is not set in backend/.env");
  }
  if (uri.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL is set to SQLite (file:./dev.db). Use your MongoDB Atlas URI: mongodb+srv://..."
    );
  }
  return uri;
}

/** Atlas-friendly options — family:4 avoids TLS failures on Node 22+/23 with IPv6 routes. */
function buildMongoClientOptions() {
  return {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    retryReads: true,
    maxPoolSize: 10,
    minPoolSize: 0,
    family: 4 as const,
  };
}

function atlasConnectionHint(error: Error): string {
  const msg = error.message || "";
  if (
    msg.includes("SSL") ||
    msg.includes("TLS") ||
    msg.includes("ReplicaSetNoPrimary") ||
    msg.includes("ServerSelectionError")
  ) {
    return [
      "MongoDB Atlas connection failed. Check:",
      "1) Atlas → Network Access → allow your IP (or 0.0.0.0/0 for dev)",
      "2) Atlas cluster is running (not paused)",
      "3) DATABASE_URL username/password are correct",
      "4) Use Node 20 LTS if errors persist on Node 23",
    ].join("\n");
  }
  return "";
}

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongoDB(): Promise<Db> {
  if (db) return db;

  const MONGODB_URI = getMongoUri();
  const MAX_RETRIES = 5;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`MongoDB connection attempt ${attempt}/${MAX_RETRIES}...`);
      client = new MongoClient(MONGODB_URI, buildMongoClientOptions());
      await client.connect();
      await client.db(DB_NAME).command({ ping: 1 });
      db = client.db(DB_NAME);
      console.log(`Connected to MongoDB: ${DB_NAME}`);

      await createIndexes();

      return db;
    } catch (error) {
      lastError = error as Error;
      console.error(`MongoDB connection attempt ${attempt} failed:`, lastError.message);
      const hint = atlasConnectionHint(lastError);
      if (hint) console.error(hint);
      if (client) {
        try {
          await client.close();
        } catch {
          /* ignore */
        }
        client = null;
      }
      db = null;
      if (attempt < MAX_RETRIES) {
        const delay = Math.min(attempt * 3000, 15000);
        console.log(`Retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.error("MongoDB connection error after all retries:", lastError);
  throw lastError;
}

export async function getDb(): Promise<Db> {
  if (!db) {
    return connectMongoDB();
  }
  return db;
}

export function getCollection<T extends Document>(name: string): Promise<Collection<T>> {
  return getDb().then((database) => database.collection<T>(name));
}

async function safeCreateIndex(
  col: Collection,
  indexSpec: Record<string, 1 | -1 | "text">,
  options: { unique?: boolean; sparse?: boolean; name?: string } = {}
): Promise<void> {
  const indexName =
    options.name ??
    Object.entries(indexSpec)
      .map(([key, value]) => `${key}_${value}`)
      .join("_");

  try {
    await col.createIndex(indexSpec, { ...options, name: indexName });
  } catch (error) {
    const err = error as { code?: number; codeName?: string; message?: string };
    if (err.code === 86 || err.codeName === "IndexKeySpecsConflict") {
      console.warn(`Recreating conflicting index ${indexName} on ${col.collectionName}`);
      try {
        await col.dropIndex(indexName);
      } catch {
        /* existing index may use a different name */
      }
      await col.createIndex(indexSpec, { ...options, name: indexName });
      return;
    }
    if (err.message?.includes("already exists")) return;
    console.warn(`Index ${indexName} on ${col.collectionName}: ${err.message}`);
  }
}

async function createIndexes(): Promise<void> {
  if (!db) return;

  const usersCol = db.collection("users");
  await safeCreateIndex(usersCol, { email: 1 }, { unique: true });
  await safeCreateIndex(usersCol, { employeeId: 1 }, { unique: true });

  const dealersCol = db.collection("dealers");
  await safeCreateIndex(dealersCol, { dealerCode: 1 }, { unique: true, sparse: true });
  await safeCreateIndex(dealersCol, { gstNumber: 1 });
  await safeCreateIndex(dealersCol, { status: 1 });
  await safeCreateIndex(dealersCol, { firmName: "text", email: "text" });

  const productsCol = db.collection("products");
  await safeCreateIndex(productsCol, { productCode: 1 }, { unique: true });
  await safeCreateIndex(productsCol, { status: 1 });
  await safeCreateIndex(productsCol, { categoryId: 1 });
  await safeCreateIndex(productsCol, { name: "text" });

  const ordersCol = db.collection("orders");
  await safeCreateIndex(ordersCol, { orderNumber: 1 }, { unique: true });
  await safeCreateIndex(ordersCol, { dealerId: 1 });
  await safeCreateIndex(ordersCol, { status: 1 });
  await safeCreateIndex(ordersCol, { createdAt: -1 });
  await safeCreateIndex(ordersCol, { status: 1, createdAt: -1 }, { name: "status_createdAt" });
  await safeCreateIndex(ordersCol, { orderDate: -1 });

  const invoicesCol = db.collection("invoices");
  await safeCreateIndex(invoicesCol, { invoiceNumber: 1 }, { unique: true });
  await safeCreateIndex(invoicesCol, { dealerId: 1 });
  await safeCreateIndex(invoicesCol, { status: 1 });
  await safeCreateIndex(invoicesCol, { invoiceDate: -1 });
  await safeCreateIndex(invoicesCol, { status: 1, dueDate: 1 }, { name: "status_dueDate" });
  await safeCreateIndex(invoicesCol, { balanceAmount: 1 });
  await safeCreateIndex(invoicesCol, { logisticsStatus: 1 });
  await safeCreateIndex(invoicesCol, { dispatchId: 1 }, { sparse: true, name: "dispatchId_sparse" });
  await safeCreateIndex(invoicesCol, { orderId: 1 }, { sparse: true, name: "orderId_sparse" });

  const daichiDealersCol = db.collection("daichiDealers");
  await safeCreateIndex(daichiDealersCol, { externalId: 1 }, { unique: true, sparse: true });
  await safeCreateIndex(daichiDealersCol, { gstNumber: 1 });
  await safeCreateIndex(daichiDealersCol, { firmName: 1 });
  await safeCreateIndex(daichiDealersCol, { approvalStatus: 1 });
  await safeCreateIndex(daichiDealersCol, { city: 1 });

  const inventoryItemsCol = db.collection("inventoryItems");
  await safeCreateIndex(inventoryItemsCol, { productId: 1 }, { unique: true });

  const paymentsCol = db.collection("payments");
  await safeCreateIndex(paymentsCol, { dealerId: 1 });
  await safeCreateIndex(paymentsCol, { createdAt: -1 });

  const creditNotesCol = db.collection("creditNotes");
  await safeCreateIndex(creditNotesCol, { status: 1 });
  await safeCreateIndex(creditNotesCol, { dealerId: 1 });
  await safeCreateIndex(creditNotesCol, { createdAt: -1 });
  await safeCreateIndex(creditNotesCol, { creditNoteNumber: 1 }, { unique: true, sparse: true });

  const debitNotesCol = db.collection("debitNotes");
  await safeCreateIndex(debitNotesCol, { status: 1 });
  await safeCreateIndex(debitNotesCol, { dealerId: 1 });
  await safeCreateIndex(debitNotesCol, { createdAt: -1 });
  await safeCreateIndex(debitNotesCol, { debitNoteNumber: 1 }, { unique: true, sparse: true });

  const paymentAllocIdxCol = db.collection("payments");
  await safeCreateIndex(paymentAllocIdxCol, { paymentDate: -1 });

  const appSettingsCol = db.collection("appSettings");
  await safeCreateIndex(appSettingsCol, { key: 1 }, { unique: true });

  const recommendationsCol = db.collection("recommendations");
  await safeCreateIndex(recommendationsCol, { createdAt: -1 });

  const categoriesCol = db.collection("productCategories");
  await safeCreateIndex(categoriesCol, { name: 1 }, { unique: true });

  const dispatchesCol = db.collection("dispatches");
  await safeCreateIndex(dispatchesCol, { dispatchNumber: 1 }, { unique: true });
  await safeCreateIndex(dispatchesCol, { orderId: 1 });
  await safeCreateIndex(dispatchesCol, { invoiceId: 1 }, { sparse: true, name: "invoiceId_sparse" });
  await safeCreateIndex(dispatchesCol, { status: 1, createdAt: -1 }, { name: "status_createdAt" });

  const dailyLogsCol = db.collection("dailyLogs");
  await safeCreateIndex(dailyLogsCol, { userId: 1, logDate: 1 }, { unique: true, name: "userId_logDate" });

  const visitsCol = db.collection("salesVisits");
  await safeCreateIndex(visitsCol, { userId: 1, visitDate: -1 }, { name: "userId_visitDate" });

  const allowancesCol = db.collection("allowanceClaims");
  await safeCreateIndex(allowancesCol, { userId: 1, claimDate: -1 }, { name: "userId_claimDate" });

  const emailLogsCol = db.collection("emailLogs");
  await safeCreateIndex(emailLogsCol, { createdAt: -1 });
  await safeCreateIndex(emailLogsCol, { emailType: 1, createdAt: -1 });

  console.log("MongoDB indexes created");
}

export async function closeMongoDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("MongoDB connection closed");
  }
}

export { ObjectId };

export interface User {
  _id?: ObjectId;
  employeeId: string;
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role: "SALES_MARKETING" | "MANAGEMENT_ADMIN" | "PRODUCTION_LOGISTICS" | "ACCOUNT";
  status: "ACTIVE" | "INACTIVE";
  zoneId?: string;
  zoneName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductCategory {
  _id?: ObjectId;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductSubCategory {
  _id?: ObjectId;
  name: string;
  categoryId: ObjectId;
  categoryName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  _id?: ObjectId;
  productCode: string;
  name: string;
  categoryId: ObjectId;
  categoryName?: string;
  subCategoryId?: ObjectId;
  subCategoryName?: string;
  unitOfMeasure: string;
  basePrice: number;
  mrp?: number;
  gstRate: number;
  hsnCode?: string;
  packingType?: "LIQUID" | "POWDER_GRANULES";
  packingSize?: string;
  /** Alternate (bulk) unit label: Case / Box / Bag. */
  alternateUnit?: string;
  /** Base units contained in one alternate unit, e.g. 1 Case = 6 Nos. */
  unitsPerAlternate?: number;
  batchNumber?: string;
  lotSize?: string;
  description?: string;
  technicalSpecs?: string;
  usageInstructions?: string;
  targetCrops?: string;
  applicationMethod?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

export interface Dealer {
  _id?: ObjectId;
  dealerCode?: string;
  firmName: string;
  proprietorName: string;
  contactNumber: string;
  alternateContact?: string;
  email: string;
  gstNumber: string;
  panNumber: string;
  aadharNumber?: string;
  businessAddress: string;
  city: string;
  state?: string;
  districtId?: string;
  districtName?: string;
  pinCode: string;
  bankName: string;
  bankAccountNumber: string;
  ifscCode: string;
  yearsInBusiness: number;
  annualTurnover: string;
  creditPeriod: string;
  existingBrands?: string;
  godownAvailable: boolean;
  godownSize?: number;
  vehicleAvailable: boolean;
  referenceName?: string;
  referenceContact?: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  rejectionReason?: string;
  creditLimit?: number;
  dealerGrade?: "A" | "B" | "C" | "D";
  currentOutstanding: number;
  createdById: ObjectId;
  createdByName?: string;
  approvedById?: ObjectId;
  approvedByName?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  _id?: ObjectId;
  orderNumber: string;
  orderDate: Date;
  dealerId: ObjectId;
  dealerName?: string;
  dealerCity?: string;
  deliveryAddress: string;
  requestedDeliveryDate?: Date;
  specialInstructions?: string;
  items: OrderItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PROCESSING" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
  rejectionReason?: string;
  createdById: ObjectId;
  createdByName?: string;
  approvedById?: ObjectId;
  approvedByName?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  productId: ObjectId;
  productName: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  taxAmount: number;
  totalAmount: number;
  packingSize?: string;
  unitOfMeasure?: string;
  alternateUnit?: string;
  unitsPerAlternate?: number;
}

export interface Invoice {
  _id?: ObjectId;
  invoiceNumber: string;
  invoiceDate: Date;
  orderId?: ObjectId;
  orderNumber?: string;
  
  supplierName?: string;
  supplierGstin?: string;
  supplierAddress?: string;
  supplierCity?: string;
  supplierState?: string;
  supplierStateCode?: string;
  supplierPincode?: string;
  supplierPan?: string;
  supplierContact?: string;
  supplierEmail?: string;
  
  dealerId: ObjectId;
  dealerName?: string;
  dealerGst?: string;
  dealerPan?: string;
  dealerAddress?: string;
  dealerCity?: string;
  dealerState?: string;
  dealerStateCode?: string;
  dealerPincode?: string;
  
  items: InvoiceItem[];
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  freightCharges?: number;
  roundOff?: number;
  totalAmount: number;
  totalAmountInWords?: string;
  dueDate: Date;
  paidAmount: number;
  /** Total value reduced by approved credit notes. */
  creditAdjustment?: number;
  /** Total value added by approved debit notes. */
  debitAdjustment?: number;
  balanceAmount: number;
  status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
  logisticsStatus?: "READY_FOR_DISPATCH" | "PROCESSING" | "DISPATCHED" | "DELIVERED";
  dispatchId?: ObjectId;
  
  placeOfSupply?: string;
  placeOfSupplyCode?: string;
  reverseCharge: boolean;
  invoiceType?: string;
  
  shippingName?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingStateCode?: string;
  shippingPincode?: string;
  shippingGstn?: string;
  
  contactPersonName?: string;
  contactNumber?: string;
  
  transportMode?: string;
  vehicleNumber?: string;
  eWayBillNumber?: string;
  eWayBillDate?: Date;
  deliveryNote?: string;
  referenceNo?: string;
  dispatchDocNo?: string;
  deliveryNoteDate?: Date;
  destination?: string;
  paymentTerms?: string;
  otherReferences?: string;
  termsOfDelivery?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankBranch?: string;
  bankIfsc?: string;
  irnNumber?: string;
  irnDate?: Date;
  qrCode?: string;
  
  termsAndConditions?: string;
  bankDetails?: string;
  remarks?: string;
  
  createdById: ObjectId;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItem {
  productId: ObjectId;
  productName: string;
  productCode: string;
  hsnCode?: string;
  description?: string;
  packingSize?: string;
  lotSize?: string;
  unitOfMeasure?: string;
  uqc?: string;
  mrp?: number;
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

export interface CreditNote {
  _id?: ObjectId;
  creditNoteNumber: string;
  creditNoteDate: Date;
  invoiceId: ObjectId;
  invoiceNumber?: string;
  dealerId: ObjectId;
  dealerName?: string;
  /** Basis of the note: PAYMENT (financial adjustment) or PRODUCT (goods return). */
  basis?: "PAYMENT" | "PRODUCT";
  type: string;
  reason: string;
  amount: number;
  /** Whether the approved amount has been applied to the linked invoice balance. */
  appliedToInvoice?: boolean;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";
  approvedById?: ObjectId;
  approvedByName?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  createdById?: ObjectId;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DebitNote {
  _id?: ObjectId;
  debitNoteNumber: string;
  debitNoteDate: Date;
  invoiceId: ObjectId;
  invoiceNumber?: string;
  dealerId: ObjectId;
  dealerName?: string;
  type: string;
  reason: string;
  amount: number;
  appliedToInvoice?: boolean;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";
  approvedById?: ObjectId;
  approvedByName?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  createdById?: ObjectId;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentAllocation {
  invoiceId: ObjectId;
  invoiceNumber?: string;
  amount: number;
}

export interface Payment {
  _id?: ObjectId;
  dealerId: ObjectId;
  dealerName?: string;
  paymentMode: string;
  amount: number;
  netAmount: number;
  tdsDeducted: number;
  paymentDate: Date;
  referenceNumber?: string;
  notes?: string;
  /** Invoices this payment was applied to. */
  allocations?: PaymentAllocation[];
  /** Amount not applied to any invoice (advance / on-account). */
  unallocatedAmount?: number;
  recordedById: ObjectId;
  recordedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Zone {
  _id?: ObjectId;
  name: string;
  code: string;
  divisionId?: ObjectId;
  divisionName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface District {
  _id?: ObjectId;
  name: string;
  code: string;
  zoneId: ObjectId;
  zoneName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DaichiDealer {
  _id?: ObjectId;
  externalId: string;
  syncStatus: string;
  sourceCreatedAt?: Date;
  sourceUpdatedAt?: Date;
  lastSyncedAt: Date;
  firmName?: string;
  firmAddress?: string;
  city?: string;
  state?: string;
  pincode?: string;
  district?: string;
  mobileNumber?: string;
  telephoneNumber?: string;
  email?: string;
  dateOfBirth?: Date;
  contactPersonName?: string;
  contactPersonAddress?: string;
  gstNumber?: string;
  panNumber?: string;
  aadharNumber?: string;
  experienceInBusiness?: string;
  establishmentDate?: Date;
  distributorWholesalePct?: number;
  distributorRetailerPct?: number;
  securityDepositAmount?: number;
  securityDepositPaymentMode?: string;
  dealerDeclarationName?: string;
  dealerDeclarationPlace?: string;
  dealerDeclarationDate?: Date;
  managerRemark?: string;
  staffName?: string;
  rawPersonalProfile?: string;
  rawFinancialProfile?: string;
  rawDocuments?: string;
  partners: DaichiDealerPartner[];
  bankAccounts: DaichiDealerBankAccount[];
  infrastructures: DaichiDealerInfrastructure[];
  otherCompanies: DaichiDealerOtherCompany[];
  securityCheques: DaichiDealerSecurityCheque[];
  documents: DaichiDealerDocumentMeta[];
  syncLogs: DaichiDealerSyncLog[];
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  creditLimit?: number;
  dealerGrade?: "A" | "B" | "C" | "D";
  approvedById?: ObjectId;
  approvedByName?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DaichiDealerPartner {
  name?: string;
  age?: number;
  education?: string;
  experienceYears?: number;
  sortOrder: number;
}

export interface DaichiDealerBankAccount {
  bankName?: string;
  branch?: string;
  accountType?: string;
  accountNumber?: string;
  overdraftLimit?: number;
  sortOrder: number;
}

export interface DaichiDealerInfrastructure {
  type?: string;
  ownership?: string;
  details?: string;
  area?: number;
  address?: string;
  sortOrder: number;
}

export interface DaichiDealerOtherCompany {
  companyName?: string;
  productDetails?: string;
  annualBusiness?: string;
  sortOrder: number;
}

export interface DaichiDealerSecurityCheque {
  bankName?: string;
  chequeNumber?: string;
  chequeDate?: Date;
  amount?: number;
  sortOrder: number;
}

export interface DaichiDealerDocumentMeta {
  docType: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  storageKey?: string;
  s3Key?: string;
}

export interface DaichiDealerSyncLog {
  externalId?: string;
  runAt: Date;
  result: string;
  sourceUpdatedAt?: Date;
  message?: string;
  payload?: string;
}

export interface Dispatch {
  _id?: ObjectId;
  dispatchNumber: string;
  orderId?: ObjectId;
  orderNumber?: string;
  invoiceId?: ObjectId;
  invoiceNumber?: string;
  dealerName?: string;
  deliveryAddress?: string;
  dealerCity?: string;
  totalAmount?: number;
  logisticsPartner: string;
  vehicleNumber: string;
  driverName?: string;
  driverContact?: string;
  status: "PENDING" | "PACKED" | "DISPATCHED" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED";
  dispatchDate: Date;
  actualDeliveryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyLog {
  _id?: ObjectId;
  logDate: Date;
  userId: ObjectId;
  userName?: string;
  dayStartTime?: Date;
  dayEndTime?: Date;
  summary: string;
  dealersVisited: number;
  ordersDiscussed: number;
  openingKm?: number;
  closingKm?: number;
  kilometersTraveled?: number;
  // Daily achievement report
  salesAmount?: number;
  collectionAmount?: number;
  newDealersAppointed?: number;
  achievementNotes?: string;
  expensesSummary?: string;
  odometerPhoto?: string;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  status: "DRAFT" | "SUBMITTED";
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesVisit {
  _id?: ObjectId;
  visitDate: Date;
  userId: ObjectId;
  userName?: string;
  dealerId?: ObjectId;
  dealerName?: string;
  prospectName?: string;
  purpose: string;
  personsMet: string;
  discussionNotes: string;
  nextAction?: string;
  followUpDate?: Date;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  odometerPhoto?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AllowanceClaim {
  _id?: ObjectId;
  claimDate: Date;
  userId: ObjectId;
  userName?: string;
  claimType: string;
  amount: number;
  description: string;
  kilometers?: number;
  receiptNote?: string;
  odometerPhoto?: string;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason?: string;
  approvedById?: ObjectId;
  approvedByName?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocationTrack {
  _id?: ObjectId;
  userId: ObjectId;
  userName?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  source: string;
  visitId?: ObjectId;
  addressLabel?: string;
  recordedAt: Date;
}
