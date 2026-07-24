import { Router, Request, Response } from "express";
import { compare } from "bcryptjs";
import { getDb, User } from "../../lib/mongodb";
import { signToken } from "../../middleware/auth";

const router = Router();

/** Simple in-memory login rate limit: 10 attempts / 15 min per IP+email */
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 10;

function loginKey(req: Request, email: string) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `${ip}:${email}`;
}

function checkLoginRateLimit(req: Request, email: string): boolean {
  const key = loginKey(req, email);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= LOGIN_MAX;
}

router.post("/login", async (req, res: Response) => {
  try {
    const emailRaw = typeof req.body?.email === "string" ? req.body.email : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const email = emailRaw.trim().toLowerCase();

    if (!email || !password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!checkLoginRateLimit(req, email)) {
      return res.status(429).json({ error: "Too many login attempts. Try again later." });
    }

    const db = await getDb();
    const usersCol = db.collection<User>("users");

    // Support both stored casing and lowercase emails
    const user =
      (await usersCol.findOne({ email })) ||
      (await usersCol.findOne({ email: emailRaw.trim() }));

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValidPassword = await compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const payload = {
      id: user._id!.toString(),
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      zoneId: user.zoneId ?? null,
      zoneName: user.zoneName ?? null,
    };

    const token = signToken(payload);

    return res.json({
      token,
      user: {
        id: user._id!.toString(),
        email: user.email,
        name: user.fullName,
        role: user.role,
        employeeId: user.employeeId,
        zoneId: user.zoneId ?? null,
        zoneName: user.zoneName ?? null,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Login failed" });
  }
});

export default router;
