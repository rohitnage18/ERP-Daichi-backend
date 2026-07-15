import { Router } from "express";
import { compare } from "bcryptjs";
import prisma from "../lib/prisma";
import { signToken } from "../middleware/auth";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { zone: true },
    });

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValidPassword = await compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      zoneId: user.zoneId,
      zoneName: user.zone?.name ?? null,
    };

    const token = signToken(payload);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.fullName,
        role: user.role,
        employeeId: user.employeeId,
        zoneId: user.zoneId,
        zoneName: user.zone?.name ?? null,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Login failed" });
  }
});

export default router;
