import { Router } from "express";
import { getDb, User } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("MANAGEMENT_ADMIN"));

router.get("/", async (_req, res) => {
  try {
    const db = await getDb();
    const usersCol = db.collection<User>("users");

    const users = await usersCol
      .find({}, { projection: { password: 0 } })
      .sort({ fullName: 1 })
      .toArray();

    return res.json(
      users.map((u) => ({
        id: u._id?.toString(),
        employeeId: u.employeeId,
        email: u.email,
        fullName: u.fullName,
        phone: u.phone,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        zone: u.zoneName ? { name: u.zoneName } : null,
      }))
    );
  } catch (error) {
    console.error("Users GET error:", error);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

export default router;
