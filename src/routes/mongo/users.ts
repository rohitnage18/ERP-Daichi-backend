import { Router } from "express";
import { hash } from "bcryptjs";
import { getDb, ObjectId, User } from "../../lib/mongodb";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();

const ALLOWED_ROLES = [
  "SALES_MARKETING",
  "MANAGEMENT_ADMIN",
  "PRODUCTION_LOGISTICS",
  "ACCOUNT",
] as const;

type AppRole = (typeof ALLOWED_ROLES)[number];

function isRole(value: unknown): value is AppRole {
  return typeof value === "string" && (ALLOWED_ROLES as readonly string[]).includes(value);
}

function toPublic(u: User) {
  return {
    id: u._id?.toString(),
    employeeId: u.employeeId,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    zoneId: u.zoneId ?? null,
    zoneName: u.zoneName ?? null,
    zone: u.zoneName ? { name: u.zoneName } : null,
  };
}

router.use(requireAuth, requireRole("MANAGEMENT_ADMIN"));

router.get("/", async (_req, res) => {
  try {
    const db = await getDb();
    const usersCol = db.collection<User>("users");

    const users = await usersCol
      .find({}, { projection: { password: 0 } })
      .sort({ fullName: 1 })
      .toArray();

    return res.json(users.map((u) => toPublic(u)));
  } catch (error) {
    console.error("Users GET error:", error);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/", async (req, res) => {
  try {
    const fullName = String(req.body?.fullName ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const phone = String(req.body?.phone ?? "").trim();
    const employeeId = String(req.body?.employeeId ?? "").trim();
    const role = req.body?.role;
    const password = String(req.body?.password ?? "");
    const zoneId = req.body?.zoneId ? String(req.body.zoneId) : undefined;
    const zoneName = req.body?.zoneName ? String(req.body.zoneName).trim() : undefined;

    if (!fullName || !email || !phone || !employeeId || !role || !password) {
      return res.status(400).json({ error: "Name, email, phone, employee ID, role, and password are required" });
    }
    if (!isRole(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (!email.includes("@")) {
      return res.status(400).json({ error: "Enter a valid email" });
    }

    const db = await getDb();
    const usersCol = db.collection<User>("users");

    const existingEmail = await usersCol.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ error: `A user with ${email} already exists` });
    }
    const existingEmp = await usersCol.findOne({ employeeId });
    if (existingEmp) {
      return res.status(409).json({
        error: `Employee ID "${employeeId}" is already used by ${existingEmp.fullName}`,
      });
    }

    const now = new Date();
    const user: User = {
      fullName,
      email,
      phone,
      employeeId,
      role,
      zoneId,
      zoneName: zoneName || undefined,
      password: await hash(password, 12),
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    const result = await usersCol.insertOne(user);
    user._id = result.insertedId;
    return res.status(201).json(toPublic(user));
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (err?.code === 11000) {
      return res.status(409).json({ error: "A user with this email or employee ID already exists" });
    }
    console.error("Users POST error:", error);
    return res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid user" });
    }

    const db = await getDb();
    const usersCol = db.collection<User>("users");
    const existing = await usersCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    const isSelf = req.user!.id === existing._id?.toString();
    const updates: Partial<User> = { updatedAt: new Date() };
    const unset: Record<string, 1> = {};

    if (req.body?.fullName != null) {
      const fullName = String(req.body.fullName).trim();
      if (!fullName) return res.status(400).json({ error: "Name is required" });
      updates.fullName = fullName;
    }
    if (req.body?.phone != null) {
      const phone = String(req.body.phone).trim();
      if (!phone) return res.status(400).json({ error: "Phone is required" });
      updates.phone = phone;
    }
    if (req.body?.email != null) {
      const email = String(req.body.email).trim().toLowerCase();
      if (!email.includes("@")) return res.status(400).json({ error: "Enter a valid email" });
      const clash = await usersCol.findOne({ email, _id: { $ne: existing._id } });
      if (clash) return res.status(409).json({ error: `A user with ${email} already exists` });
      updates.email = email;
    }
    if (req.body?.employeeId != null) {
      const employeeId = String(req.body.employeeId).trim();
      if (!employeeId) return res.status(400).json({ error: "Employee ID is required" });
      const clash = await usersCol.findOne({ employeeId, _id: { $ne: existing._id } });
      if (clash) {
        return res.status(409).json({
          error: `Employee ID "${employeeId}" is already used by ${clash.fullName}`,
        });
      }
      updates.employeeId = employeeId;
    }
    if (req.body?.role != null) {
      if (!isRole(req.body.role)) return res.status(400).json({ error: "Invalid role" });
      if (isSelf && req.body.role !== "MANAGEMENT_ADMIN") {
        return res.status(400).json({ error: "You cannot change your own admin role" });
      }
      updates.role = req.body.role;
    }
    if (req.body?.status != null) {
      const status = String(req.body.status);
      if (status !== "ACTIVE" && status !== "INACTIVE") {
        return res.status(400).json({ error: "Status must be ACTIVE or INACTIVE" });
      }
      if (isSelf && status !== "ACTIVE") {
        return res.status(400).json({ error: "You cannot deactivate your own account" });
      }
      updates.status = status as User["status"];
    }
    if (req.body?.zoneId !== undefined) {
      if (req.body.zoneId) updates.zoneId = String(req.body.zoneId);
      else unset.zoneId = 1;
    }
    if (req.body?.zoneName !== undefined) {
      const zoneName = String(req.body.zoneName || "").trim();
      if (zoneName) updates.zoneName = zoneName;
      else unset.zoneName = 1;
    }
    if (req.body?.password) {
      const password = String(req.body.password);
      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      updates.password = await hash(password, 12);
    }

    await usersCol.updateOne(
      { _id: existing._id },
      {
        $set: updates,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      }
    );
    const saved = await usersCol.findOne({ _id: existing._id }, { projection: { password: 0 } });
    return res.json(toPublic(saved!));
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (err?.code === 11000) {
      return res.status(409).json({ error: "A user with this email or employee ID already exists" });
    }
    console.error("Users PATCH error:", error);
    return res.status(500).json({ error: "Failed to update user" });
  }
});

export default router;
