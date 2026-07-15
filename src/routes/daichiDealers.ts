import { Router } from "express";
import { getDb, DaichiDealer, DaichiDealerSyncLog, ObjectId } from "../lib/mongodb";
import { requireAuth, requireRole } from "../middleware/auth";
import { getDaichiAdminToken, syncDaichiDealersNow, syncInFlight, triggerBackgroundDealerSync, getRemoteDealerCount } from "../lib/daichi-sync-mongo";

const router = Router();

router.use(requireAuth);

let lastSyncResult: {
  startedAt: string;
  finishedAt: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
} | null = null;
let syncInProgress = false;

router.post("/sync/auto", async (_req, res) => {
  const result = await triggerBackgroundDealerSync();
  return res.json(result);
});

router.post("/sync", requireRole("MANAGEMENT_ADMIN", "SALES_MARKETING"), async (req, res) => {
  if (syncInProgress || syncInFlight) {
    return res.status(409).json({ error: "Sync already in progress" });
  }

  const full = req.query.full === "true";
  
  syncInProgress = true;
  try {
    const result = await syncDaichiDealersNow({ incremental: !full });
    lastSyncResult = {
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      fetched: result.fetched,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    };
    return res.json({
      success: true,
      message: `Sync completed: ${result.created} created, ${result.updated} updated, ${result.skipped} unchanged`,
      result: lastSyncResult,
    });
  } catch (error) {
    console.error("Manual sync failed:", error);
    return res.status(500).json({ error: "Sync failed", message: String(error) });
  } finally {
    syncInProgress = false;
  }
});

router.get("/sync-status", async (_req, res) => {
  const db = await getDb();
  const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
  const localCount = await daichiDealersCol.countDocuments();

  let remoteCount: number | null = null;
  try {
    remoteCount = await getRemoteDealerCount();
  } catch {
    remoteCount = null;
  }
  
  return res.json({
    totalDealers: localCount,
    localCount,
    remoteCount,
    pendingSync: remoteCount != null ? Math.max(0, remoteCount - localCount) : null,
    syncInProgress: syncInProgress || syncInFlight,
    lastSync: lastSyncResult,
  });
});

const numericDocTypeMap: Record<string, string> = {
  "0": "panCard",
  "1": "aadharCard",
  "2": "gstCertificate",
  "3": "blankCheque",
  "4": "fertilizerLicense",
};

// In-memory cache for document URLs (expires after 50 minutes — presigned URLs typically valid ~1hr)
const docUrlCache = new Map<string, { url: string; mimeType: string; fileName: string; cachedAt: number }>();
const DOC_CACHE_TTL_MS = 50 * 60 * 1000;

function mapDocumentsWithId(documents: DaichiDealer["documents"] = []) {
  return documents.map((doc, index) => ({
    id: doc.docType || `doc-${index}`,
    ...doc,
  }));
}

async function resolveDocumentPreviewUrl(
  externalId: string,
  docType: string,
  authToken?: string
): Promise<{ url: string; mimeType: string; fileName: string } | null> {
  const sourceDocType = resolveSourceDocType(docType);
  const cacheKey = `${externalId}:${sourceDocType}`;

  const cached = getCachedDocUrl(cacheKey);
  if (cached) return cached;

  const baseUrl = (process.env.DAICHI_API_BASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) return null;

  const token = authToken || (await getDaichiAdminToken());
  const upstream = await fetch(
    `${baseUrl}/admin/dealers/${externalId}/documents/${sourceDocType}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!upstream.ok) return null;

  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;

  const json = (await upstream.json()) as {
    success?: boolean;
    data?: { downloadUrl?: string; fileName?: string; mimeType?: string };
  };

  const downloadUrl = json.data?.downloadUrl;
  if (!json.success || !downloadUrl) return null;

  const resolvedMime = json.data?.mimeType || "application/octet-stream";
  const resolvedName = json.data?.fileName || `${docType}.bin`;
  setCachedDocUrl(cacheKey, downloadUrl, resolvedMime, resolvedName);
  return { url: downloadUrl, mimeType: resolvedMime, fileName: resolvedName };
}

function getCachedDocUrl(key: string): { url: string; mimeType: string; fileName: string } | null {
  const cached = docUrlCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > DOC_CACHE_TTL_MS) {
    docUrlCache.delete(key);
    return null;
  }
  return { url: cached.url, mimeType: cached.mimeType, fileName: cached.fileName };
}

function setCachedDocUrl(key: string, url: string, mimeType: string, fileName: string): void {
  docUrlCache.set(key, { url, mimeType, fileName, cachedAt: Date.now() });
}

function resolveSourceDocType(docType: string): string {
  return numericDocTypeMap[docType] || docType;
}

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
    
    const status = (req.query.status as string | undefined) || undefined;
    const approvalStatus = (req.query.approvalStatus as string | undefined) || undefined;
    const q = (req.query.q as string | undefined)?.trim() || undefined;

    const filter: Record<string, unknown> = {};
    
    if (status) {
      filter.syncStatus = status;
    }

    if (approvalStatus) {
      filter.approvalStatus = approvalStatus;
    }
    
    if (q) {
      filter.$or = [
        { firmName: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { mobileNumber: { $regex: q, $options: "i" } },
        { externalId: { $regex: q, $options: "i" } },
      ];
    }

    const dealers = await daichiDealersCol
      .find(filter)
      .sort({ sourceUpdatedAt: -1 })
      .toArray();

    return res.json(dealers.map((d) => ({
      id: d._id?.toString(),
      externalId: d.externalId,
      syncStatus: d.syncStatus,
      firmName: d.firmName,
      email: d.email,
      mobileNumber: d.mobileNumber,
      gstNumber: d.gstNumber,
      gstNo: d.gstNumber,
      panNumber: d.panNumber,
      city: d.city || '',
      state: d.state || '',
      firmAddress: d.firmAddress || '',
      businessAddress: d.firmAddress || '',
      pincode: d.pincode || '',
      sourceCreatedAt: d.sourceCreatedAt,
      sourceUpdatedAt: d.sourceUpdatedAt,
      lastSyncedAt: d.lastSyncedAt,
      approvalStatus: d.approvalStatus || "APPROVED",
      creditLimit: d.creditLimit,
      dealerGrade: d.dealerGrade,
      contactPersonName: d.contactPersonName,
      proprietorName: d.contactPersonName,
      contactNumber: d.mobileNumber || d.telephoneNumber,
      _count: {
        partners: d.partners?.length || 0,
        bankAccounts: d.bankAccounts?.length || 0,
        infrastructures: d.infrastructures?.length || 0,
        documents: d.documents?.length || 0,
      },
      partners: d.partners || [],
      bankAccounts: d.bankAccounts || [],
      documents: mapDocumentsWithId(d.documents),
    })));
  } catch (error) {
    console.error("Error fetching Daichi dealers:", error);
    return res.status(500).json({ error: "Failed to fetch Daichi dealers" });
  }
});

router.get("/:externalId", async (req, res) => {
  try {
    const db = await getDb();
    const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
    const syncLogsCol = db.collection<DaichiDealerSyncLog>("daichiSyncLogs");
    
    let dealer = await daichiDealersCol.findOne({ externalId: req.params.externalId });
    
    if (!dealer && ObjectId.isValid(req.params.externalId)) {
      dealer = await daichiDealersCol.findOne({ _id: new ObjectId(req.params.externalId) });
    }

    if (!dealer) {
      return res.status(404).json({ error: "Daichi dealer not found" });
    }

    const syncLogs = await syncLogsCol
      .find({ externalId: dealer.externalId })
      .sort({ runAt: -1 })
      .limit(10)
      .toArray();

    return res.json({
      id: dealer._id?.toString(),
      externalId: dealer.externalId,
      syncStatus: dealer.syncStatus,
      firmName: dealer.firmName || '',
      firmAddress: dealer.firmAddress || '',
      city: dealer.city || '',
      state: dealer.state || '',
      district: dealer.district || '',
      pincode: dealer.pincode || '',
      mobileNumber: dealer.mobileNumber || '',
      telephoneNumber: dealer.telephoneNumber || '',
      email: dealer.email || '',
      gstNumber: dealer.gstNumber || '',
      gstNo: dealer.gstNumber || '',
      panNumber: dealer.panNumber || '',
      aadharNumber: dealer.aadharNumber || '',
      contactPersonName: dealer.contactPersonName || '',
      contactPersonAddress: dealer.contactPersonAddress || '',
      experienceInBusiness: dealer.experienceInBusiness || '',
      establishmentDate: dealer.establishmentDate,
      dateOfBirth: dealer.dateOfBirth,
      securityDepositAmount: dealer.securityDepositAmount,
      securityDepositPaymentMode: dealer.securityDepositPaymentMode,
      dealerDeclarationName: dealer.dealerDeclarationName,
      dealerDeclarationPlace: dealer.dealerDeclarationPlace,
      dealerDeclarationDate: dealer.dealerDeclarationDate,
      managerRemark: dealer.managerRemark,
      staffName: dealer.staffName,
      sourceCreatedAt: dealer.sourceCreatedAt,
      sourceUpdatedAt: dealer.sourceUpdatedAt,
      lastSyncedAt: dealer.lastSyncedAt,
      partners: (dealer.partners || [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row, index) => ({ id: `partner-${index}`, ...row })),
      bankAccounts: (dealer.bankAccounts || [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row, index) => ({ id: `bank-${index}`, ...row })),
      infrastructures: (dealer.infrastructures || [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row, index) => ({ id: `infra-${index}`, ...row })),
      otherCompanies: (dealer.otherCompanies || [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row, index) => ({ id: `company-${index}`, ...row })),
      securityCheques: (dealer.securityCheques || [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row, index) => ({ id: `cheque-${index}`, ...row })),
      documents: mapDocumentsWithId(dealer.documents).sort((a, b) =>
        a.docType.localeCompare(b.docType)
      ),
      syncLogs: syncLogs.map((log) => ({
        id: log.externalId,
        runAt: log.runAt,
        result: log.result,
        message: log.message,
      })),
    });
  } catch (error) {
    console.error("Error fetching Daichi dealer detail:", error);
    return res.status(500).json({ error: "Failed to fetch Daichi dealer detail" });
  }
});

router.get("/:externalId/documents", async (req, res) => {
  try {
    const db = await getDb();
    const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
    
    const dealer = await daichiDealersCol.findOne(
      { externalId: req.params.externalId },
      { projection: { externalId: 1, documents: 1 } }
    );

    if (!dealer) {
      return res.status(404).json({ error: "Daichi dealer not found" });
    }

    const docs = mapDocumentsWithId(dealer.documents).map((doc) => ({
      ...doc,
      downloadPath: `/api/daichi-dealers/${dealer.externalId}/documents/${doc.docType}/download`,
      previewPath: `/api/daichi-dealers/${dealer.externalId}/documents/${doc.docType}/preview-url`,
    }));

    return res.json(docs);
  } catch (error) {
    console.error("Error fetching Daichi dealer documents:", error);
    return res.status(500).json({ error: "Failed to fetch Daichi dealer documents" });
  }
});

router.get("/:externalId/documents/preview-urls", async (req, res) => {
  try {
    const db = await getDb();
    const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");

    const dealer = await daichiDealersCol.findOne(
      { externalId: req.params.externalId },
      { projection: { externalId: 1, documents: 1 } }
    );

    if (!dealer) {
      return res.status(404).json({ error: "Daichi dealer not found" });
    }

    const docs = dealer.documents || [];
    if (docs.length === 0) {
      return res.json({});
    }

    const token = await getDaichiAdminToken();
    const entries = await Promise.all(
      docs.map(async (doc) => {
        if (!doc.fileName) {
          return [doc.docType, null] as const;
        }
        try {
          const preview = await resolveDocumentPreviewUrl(
            dealer.externalId,
            doc.docType,
            token
          );
          return [doc.docType, preview] as const;
        } catch {
          return [doc.docType, null] as const;
        }
      })
    );

    const previews: Record<string, { url: string; mimeType: string; fileName: string }> = {};
    for (const [docType, preview] of entries) {
      if (preview) previews[docType] = preview;
    }

    return res.json(previews);
  } catch (error) {
    console.error("Error batch-fetching preview URLs:", error);
    return res.status(500).json({ error: "Failed to fetch document preview URLs" });
  }
});

router.get("/:externalId/documents/:docType/download", async (req, res) => {
  try {
    const baseUrl = (process.env.DAICHI_API_BASE_URL || "").replace(/\/+$/, "");
    if (!baseUrl) {
      return res.status(500).json({ error: "DAICHI_API_BASE_URL is not set" });
    }

    const sourceDocType = resolveSourceDocType(req.params.docType);
    const cacheKey = `${req.params.externalId}:${sourceDocType}`;
    
    // Check cache first for faster response
    const cached = getCachedDocUrl(cacheKey);
    if (cached) {
      try {
        const s3Res = await fetch(cached.url);
        if (s3Res.ok) {
          res.setHeader("Content-Type", cached.mimeType);
          res.setHeader("Content-Disposition", `attachment; filename="${cached.fileName}"`);
          const s3Buffer = Buffer.from(await s3Res.arrayBuffer());
          return res.send(s3Buffer);
        }
      } catch {
        // Cache miss or expired URL, continue to fetch fresh
        docUrlCache.delete(cacheKey);
      }
    }

    const token = await getDaichiAdminToken();
    const upstream = await fetch(
      `${baseUrl}/admin/dealers/${req.params.externalId}/documents/${sourceDocType}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Failed to fetch document from source" });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = (await upstream.json()) as {
        success?: boolean;
        data?: { downloadUrl?: string; fileName?: string; mimeType?: string };
        message?: string;
      };

      const downloadUrl = json.data?.downloadUrl;
      if (!json.success || !downloadUrl) {
        return res.status(400).json({ error: json.message || "Download URL not available" });
      }

      const resolvedMime = json.data?.mimeType || "application/octet-stream";
      const resolvedName = json.data?.fileName || `${req.params.docType}.bin`;
      
      // Cache the URL for subsequent requests
      setCachedDocUrl(cacheKey, downloadUrl, resolvedMime, resolvedName);

      const s3Res = await fetch(downloadUrl);
      if (!s3Res.ok) {
        return res.status(502).json({ error: "Failed to fetch source file from S3" });
      }

      res.setHeader("Content-Type", resolvedMime);
      res.setHeader("Content-Disposition", `attachment; filename="${resolvedName}"`);
      const s3Buffer = Buffer.from(await s3Res.arrayBuffer());
      return res.send(s3Buffer);
    }

    const fileName =
      upstream.headers.get("content-disposition") ||
      `attachment; filename="${req.params.docType}"`;

    res.setHeader("Content-Type", contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", fileName);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (error) {
    console.error("Error downloading Daichi document:", error);
    return res.status(500).json({ error: "Failed to download document" });
  }
});

// Get preview URL (returns presigned URL for client-side preview)
router.get("/:externalId/documents/:docType/preview-url", async (req, res) => {
  try {
    const preview = await resolveDocumentPreviewUrl(
      req.params.externalId,
      req.params.docType
    );

    if (!preview) {
      return res.status(400).json({ error: "Document URL not available" });
    }

    return res.json(preview);
  } catch (error) {
    console.error("Error getting Daichi document preview URL:", error);
    return res.status(500).json({ error: "Failed to get preview URL" });
  }
});

router.get("/:externalId/documents/download-all", async (req, res) => {
  try {
    const baseUrl = (process.env.DAICHI_API_BASE_URL || "").replace(/\/+$/, "");
    if (!baseUrl) {
      return res.status(500).json({ error: "DAICHI_API_BASE_URL is not set" });
    }

    const token = await getDaichiAdminToken();
    const upstream = await fetch(
      `${baseUrl}/admin/dealers/${req.params.externalId}/documents/download-all`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Failed to download documents zip" });
    }

    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/zip"
    );
    res.setHeader(
      "Content-Disposition",
      upstream.headers.get("content-disposition") ||
        `attachment; filename="dealer-${req.params.externalId}-documents.zip"`
    );

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (error) {
    console.error("Error downloading all Daichi documents:", error);
    return res.status(500).json({ error: "Failed to download all documents" });
  }
});

router.post("/:id/approve", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const db = await getDb();
    const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
    const { id } = req.params;
    const { creditLimit, dealerGrade } = req.body;

    const gradeLimits: Record<string, number> = {
      A: 500000,
      B: 400000,
      C: 300000,
      D: 200000,
    };

    const grade = dealerGrade as "A" | "B" | "C" | "D" | undefined;
    const resolvedLimit =
      creditLimit ?? (grade && gradeLimits[grade] ? gradeLimits[grade] : 200000);

    let filter: Record<string, unknown>;
    if (ObjectId.isValid(id)) {
      filter = { _id: new ObjectId(id), approvalStatus: "PENDING" };
    } else {
      filter = { externalId: id, approvalStatus: "PENDING" };
    }

    const result = await daichiDealersCol.findOneAndUpdate(
      filter,
      {
        $set: {
          approvalStatus: "APPROVED",
          creditLimit: resolvedLimit,
          dealerGrade: grade || "D",
          approvedById: new ObjectId(req.user!.id),
          approvedByName: req.user!.email,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ error: "Dealer not found or not pending approval" });
    }

    return res.json({
      ...result,
      id: result._id?.toString(),
    });
  } catch (error) {
    console.error("Error approving Daichi dealer:", error);
    return res.status(500).json({ error: "Failed to approve dealer" });
  }
});

router.post("/:id/reject", requireRole("MANAGEMENT_ADMIN"), async (req, res) => {
  try {
    const db = await getDb();
    const daichiDealersCol = db.collection<DaichiDealer>("daichiDealers");
    const { id } = req.params;
    const { reason } = req.body;

    let filter: Record<string, unknown>;
    if (ObjectId.isValid(id)) {
      filter = { _id: new ObjectId(id), approvalStatus: "PENDING" };
    } else {
      filter = { externalId: id, approvalStatus: "PENDING" };
    }

    const result = await daichiDealersCol.findOneAndUpdate(
      filter,
      {
        $set: {
          approvalStatus: "REJECTED",
          rejectionReason: reason || "Rejected by admin",
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ error: "Dealer not found or not pending approval" });
    }

    return res.json({
      ...result,
      id: result._id?.toString(),
    });
  } catch (error) {
    console.error("Error rejecting Daichi dealer:", error);
    return res.status(500).json({ error: "Failed to reject dealer" });
  }
});

export default router;
