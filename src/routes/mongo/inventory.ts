import { Router } from "express";
import { getDb, Product, InventoryMovement, InventoryUploadLog, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";
import { parseSpreadsheet, partitionUploadRows } from "../../lib/inventory-upload";

const router = Router();

router.use(requireAuth);

const inventoryRoles = requireRole("MANAGEMENT_ADMIN", "PRODUCTION_LOGISTICS");

interface InventoryItemDoc {
  _id?: ObjectId;
  productId: ObjectId;
  quantity: number;
  reorderLevel: number;
  warehouseCode: string;
  lastUpdated: Date;
}

/** Ensure every active product has an inventory row. */
async function ensureInventoryForProducts() {
  const db = await getDb();
  const inventoryCol = db.collection<InventoryItemDoc>("inventoryItems");
  const productsCol = db.collection<Product>("products");

  const products = await productsCol.find({ status: "ACTIVE" }).toArray();
  if (products.length === 0) return;

  const existing = await inventoryCol
    .find({ productId: { $in: products.map((p) => p._id!) } })
    .project({ productId: 1 })
    .toArray();
  const have = new Set(existing.map((e) => e.productId.toString()));
  const now = new Date();
  const missing = products
    .filter((p) => p._id && !have.has(p._id.toString()))
    .map((p) => ({
      productId: p._id!,
      quantity: 0,
      reorderLevel: 10,
      warehouseCode: "PUNE-01",
      lastUpdated: now,
    }));

  if (missing.length > 0) {
    await inventoryCol.insertMany(missing);
  }
}

router.get("/", inventoryRoles, async (_req, res) => {
  try {
    await ensureInventoryForProducts();

    const db = await getDb();
    const inventoryCol = db.collection<InventoryItemDoc>("inventoryItems");
    const productsCol = db.collection<Product>("products");

    const items = await inventoryCol.find({}).toArray();
    const productIds = items.map((i) => i.productId);
    const products = await productsCol.find({ _id: { $in: productIds } }).toArray();
    const productMap = new Map(products.map((p) => [p._id!.toString(), p]));

    return res.json(
      items.map((item) => {
        const product = productMap.get(item.productId.toString());
        return {
          id: item._id?.toString(),
          productId: item.productId.toString(),
          quantity: item.quantity,
          stockRemaining: item.quantity,
          reorderLevel: item.reorderLevel,
          warehouseCode: item.warehouseCode,
          lastUpdated: item.lastUpdated,
          lowStock: item.quantity <= item.reorderLevel,
          product: product
            ? {
                id: product._id?.toString(),
                productCode: product.productCode,
                name: product.name,
                packingSize: product.packingSize,
                packingType: product.packingType,
                packingUnit: product.packingUnit,
                unitOfMeasure: product.unitOfMeasure,
                categoryName: product.categoryName,
                subCategory: {
                  name: product.subCategoryName || product.categoryName || "General",
                },
              }
            : {
                productCode: "",
                name: "Unknown",
                unitOfMeasure: "Nos",
                subCategory: { name: "General" },
              },
        };
      })
    );
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

router.get("/movements", inventoryRoles, async (req, res) => {
  try {
    const db = await getDb();
    const filter: Record<string, unknown> = {};
    if (typeof req.query.productId === "string" && ObjectId.isValid(req.query.productId)) {
      filter.productId = new ObjectId(req.query.productId);
    }
    const rows = await db
      .collection<InventoryMovement>("inventoryMovements")
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(300)
      .toArray();
    return res.json(
      rows.map((m) => ({
        ...m,
        id: m._id?.toString(),
        productId: m.productId.toString(),
        invoiceId: m.invoiceId?.toString(),
        uploadId: m.uploadId?.toString(),
      }))
    );
  } catch (error) {
    console.error("Inventory movements GET error:", error);
    return res.status(500).json({ error: "Failed to fetch inventory ledger" });
  }
});

router.get("/uploads", inventoryRoles, async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db
      .collection<InventoryUploadLog>("inventoryUploads")
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return res.json(rows.map((u) => ({ ...u, id: u._id?.toString() })));
  } catch (error) {
    console.error("Inventory uploads GET error:", error);
    return res.status(500).json({ error: "Failed to fetch upload log" });
  }
});

router.post("/upload", requireRole("MANAGEMENT_ADMIN", "PRODUCTION_LOGISTICS"), async (req, res) => {
  try {
    const fileName = String(req.body?.fileName || "inventory-upload.csv");
    let rawRows: Record<string, unknown>[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (typeof req.body?.fileBase64 === "string" && req.body.fileBase64.trim()) {
      const buffer = Buffer.from(req.body.fileBase64, "base64");
      rawRows = parseSpreadsheet(buffer, fileName);
    }
    if (rawRows.length === 0) {
      return res.status(400).json({ error: "No rows found. Upload a CSV/Excel with SKU and Quantity columns." });
    }

    const { valid, errors } = partitionUploadRows(rawRows);
    const db = await getDb();
    const productsCol = db.collection<Product>("products");
    const inventoryCol = db.collection<InventoryItemDoc>("inventoryItems");
    const now = new Date();
    let succeeded = 0;
    const rowErrors = [...errors];
    const movements: InventoryMovement[] = [];

    for (const row of valid) {
      const product = await productsCol.findOne({
        productCode: { $regex: `^${row.sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      });
      if (!product?._id) {
        rowErrors.push({ row: row.row, sku: row.sku, error: "SKU not found in product master" });
        continue;
      }
      if (row.unit && product.unitOfMeasure && row.unit !== product.unitOfMeasure.toLowerCase()) {
        const packing = (product.packingUnit || "").toLowerCase();
        if (row.unit !== packing && row.unit !== "nos") {
          rowErrors.push({
            row: row.row,
            sku: row.sku,
            error: `Unit ${row.unit} does not match product unit ${product.unitOfMeasure}`,
          });
          continue;
        }
      }
      await inventoryCol.updateOne(
        { productId: product._id },
        {
          $set: {
            quantity: row.quantity,
            lastUpdated: now,
            ...(row.warehouseCode ? { warehouseCode: row.warehouseCode } : {}),
          },
          $setOnInsert: {
            productId: product._id,
            reorderLevel: 10,
            ...(row.warehouseCode ? {} : { warehouseCode: "PUNE-01" }),
          },
        },
        { upsert: true }
      );
      movements.push({
        productId: product._id,
        sku: product.productCode,
        productName: product.name,
        quantity: row.quantity,
        type: "upload",
        warehouseCode: row.warehouseCode,
        userId: new ObjectId(req.user!.id),
        userName: req.user!.email,
        notes: `Upload ${fileName} row ${row.row}`,
        createdAt: now,
      });
      succeeded += 1;
    }

    const uploadLog: InventoryUploadLog = {
      fileName,
      uploadedById: new ObjectId(req.user!.id),
      uploadedByName: req.user!.email,
      rowsSucceeded: succeeded,
      rowsFailed: rowErrors.length,
      errors: rowErrors,
      createdAt: now,
    };
    const logResult = await db.collection<InventoryUploadLog>("inventoryUploads").insertOne(uploadLog);
    if (movements.length) {
      await db.collection<InventoryMovement>("inventoryMovements").insertMany(
        movements.map((m) => ({ ...m, uploadId: logResult.insertedId }))
      );
    }

    return res.json({
      fileName,
      rowsSucceeded: succeeded,
      rowsFailed: rowErrors.length,
      errors: rowErrors,
      uploadId: logResult.insertedId.toString(),
    });
  } catch (error) {
    console.error("Inventory upload error:", error);
    return res.status(500).json({ error: "Failed to process inventory upload" });
  }
});

/** Adjust stock for a product (set absolute qty or delta). */
router.patch(
  "/:productId",
  inventoryRoles,
  async (req, res) => {
    try {
      const { productId } = req.params;
      if (!ObjectId.isValid(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      const { quantity, delta, reorderLevel, warehouseCode } = req.body as {
        quantity?: number;
        delta?: number;
        reorderLevel?: number;
        warehouseCode?: string;
      };

      const db = await getDb();
      const inventoryCol = db.collection<InventoryItemDoc>("inventoryItems");
      const productsCol = db.collection<Product>("products");
      const oid = new ObjectId(productId);

      let product = await productsCol.findOne({ _id: oid });
      let item = await inventoryCol.findOne({ productId: oid });

      if (!product) {
        item = await inventoryCol.findOne({ _id: oid });
        if (item) {
          product = await productsCol.findOne({ _id: item.productId });
        }
      }

      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      const pid = product._id!;
      const now = new Date();

      if (!item) {
        item = await inventoryCol.findOne({ productId: pid });
      }

      if (!item) {
        const insert = await inventoryCol.insertOne({
          productId: pid,
          quantity: 0,
          reorderLevel: 10,
          warehouseCode: "PUNE-01",
          lastUpdated: now,
        });
        item = await inventoryCol.findOne({ _id: insert.insertedId });
      }

      if (!item?._id) {
        return res.status(500).json({ error: "Failed to create inventory row" });
      }

      const itemId = item._id;
      const setDoc: Record<string, unknown> = { lastUpdated: now };
      if (Number.isFinite(Number(reorderLevel))) {
        setDoc.reorderLevel = Math.max(0, Number(reorderLevel));
      }
      if (typeof warehouseCode === "string" && warehouseCode.trim()) {
        setDoc.warehouseCode = warehouseCode.trim();
      }

      if (Number.isFinite(Number(quantity))) {
        setDoc.quantity = Math.max(0, Number(quantity));
        await inventoryCol.updateOne({ _id: itemId }, { $set: setDoc });
      } else if (Number.isFinite(Number(delta))) {
        await inventoryCol.updateOne(
          { _id: itemId },
          {
            $inc: { quantity: Number(delta) },
            $set: setDoc,
          }
        );
        await inventoryCol.updateOne(
          { _id: itemId, quantity: { $lt: 0 } },
          { $set: { quantity: 0 } }
        );
      } else if (Object.keys(setDoc).length > 1) {
        await inventoryCol.updateOne({ _id: itemId }, { $set: setDoc });
      } else {
        return res.status(400).json({ error: "Provide quantity or delta" });
      }

      const updated = await inventoryCol.findOne({ _id: itemId });

      const qtyAfter = updated?.quantity ?? 0;
      const deltaApplied =
        Number.isFinite(Number(quantity))
          ? qtyAfter - (item.quantity || 0)
          : Number.isFinite(Number(delta))
            ? Number(delta)
            : 0;
      if (deltaApplied !== 0) {
        await db.collection("inventoryMovements").insertOne({
          productId: pid,
          sku: product.productCode,
          productName: product.name,
          quantity: deltaApplied,
          type: "manual_adjust",
          warehouseCode: updated?.warehouseCode,
          userId: new ObjectId(req.user!.id),
          userName: req.user!.email,
          createdAt: now,
        });
      }

      return res.json({
        id: updated?._id?.toString(),
        productId: pid.toString(),
        quantity: updated?.quantity ?? 0,
        stockRemaining: updated?.quantity ?? 0,
        reorderLevel: updated?.reorderLevel ?? 10,
        warehouseCode: updated?.warehouseCode,
        lastUpdated: updated?.lastUpdated,
        lowStock: (updated?.quantity ?? 0) <= (updated?.reorderLevel ?? 10),
      });
    } catch (error) {
      console.error("Error updating inventory:", error);
      return res.status(500).json({ error: "Failed to update inventory" });
    }
  }
);

export default router;
