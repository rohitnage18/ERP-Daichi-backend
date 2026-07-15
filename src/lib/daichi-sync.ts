import prisma from "./prisma";

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

const DEFAULT_SYNC_INTERVAL_MINUTES = 15;
let syncTimer: NodeJS.Timeout | null = null;
let syncInFlight = false;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  if (statusFilter) {
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
  const sourceUpdatedAt = parseDate(full.updatedAt);
  const sourceCreatedAt = parseDate(full.createdAt);
  const existing = await prisma.daichiDealer.findUnique({
    where: { externalId },
    select: { id: true, sourceUpdatedAt: true },
  });

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

  await prisma.$transaction(async (tx) => {
    const dealer = await tx.daichiDealer.upsert({
      where: { externalId },
      create: {
        externalId,
        syncStatus: asString(full.status) ?? "UNKNOWN",
        sourceCreatedAt,
        sourceUpdatedAt,
        lastSyncedAt: new Date(),
        firmName: asString(personal.firmName),
        firmAddress: asString(personal.firmAddress),
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
      },
      update: {
        syncStatus: asString(full.status) ?? "UNKNOWN",
        sourceCreatedAt,
        sourceUpdatedAt,
        lastSyncedAt: new Date(),
        firmName: asString(personal.firmName),
        firmAddress: asString(personal.firmAddress),
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
      },
    });

    await tx.daichiDealerPartner.deleteMany({ where: { dealerId: dealer.id } });
    await tx.daichiDealerBankAccount.deleteMany({ where: { dealerId: dealer.id } });
    await tx.daichiDealerInfrastructure.deleteMany({ where: { dealerId: dealer.id } });
    await tx.daichiDealerOtherCompany.deleteMany({ where: { dealerId: dealer.id } });
    await tx.daichiDealerSecurityCheque.deleteMany({ where: { dealerId: dealer.id } });
    await tx.daichiDealerDocumentMeta.deleteMany({ where: { dealerId: dealer.id } });

    if (partners.length) {
      await tx.daichiDealerPartner.createMany({
        data: partners.map((row, index) => ({
          dealerId: dealer.id,
          name: asString(row.name),
          age: asNumber(row.age),
          education: asString(row.education),
          experienceYears: asNumber(row.experienceYears),
          sortOrder: index,
        })),
      });
    }

    if (bankAccounts.length) {
      await tx.daichiDealerBankAccount.createMany({
        data: bankAccounts.map((row, index) => ({
          dealerId: dealer.id,
          bankName: asString(row.bankName),
          branch: asString(row.branch),
          accountType: asString(row.accountType),
          accountNumber: asString(row.accountNumber),
          overdraftLimit: asNumber(row.overdraftLimit),
          sortOrder: index,
        })),
      });
    }

    if (infrastructures.length) {
      await tx.daichiDealerInfrastructure.createMany({
        data: infrastructures.map((row, index) => ({
          dealerId: dealer.id,
          type: asString(row.type),
          ownership: asString(row.ownership),
          details: asString(row.details),
          area: asNumber(row.area),
          address: asString(row.address),
          sortOrder: index,
        })),
      });
    }

    if (otherCompanies.length) {
      await tx.daichiDealerOtherCompany.createMany({
        data: otherCompanies.map((row, index) => ({
          dealerId: dealer.id,
          companyName: asString(row.companyName),
          productDetails: asString(row.productDetails),
          annualBusiness: asString(row.annualBusiness),
          sortOrder: index,
        })),
      });
    }

    if (securityCheques.length) {
      await tx.daichiDealerSecurityCheque.createMany({
        data: securityCheques.map((row, index) => ({
          dealerId: dealer.id,
          bankName: asString(row.bankName),
          chequeNumber: asString(row.chequeNumber),
          chequeDate: parseDate(row.chequeDate),
          amount: asNumber(row.amount),
          sortOrder: index,
        })),
      });
    }

    if (documentEntries.length) {
      await tx.daichiDealerDocumentMeta.createMany({
        data: documentEntries.map(([docType, row]) => ({
          dealerId: dealer.id,
          docType,
          fileName: asString(row.fileName),
          mimeType: asString(row.mimeType),
          size: asNumber(row.size),
          storageKey: asString(row.storageKey),
          s3Key: asString(row.s3Key),
        })),
      });
    }
  });

  return existing ? "updated" : "created";
}

export async function syncDaichiDealersNow(): Promise<SyncResult> {
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

  const baseUrl = requireEnv("DAICHI_API_BASE_URL").replace(/\/+$/, "");
  const statusFilter = process.env.DAICHI_SYNC_STATUS_FILTER || "SUBMITTED";

  const token = await daichiLogin(baseUrl);
  const rows = await daichiListDealers(baseUrl, token, statusFilter);
  result.fetched = rows.length;

  for (const row of rows) {
    try {
      const externalId = row._id;
      const full = await daichiGetDealer(baseUrl, token, externalId);
      const mode = await upsertDealerRecord(externalId, full);

      if (mode === "created") result.created += 1;
      if (mode === "updated") result.updated += 1;
      if (mode === "skipped") result.skipped += 1;

      const dealer = await prisma.daichiDealer.findUnique({
        where: { externalId },
        select: { id: true },
      });
      await prisma.daichiDealerSyncLog.create({
        data: {
          dealerId: dealer?.id,
          externalId,
          result: mode.toUpperCase(),
          sourceUpdatedAt: parseDate(row.updatedAt),
          message: "Synced successfully",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";
      result.failed += 1;
      result.errors.push({ externalId: row._id, message });
      await prisma.daichiDealerSyncLog.create({
        data: {
          externalId: row._id,
          result: "FAILED",
          sourceUpdatedAt: parseDate(row.updatedAt),
          message,
          payload: serializeJson(row),
        },
      });
    }
  }

  result.finishedAt = new Date().toISOString();
  return result;
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
      const output = await syncDaichiDealersNow();
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
