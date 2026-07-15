import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import type { UserRole } from "@/types";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, error: null };
}

export async function requireRole(roles: UserRole[]) {
  const { session, error } = await requireSession();
  if (error) return { session: null, error };
  if (!roles.includes(session!.user.role as UserRole)) {
    return {
      session: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session, error: null };
}

export function zoneFilterForSales(session: { user: { role: string; zoneId: string | null } }) {
  if (session.user.role === "SALES_MARKETING" && session.user.zoneId) {
    return { district: { zoneId: session.user.zoneId } };
  }
  return undefined;
}
