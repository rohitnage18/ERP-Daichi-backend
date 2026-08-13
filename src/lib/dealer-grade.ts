export type DealerGrade = "A" | "B" | "C" | "D" | "UNGRADED";

/**
 * Credit-limit grade — derived only, never trusted from the client.
 * ≥ 5,00,000 A | 4,00,000–4,99,999 B | 3,00,000–3,99,999 C | 2,00,000–2,99,999 D | else Ungraded
 */
export function gradeFromCreditLimit(creditLimit: unknown): DealerGrade {
  const n = typeof creditLimit === "number" ? creditLimit : Number(creditLimit);
  if (!Number.isFinite(n) || n < 200000) return "UNGRADED";
  if (n >= 500000) return "A";
  if (n >= 400000) return "B";
  if (n >= 300000) return "C";
  return "D";
}
