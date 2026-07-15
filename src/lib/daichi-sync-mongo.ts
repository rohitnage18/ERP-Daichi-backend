import { getDb, DaichiDealer, DaichiDealerSyncLog } from "./mongodb";

type SyncResult = {
  startedAt: string;
  finishedAt: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ externalId?: string; message: string }>;
};

type DaichiListRow = {
  _id: string;
  status?: string;
  updatedAt?: string;
};

type DaichiLoginResponse = {
  success: boolean;
  message?: string;
  data?: {
    token: string;
  };
};

const DEFAULT_SYNC_INTERVAL_MINUTES = 2;
const SYNC_CONCURRENCY = 5;
let syncTimer: NodeJS.Timeout | null = null;
export let syncInFlight = false;
let lastBackgroundSyncAt = 0;
export const BACKGROUND_SYNC_DEBOUNCE_MS = 30_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

async function daichiLogin(baseUrl: string): Promise<string> {
  const email = requireEnv("DAICHI_ADMIN_EMAIL");
  const password = requireEnv("DAICHI_ADMIN_PASSWORD");

  const res = await fetch(`${baseUrl}/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Daichi login failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as DaichiLoginResponse;
  if (!json.success || !json.data?.token) {
    throw new Error(json.message || "Daichi login failed: no token");
  }
  return json.data.token;
}

export async function getDaichiAdminToken(): Promise<string> {
  const baseUrl = requireEnv("DAICHI_API_BASE_URL").replace(/\/+$/, "");
  return daichiLogin(baseUrl);
}

async function daichiListDealers(baseUrl: string, token: string, statusFilter: string): Promise<DaichiListRow[]> {
  const url = new URL(`${baseUrl}/admin/dealers`);
  const normalized = (statusFilter || "").trim().toUpperCase();
  if (normalized && normalized !== "ALL") {
    url.searchParams.set("status", statusFilter);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Daichi list dealers failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as { success?: boolean; data?: DaichiListRow[]; message?: string };
  if (!json.success || !Array.isArray(json.data)) {
    throw new Error(json.message || "Daichi list dealers failed");
  }
  return json.data;
}

async function daichiGetDealer(baseUrl: string, token: string, dealerId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl}/admin/dealers/${dealerId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Daichi dealer detail failed for ${dealerId}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    success?: boolean;
    data?: Record<string, unknown>;
    message?: string;
  };
  if (!json.success || !json.data) {
    throw new Error(json.message || `Daichi dealer detail failed for ${dealerId}`);
  }
  return json.data;
}

async function upsertDealerRecord(externalId: string, full: Record<string, unknown>): Promise<"created" | "updated" | "skipped"> {
  const db = await getDb();
  const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
  
  const sourceUpdatedAt = parseDate(full.updatedAt);
  const sourceCreatedAt = parseDate(full.createdAt);
  
  const existing = await daichiDealersCol.findOne({ externalId });

  if (
    existing?.sourceUpdatedAt &&
    sourceUpdatedAt &&
    existing.sourceUpdatedAt.getTime() === sourceUpdatedAt.getTime()
  ) {
    return "skipped";
  }

  const personal = (full.personalProfile ?? {}) as Record<string, unknown>;
  const financial = (full.financialProfile ?? {}) as Record<string, unknown>;
  const statutory = (personal.statutoryDetails ?? {}) as Record<string, unknown>;
  const declaration = (financial.dealerDeclaration ?? {}) as Record<string, unknown>;
  const managerRemarks = (financial.internalRemarks ?? {}) as Record<string, unknown>;

  const partners = asArray(personal.partners);
  const bankAccounts = asArray(financial.bankAccounts);
  const infrastructures = asArray(financial.infrastructure);
  const otherCompanies = asArray(financial.businessWithOtherCompanies);
  const securityCheques = asArray(financial.securityCheques);

  const documentSummary = (full.documentSummary ?? {}) as Record<string, unknown>;
  const documentEntries = Object.entries(documentSummary).filter(
    ([, v]) => v && typeof v === "object"
  ) as Array<[string, Record<string, unknown>]>;

  const dealerData: Omit<DaichiDealer, "_id"> = {
    externalId,
    syncStatus: asString(full.status) ?? "UNKNOWN",
    sourceCreatedAt,
    sourceUpdatedAt,
    lastSyncedAt: new Date(),
    firmName: asString(personal.firmName),
    firmAddress: asString(personal.firmAddress),
    city: asString(personal.city) || asString(personal.taluka) || "",
    state: asString(personal.state) || "",
    pincode: asString(personal.pincode) || "",
    district: asString(personal.district) || "",
    mobileNumber: asString(personal.mobileNumber),
    telephoneNumber: asString(personal.telephoneNumber),
    email: asString(personal.email),
    dateOfBirth: parseDate(personal.dateOfBirth),
    contactPersonName: asString((personal.contactPerson as Record<string, unknown> | undefined)?.name),
    contactPersonAddress: asString((personal.contactPerson as Record<string, unknown> | undefined)?.address),
    gstNumber: asString(statutory.gstNumber),
    panNumber: asString(statutory.panNumber),
    aadharNumber: asString(statutory.aadharNumber),
    experienceInBusiness: asString(personal.experienceInBusiness),
    establishmentDate: parseDate(personal.establishmentDate),
    distributorWholesalePct: asNumber((financial.distributorType as Record<string, unknown> | undefined)?.wholesalePercentage),
    distributorRetailerPct: asNumber((financial.distributorType as Record<string, unknown> | undefined)?.retailerPercentage),
    securityDepositAmount: asNumber((financial.securityDeposit as Record<string, unknown> | undefined)?.amount),
    securityDepositPaymentMode: asString((financial.securityDeposit as Record<string, unknown> | undefined)?.paymentMode),
    dealerDeclarationName: asString(declaration.dealerName),
    dealerDeclarationPlace: asString(declaration.place),
    dealerDeclarationDate: parseDate(declaration.date),
    managerRemark: asString(managerRemarks.managerRemark),
    staffName: asString(managerRemarks.staffName),
    rawPersonalProfile: serializeJson(personal),
    rawFinancialProfile: serializeJson(financial),
    rawDocuments: serializeJson(full.documentsAndTerms),
    partners: partners.map((row, index) => ({
      name: asString(row.name),
      age: asNumber(row.age),
      education: asString(row.education),
      experienceYears: asNumber(row.experienceYears),
      sortOrder: index,
    })),
    bankAccounts: bankAccounts.map((row, index) => ({
      bankName: asString(row.bankName),
      branch: asString(row.branch),
      accountType: asString(row.accountType),
      accountNumber: asString(row.accountNumber),
      overdraftLimit: asNumber(row.overdraftLimit),
      sortOrder: index,
    })),
    infrastructures: infrastructures.map((row, index) => ({
      type: asString(row.type),
      ownership: asString(row.ownership),
      details: asString(row.details),
      area: asNumber(row.area),
      address: asString(row.address),
      sortOrder: index,
    })),
    otherCompanies: otherCompanies.map((row, index) => ({
      companyName: asString(row.companyName),
      productDetails: asString(row.productDetails),
      annualBusiness: asString(row.annualBusiness),
      sortOrder: index,
    })),
    securityCheques: securityCheques.map((row, index) => ({
      bankName: asString(row.bankName),
      chequeNumber: asString(row.chequeNumber),
      chequeDate: parseDate(row.chequeDate),
      amount: asNumber(row.amount),
      sortOrder: index,
    })),
    documents: documentEntries.map(([docType, row]) => ({
      docType,
      fileName: asString(row.fileName),
      mimeType: asString(row.mimeType),
      size: asNumber(row.size),
      storageKey: asString(row.storageKey),
      s3Key: asString(row.s3Key),
    })),
    syncLogs: [],
    approvalStatus: existing?.approvalStatus ?? (existing ? "APPROVED" : "PENDING"),
    creditLimit: existing?.creditLimit,
    dealerGrade: existing?.dealerGrade,
    approvedById: existing?.approvedById,
    approvedByName: existing?.approvedByName,
    approvedAt: existing?.approvedAt,
    rejectionReason: existing?.rejectionReason,
    createdAt: existing?.createdAt ?? new Date(),
    updatedAt: new Date(),
  };

  await daichiDealersCol.updateOne(
    { externalId },
    { $set: dealerData },
    { upsert: true }
  );

  return existing ? "updated" : "created";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function syncDealerRows(
  rows: DaichiListRow[],
  baseUrl: string,
  token: string,
  result: SyncResult
): Promise<void> {
  const db = await getDb();
  const syncLogsCol = db.collection<DaichiDealerSyncLog>("daichiSyncLogs");

  await mapWithConcurrency(rows, SYNC_CONCURRENCY, async (row) => {
    try {
      const externalId = row._id;
      const full = await daichiGetDealer(baseUrl, token, externalId);
      const mode = await upsertDealerRecord(externalId, full);

      if (mode === "created") result.created += 1;
      if (mode === "updated") result.updated += 1;
      if (mode === "skipped") result.skipped += 1;

      await syncLogsCol.insertOne({
        externalId,
        runAt: new Date(),
        result: mode.toUpperCase(),
        sourceUpdatedAt: parseDate(row.updatedAt),
        message: "Synced successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";
      result.failed += 1;
      result.errors.push({ externalId: row._id, message });
      await syncLogsCol.insertOne({
        externalId: row._id,
        runAt: new Date(),
        result: "FAILED",
        sourceUpdatedAt: parseDate(row.updatedAt),
        message,
        payload: serializeJson(row),
      });
    }
  });
}

async function listRemoteDealers(): Promise<{
  baseUrl: string;
  token: string;
  rows: DaichiListRow[];
}> {
  const baseUrl = requireEnv("DAICHI_API_BASE_URL").replace(/\/+$/, "");
  const statusFilter = process.env.DAICHI_SYNC_STATUS_FILTER?.trim() || "ALL";
  const token = await daichiLogin(baseUrl);
  const rows = await daichiListDealers(baseUrl, token, statusFilter);
  return { baseUrl, token, rows };
}

async function filterRowsNeedingSync(rows: DaichiListRow[]): Promise<DaichiListRow[]> {
  const db = await getDb();
  const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
  const local = await daichiDealersCol
    .find({}, { projection: { externalId: 1, sourceUpdatedAt: 1 } })
    .toArray();

  const localMap = new Map(
    local.map((d) => [d.externalId, d.sourceUpdatedAt?.getTime() ?? 0])
  );

  return rows.filter((row) => {
    const localTime = localMap.get(row._id);
    if (localTime === undefined) return true;
    const remoteTime = parseDate(row.updatedAt)?.getTime();
    if (!remoteTime) return true;
    return remoteTime > localTime;
  });
}

export async function syncDaichiDealersNow(options?: { incremental?: boolean }): Promise<SyncResult> {
  const started = new Date();
  const result: SyncResult = {
    startedAt: started.toISOString(),
    finishedAt: started.toISOString(),
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const { baseUrl, token, rows } = await listRemoteDealers();
  result.fetched = rows.length;

  const incremental = options?.incremental !== false;
  const rowsToSync = incremental ? await filterRowsNeedingSync(rows) : rows;

  if (rowsToSync.length > 0) {
    await syncDealerRows(rowsToSync, baseUrl, token, result);
  } else if (incremental) {
    result.skipped = rows.length;
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

/** Debounced incremental sync — safe to call from any authenticated client poll. */
export async function triggerBackgroundDealerSync(): Promise<{
  triggered: boolean;
  reason?: string;
  created?: number;
  updated?: number;
}> {
  if (syncInFlight) {
    return { triggered: false, reason: "in_progress" };
  }
  const now = Date.now();
  if (now - lastBackgroundSyncAt < BACKGROUND_SYNC_DEBOUNCE_MS) {
    return { triggered: false, reason: "debounced" };
  }

  lastBackgroundSyncAt = now;
  syncInFlight = true;

  try {
    const output = await syncDaichiDealersNow({ incremental: true });
    if (output.created > 0 || output.updated > 0) {
      console.log(
        `[DaichiSync:auto] created=${output.created} updated=${output.updated} skipped=${output.skipped}`
      );
    }
    return {
      triggered: true,
      created: output.created,
      updated: output.updated,
    };
  } catch (error) {
    console.error("[DaichiSync:auto] failed:", error);
    return { triggered: false, reason: "error" };
  } finally {
    syncInFlight = false;
  }
}

export async function getRemoteDealerCount(): Promise<number> {
  const { rows } = await listRemoteDealers();
  return rows.length;
}

export function startDaichiDealerScheduler() {
  const enabled =
    !!process.env.DAICHI_API_BASE_URL &&
    !!process.env.DAICHI_ADMIN_EMAIL &&
    !!process.env.DAICHI_ADMIN_PASSWORD;

  if (!enabled) {
    console.warn("Daichi sync scheduler disabled: missing Daichi env vars.");
    return;
  }

  const intervalMinutes = Number(
    process.env.DAICHI_SYNC_INTERVAL_MINUTES || DEFAULT_SYNC_INTERVAL_MINUTES
  );
  const safeMinutes =
    Number.isFinite(intervalMinutes) && intervalMinutes > 0
      ? intervalMinutes
      : DEFAULT_SYNC_INTERVAL_MINUTES;

  if (syncTimer) {
    clearInterval(syncTimer);
  }

  const run = async () => {
    if (syncInFlight) return;
    syncInFlight = true;
    try {
      const output = await syncDaichiDealersNow({ incremental: true });
      console.log(
        `[DaichiSync] fetched=${output.fetched} created=${output.created} updated=${output.updated} skipped=${output.skipped} failed=${output.failed}`
      );
    } catch (error) {
      console.error("[DaichiSync] run failed:", error);
    } finally {
      syncInFlight = false;
    }
  };

  run().catch((error) => {
    console.error("[DaichiSync] initial run failed:", error);
  });

  syncTimer = setInterval(run, safeMinutes * 60 * 1000);
  console.log(`[DaichiSync] scheduler started (every ${safeMinutes} minutes)`);
}
