import { Router } from "express";
import { getDb, Product, InventoryMovement, InventoryUploadLog, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";
import { parseSpreadsheet, partitionUploadRows } from "../../lib/inventory-upload";
import { applyInwardMovement, StockError } from "../../lib/inventory-stock";
import { transferWarehouseStock } from "../../lib/inventory-reservation";
import { displayCases, grandTotalCases, normalizeUnitsPerCase } from "../../lib/stock-math";

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

    const rows = items.map((item) => {
      const product = productMap.get(item.productId.toString());
      const reserved = Number((item as { reservedQuantity?: number }).reservedQuantity || 0);
      const unitsPerCase = normalizeUnitsPerCase(product?.unitsPerAlternate, 1);
      const uom = (product?.unitOfMeasure || "Nos").toLowerCase();
      const baseUnit = uom === "kg" ? "KG" : "Nos";
      const cases = displayCases(item.quantity, unitsPerCase);
      return {
        id: item._id?.toString(),
        productId: item.productId.toString(),
        quantity: item.quantity,
        reservedQuantity: reserved,
        availableQuantity: Math.max(0, item.quantity - reserved),
        stockRemaining: Math.max(0, item.quantity - reserved),
        displayCases: cases,
        unitsPerCase,
        baseUnit,
        reorderLevel: item.reorderLevel,
        warehouseCode: item.warehouseCode,
        lastUpdated: item.lastUpdated,
        lowStock: item.quantity <= item.reorderLevel,
        zeroStock: item.quantity <= 0,
        product: product
          ? {
              id: product._id?.toString(),
              productCode: product.productCode,
              name: product.name,
              packingSize: product.packingSize,
              packingType: product.packingType,
              packingUnit: product.packingUnit,
              unitOfMeasure: product.unitOfMeasure,
              unitsPerAlternate: product.unitsPerAlternate,
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
    });

    return res.json({
      items: rows,
      grandTotalCases: grandTotalCases(
        rows.map((r) => ({ baseQty: r.quantity, unitsPerCase: r.unitsPerCase }))
      ),
    });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

/** Min / max / aging snapshot for inventory manager reports. */
router.get("/levels", inventoryRoles, async (_req, res) => {
  try {
    await ensureInventoryForProducts();
    const db = await getDb();
    const items = await db.collection<InventoryItemDoc>("inventoryItems").find({}).toArray();
    const products = await db
      .collection<Product>("products")
      .find({ _id: { $in: items.map((i) => i.productId) } })
      .toArray();
    const productMap = new Map(products.map((p) => [p._id!.toString(), p]));
    const now = Date.now();
    const rows = items.map((item) => {
      const product = productMap.get(item.productId.toString());
      const reserved = Number((item as { reservedQuantity?: number }).reservedQuantity || 0);
      const ageDays = item.lastUpdated
        ? Math.floor((now - new Date(item.lastUpdated).getTime()) / (24 * 60 * 60 * 1000))
        : null;
      const min = item.reorderLevel ?? 0;
      const max = Math.max(min * 5, min + 50);
      return {
        productId: item.productId.toString(),
        sku: product?.productCode,
        name: product?.name,
        warehouseCode: item.warehouseCode,
        quantity: item.quantity,
        reservedQuantity: reserved,
        availableQuantity: Math.max(0, item.quantity - reserved),
        minLevel: min,
        maxLevel: max,
        belowMin: item.quantity <= min,
        aboveMax: item.quantity > max,
        ageDays,
        batchNumber: (product as { batchNumber?: string } | undefined)?.batchNumber || null,
      };
    });
    return res.json({
      items: rows,
      summary: {
        belowMin: rows.filter((r) => r.belowMin).length,
        aboveMax: rows.filter((r) => r.aboveMax).length,
        agingOver90: rows.filter((r) => (r.ageDays ?? 0) >= 90).length,
      },
    });
  } catch (error) {
    console.error("Inventory levels error:", error);
    return res.status(500).json({ error: "Failed to build inventory levels report" });
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

/** Add inward stock (Case or Nos/KG). Creates an INWARD ledger movement. */
router.post("/inward", inventoryRoles, async (req, res) => {
  try {
    const db = await getDb();
    const productId = String(req.body?.productId || "");
    const quantity = Number(req.body?.quantity);
    const unit = String(req.body?.unit || "NOS");
    const remarks = typeof req.body?.remarks === "string" ? req.body.remarks : undefined;
    const movementDate = req.body?.date ? new Date(req.body.date) : new Date();
    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({ error: "productId is required" });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "quantity must be a positive number" });
    }
    const result = await applyInwardMovement(db, {
      productId,
      quantity,
      unit,
      remarks,
      movementDate,
      type: "INWARD",
      userId: req.user!.id,
      userName: req.user!.email,
      warehouseCode: typeof req.body?.warehouseCode === "string" ? req.body.warehouseCode : undefined,
    });
    return res.status(201).json({
      ok: true,
      productId,
      baseQtyAdded: result.baseQty,
      quantity: result.quantity,
      type: "INWARD",
    });
  } catch (error) {
    if (error instanceof StockError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Inventory inward error:", error);
    return res.status(500).json({ error: "Failed to add inward stock" });
  }
});

/** Transfer stock between warehouses. */
router.post("/transfer", inventoryRoles, async (req, res) => {
  try {
    const db = await getDb();
    const result = await transferWarehouseStock(db, {
      productId: String(req.body?.productId || ""),
      quantity: Number(req.body?.quantity),
      fromWarehouse: String(req.body?.fromWarehouse || ""),
      toWarehouse: String(req.body?.toWarehouse || ""),
      remarks: typeof req.body?.remarks === "string" ? req.body.remarks : undefined,
      userId: req.user!.id,
      userName: req.user!.email,
    });
    return res.status(201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof StockError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Inventory transfer error:", error);
    return res.status(500).json({ error: "Failed to transfer stock" });
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
        type: "ADJUSTMENT",
        warehouseCode: row.warehouseCode,
        userId: new ObjectId(req.user!.id),
        userName: req.user!.email,
        notes: `Upload ${fileName} row ${row.row} (set absolute qty)`,
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
          type: "ADJUSTMENT",
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
