import { Router } from "express";
import { getDb, ObjectId } from "../../lib/mongodb";
import { requireAuth } from "../../middleware/auth";

const router = Router();

router.use(requireAuth);

export interface Recommendation {
  _id?: ObjectId;
  farmerName: string;
  contactNumber: string;
  villageName?: string;
  districtId?: ObjectId;
  districtName?: string;
  cropType: string;
  issueType: "TECHNICAL" | "NUTRITIONAL" | "PEST_DISEASE" | "GENERAL";
  problemDescription?: string;
  recommendation?: string;
  followUpRequired: boolean;
  followUpDate?: Date;
  products: {
    productId: ObjectId;
    productName: string;
    productCode: string;
    dosage?: string;
    instructions?: string;
  }[];
  userId: ObjectId;
  userName?: string;
  createdAt: Date;
  updatedAt: Date;
}

router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    const recommendationsCol = db.collection<Recommendation>("recommendations");
    
    const { q, issueType, startDate, endDate } = req.query;
    
    const filter: Record<string, unknown> = {};
    
    if (q) {
      filter.$or = [
        { farmerName: { $regex: q, $options: "i" } },
        { cropType: { $regex: q, $options: "i" } },
        { districtName: { $regex: q, $options: "i" } },
      ];
    }
    
    if (issueType) {
      filter.issueType = issueType;
    }
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        (filter.createdAt as Record<string, Date>).$gte = new Date(startDate as string);
      }
      if (endDate) {
        (filter.createdAt as Record<string, Date>).$lte = new Date(endDate as string);
      }
    }
    
    const recommendations = await recommendationsCol
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    
    return res.json(recommendations.map((r) => ({
      ...r,
      id: r._id?.toString(),
      user: { fullName: r.userName || "Unknown" },
      products: (r.products || []).map((p) => ({
        product: {
          id: p.productId?.toString(),
          name: p.productName,
          productCode: p.productCode,
        },
        dosage: p.dosage,
        instructions: p.instructions,
      })),
    })));
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const db = await getDb();
    const recommendationsCol = db.collection<Recommendation>("recommendations");
    
    const { id } = req.params;
    
    let recommendation;
    
    if (ObjectId.isValid(id)) {
      recommendation = await recommendationsCol.findOne({ _id: new ObjectId(id) });
    }
    
    if (!recommendation) {
      return res.status(404).json({ error: "Recommendation not found" });
    }
    
    return res.json({
      ...recommendation,
      id: recommendation._id?.toString(),
      user: { fullName: recommendation.userName || "Unknown" },
      products: (recommendation.products || []).map((p) => ({
        product: {
          id: p.productId?.toString(),
          name: p.productName,
          productCode: p.productCode,
        },
        dosage: p.dosage,
        instructions: p.instructions,
      })),
    });
  } catch (error) {
    console.error("Error fetching recommendation:", error);
    return res.status(500).json({ error: "Failed to fetch recommendation" });
  }
});

router.post("/", async (req, res) => {
  try {
    const db = await getDb();
    const recommendationsCol = db.collection<Recommendation>("recommendations");
    const productsCol = db.collection("products");
    
    const user = (req as any).user;
    const {
      farmerName,
      contactNumber,
      villageName,
      districtId,
      districtName,
      cropType,
      issueType,
      problemDescription,
      recommendation,
      followUpRequired,
      followUpDate,
      productIds,
    } = req.body;
    
    let products: Recommendation["products"] = [];
    if (productIds && Array.isArray(productIds)) {
      const productDocs = await productsCol
        .find({ _id: { $in: productIds.map((id: string) => new ObjectId(id)) } })
        .toArray();
      
      products = productDocs.map((p) => ({
        productId: p._id as ObjectId,
        productName: p.name,
        productCode: p.productCode,
      }));
    }
    
    const newRecommendation: Recommendation = {
      farmerName,
      contactNumber,
      villageName,
      districtId: districtId ? new ObjectId(districtId) : undefined,
      districtName,
      cropType,
      issueType: issueType || "GENERAL",
      problemDescription,
      recommendation,
      followUpRequired: followUpRequired || false,
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
      products,
      userId: new ObjectId(user.id),
      userName: user.fullName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const result = await recommendationsCol.insertOne(newRecommendation);
    
    return res.status(201).json({
      ...newRecommendation,
      id: result.insertedId.toString(),
      _id: result.insertedId,
    });
  } catch (error) {
    console.error("Error creating recommendation:", error);
    return res.status(500).json({ error: "Failed to create recommendation" });
  }
});

export default router;
