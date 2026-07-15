import { Router } from "express";
import prisma from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("MANAGEMENT_ADMIN"));

router.get("/", async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        employeeId: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        zone: { select: { name: true } },
      },
      orderBy: { fullName: "asc" },
    });

    return res.json(users);
  } catch (e) {
    console.error("Users GET error:", e);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

export default router;
