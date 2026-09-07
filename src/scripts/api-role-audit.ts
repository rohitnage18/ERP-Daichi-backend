/**
 * Role / fuzz / latency probe against the live API.
 * Safe: GET + empty POST/PATCH that should 400/403. Does not create records.
 *
 * Run: npx tsx src/scripts/api-role-audit.ts
 */
import "dotenv/config";

const API = process.env.AUDIT_API_URL || "https://erp-daichi-backend.onrender.com";

type RoleKey = "SALES" | "ADMIN" | "LOGISTICS" | "ACCOUNT";

const USERS: Record<RoleKey, string> = {
  SALES: "sales@xenvolt.com",
  ADMIN: "admin@xenvolt.com",
  LOGISTICS: "logistics@xenvolt.com",
  ACCOUNT: "account@xenvolt.com",
};

async function login(email: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  if (!res.ok) throw new Error(`login ${email} ${res.status}`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

async function call(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; ms: number }> {
  const started = Date.now();
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    await res.arrayBuffer();
    return { status: res.status, ms: Date.now() - started };
  } catch (err) {
    return { status: 0, ms: Date.now() - started };
  }
}

const GETS = [
  "/",
  "/health",
  "/stats",
  "/api/public/stats",
  "/api/dashboard/stats",
  "/api/products",
  "/api/orders",
  "/api/dealers",
  "/api/daichi-dealers",
  "/api/invoices",
  "/api/credit-notes",
  "/api/debit-notes",
  "/api/payments",
  "/api/payments/outstanding",
  "/api/inventory",
  "/api/logistics/queue",
  "/api/reports/sales",
  "/api/reports/aging",
  "/api/reports/analytics",
  "/api/reports/monthly",
  "/api/users",
  "/api/settings",
  "/api/recommendations",
  "/api/dispatches",
  "/api/visits",
  "/api/daily-logs",
  "/api/allowances",
  "/api/zones",
  "/api/product-categories",
  "/api/emails/status",
  "/api/emails/logs",
];

const FUZZ_IDS = ["not-an-id", "000000000000000000000000", "' OR 1=1", "../", "%00", "a".repeat(80), " ", "{}"];
const FUZZ_PATHS = ["/api/products", "/api/orders", "/api/invoices", "/api/dealers", "/api/recommendations"];

async function main() {
  console.log("API audit against", API);
  const tokens = {} as Record<RoleKey, string>;
  for (const [role, email] of Object.entries(USERS) as [RoleKey, string][]) {
    tokens[role] = await login(email);
  }

  const failures: string[] = [];
  const times: number[] = [];

  for (const [role, token] of Object.entries(tokens) as [RoleKey, string][]) {
    for (const path of GETS) {
      const { status, ms } = await call(token, "GET", path);
      times.push(ms);
      if (status === 404 && path !== "/health") {
        failures.push(`${role} GET ${path} unexpected 404`);
      }
      if (status === 500 || status === 0) {
        failures.push(`${role} GET ${path} ${status}`);
      }
      if (ms > 8000) {
        failures.push(`${role} GET ${path} slow ${ms}ms`);
      }
    }

    for (const id of FUZZ_IDS) {
      for (const base of FUZZ_PATHS) {
        const { status } = await call(token, "GET", `${base}/${encodeURIComponent(id)}`);
        if (status === 500 || status === 0) {
          failures.push(`${role} GET ${base}/${id} ${status}`);
        }
      }
      const patch = await call(token, "PATCH", `/api/inventory/${encodeURIComponent(id)}`, { quantity: 1 });
      if (patch.status === 500) {
        failures.push(`${role} PATCH inventory fuzz ${id} 500`);
      }
    }

    const emptyBodies = ["/api/orders", "/api/invoices", "/api/credit-notes", "/api/debit-notes", "/api/payments"];
    for (const path of emptyBodies) {
      const emptyPost = await call(token, "POST", path, {});
      if (emptyPost.status === 500) failures.push(`${role} POST ${path} {} 500`);
    }
  }

  const burst = await Promise.all(
    Array.from({ length: 12 }, () => call(tokens.ADMIN, "GET", "/health"))
  );
  for (const hit of burst) {
    times.push(hit.ms);
    if (hit.status !== 200) failures.push(`burst /health ${hit.status}`);
  }

  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)] || 0;
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  console.log(`GET samples ${times.length} avg ${avg}ms p95 ${p95}ms max ${times[times.length - 1]}ms`);

  if (failures.length) {
    console.error("FAILURES");
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }
  console.log("API audit passed (no 500/0/unexpected 404, p95 under 8s)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
