import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type JwtPayload = {
  id: string;
  email: string;
  role: string;
  employeeId: string;
  zoneId: string | null;
  zoneName: string | null;
};

export function signToken(user: JwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  // 12h keeps client demos stable; NextAuth session maxAge must match
  return jwt.sign(user, secret, { expiresIn: "12h", algorithm: "HS256" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");
    req.user = jwt.verify(header.slice(7), secret, { algorithms: ["HS256"] }) as JwtPayload;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
