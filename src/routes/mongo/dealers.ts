import { Router } from "express";
import { getDb, Dealer, ObjectId } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const dealersCol = db.collection<Dealer>("dealers");
    
    const { status, q, city } = req.query;
    
    const filter: Record<string, unknown> = {};
    
    if (status && status !== "all") {
      filter.status = status;
    }
    
    if (city) {
      filter.city = { $regex: city, $options: "i" };
    }
    
    if (q) {
      filter.$or = [
        { firmName: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { contactNumber: { $regex: q, $options: "i" } },
        { gstNumber: { $regex: q, $options: "i" } },
        { dealerCode: { $regex: q, $options: "i" } },
      ];
    }
    
    const dealers = await dealersCol
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    
    return res.json(dealers.map((d) => ({
      ...d,
      id: d._id?.toString(),
    })));
  } catch (error) {
    console.error("Error fetching dealers:", error);
    return res.status(500).json({ error: "Failed to fetch dealers" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const dealersCol = db.collection<Dealer>("dealers");
    
    let dealer;
    
    if (ObjectId.isValid(req.params.id)) {
      dealer = await dealersCol.findOne({ _id: new ObjectId(req.params.id) });
    }
    
    if (!dealer) {
      dealer = await dealersCol.findOne({ dealerCode: req.params.id });
    }
    
    if (!dealer) {
      return res.status(404).json({ error: "Dealer not found" });
    }
    
    return res.json({
      ...dealer,
      id: dealer._id?.toString(),
    });
  } catch (error) {
    console.error("Error fetching dealer:", error);
    return res.status(500).json({ error: "Failed to fetch dealer" });
  }
});

router.post(
  "/",
  requireRole("SALES_MARKETING", "MANAGEMENT_ADMIN"),
  async (req, res) => {
    try {
      const db = await getDb();
      const dealersCol = db.collection<Dealer>("dealers");
      
      const count = await dealersCol.countDocuments();
      const city = req.body.city?.toUpperCase().substring(0, 3) || "XXX";
      const dealerCode = `DI/${city}/${String(count + 1).padStart(4, "0")}`;
      
      const dealer: Dealer = {
        ...req.body,
        dealerCode,
        status: "SUBMITTED",
        currentOutstanding: 0,
        createdById: new ObjectId(req.user!.id),
        createdByName: req.user!.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const result = await dealersCol.insertOne(dealer);
      
      return res.status(201).json({
        ...dealer,
        id: result.insertedId.toString(),
        _id: result.insertedId,
      });
    } catch (error) {
      console.error("Error creating dealer:", error);
      return res.status(500).json({ error: "Failed to create dealer" });
    }
  }
);

router.patch(
  "/:id",
  requireRole("SALES_MARKETING", "MANAGEMENT_ADMIN"),
  async (req, res) => {
    try {
      const db = await getDb();
      const dealersCol = db.collection<Dealer>("dealers");
      
      const { id } = req.params;
      
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid dealer ID" });
      }
      
      const updateData = {
        ...req.body,
        updatedAt: new Date(),
      };
      
      delete updateData._id;
      delete updateData.id;
      
      const result = await dealersCol.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: "after" }
      );
      
      if (!result) {
        return res.status(404).json({ error: "Dealer not found" });
      }
      
      return res.json({
        ...result,
        id: result._id?.toString(),
      });
    } catch (error) {
      console.error("Error updating dealer:", error);
      return res.status(500).json({ error: "Failed to update dealer" });
    }
  }
);

router.post(
  "/:id/approve",
  requireRole("MANAGEMENT_ADMIN"),
  async (req, res) => {
    try {
      const db = await getDb();
      const dealersCol = db.collection<Dealer>("dealers");
      
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
        creditLimit ??
        (grade && gradeLimits[grade] ? gradeLimits[grade] : 200000);
      
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid dealer ID" });
      }
      
      const result = await dealersCol.findOneAndUpdate(
        { _id: new ObjectId(id), status: "SUBMITTED" },
        {
          $set: {
            status: "APPROVED",
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
        return res.status(404).json({ error: "Dealer not found or not in submitted status" });
      }
      
      return res.json({
        ...result,
        id: result._id?.toString(),
      });
    } catch (error) {
      console.error("Error approving dealer:", error);
      return res.status(500).json({ error: "Failed to approve dealer" });
    }
  }
);

router.post(
  "/:id/reject",
  requireRole("MANAGEMENT_ADMIN"),
  async (req, res) => {
    try {
      const db = await getDb();
      const dealersCol = db.collection<Dealer>("dealers");
      
      const { id } = req.params;
      const { reason } = req.body;
      
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid dealer ID" });
      }
      
      const result = await dealersCol.findOneAndUpdate(
        { _id: new ObjectId(id), status: "SUBMITTED" },
        {
          $set: {
            status: "REJECTED",
            rejectionReason: reason || "Rejected by admin",
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );
      
      if (!result) {
        return res.status(404).json({ error: "Dealer not found or not in submitted status" });
      }
      
      return res.json({
        ...result,
        id: result._id?.toString(),
      });
    } catch (error) {
      console.error("Error rejecting dealer:", error);
      return res.status(500).json({ error: "Failed to reject dealer" });
    }
  }
);

export default router;
