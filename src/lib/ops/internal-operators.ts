/**
 * Sachin and Aditya accounts are excluded from customer activity reporting
 * and from login-alert emails. Plus-aliases (`sachin+admin@…`) count too.
 */
const INTERNAL_OPERATOR_LOCAL_PARTS = new Set(["sachin", "aditya"]);

export function emailLocalPartBase(email: string | null | undefined): string {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return "";
  const at = normalized.indexOf("@");
  const local = at === -1 ? normalized : normalized.slice(0, at);
  const plus = local.indexOf("+");
  return plus === -1 ? local : local.slice(0, plus);
}

export function isInternalOperatorEmail(
  email: string | null | undefined
): boolean {
  return INTERNAL_OPERATOR_LOCAL_PARTS.has(emailLocalPartBase(email));
}

export function isInternalOperatorName(
  name: string | null | undefined
): boolean {
  const first = (name ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  return first === "sachin" || first === "aditya";
}

export function isInternalOperator(user: {
  email?: string | null;
  name?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  return (
    isInternalOperatorEmail(user.email) || isInternalOperatorName(user.name)
  );
}

export const DEFAULT_LOGIN_NOTIFY_EMAILS = [
  "sachin@andreihealth.com",
  "aditya@andreihealth.com",
] as const;
