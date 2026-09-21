import { Request, Response, NextFunction } from "express";
import jwtImport from "jsonwebtoken";

type JwtApi = {
  sign: typeof jwtImport.sign;
  verify: typeof jwtImport.verify;
};

function jwtApi(): JwtApi {
  const mod = jwtImport as unknown as JwtApi & { default?: JwtApi };
  if (typeof mod.sign === "function" && typeof mod.verify === "function") return mod;
  if (mod.default && typeof mod.default.sign === "function" && typeof mod.default.verify === "function") {
    return mod.default;
  }
  throw new Error("jsonwebtoken import is invalid");
}

export type JwtPayload = {
  id: string;
  email: string;
  name?: string;
  role: string;
  employeeId: string;
  zoneId: string | null;
  zoneName: string | null;
};

export function signToken(user: JwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  // 12h keeps client demos stable; NextAuth session maxAge must match
  return jwtApi().sign(user, secret, { expiresIn: "12h", algorithm: "HS256" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");
    req.user = jwtApi().verify(header.slice(7), secret, { algorithms: ["HS256"] }) as JwtPayload;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("requireAuth failed:", message);
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
