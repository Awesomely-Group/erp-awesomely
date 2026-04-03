/**
 * SSO allowlist: who may sign in via OAuth. Admins are configured via env (see getSsoAdminEmails).
 */

/** Lowercase trim for stable matching. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Comma-separated env `SSO_ALLOWLIST_ADMIN_EMAILS`, or legacy default. */
export function getSsoAdminEmails(): string[] {
  const raw = process.env.SSO_ALLOWLIST_ADMIN_EMAILS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((e) => normalizeEmail(e))
      .filter(Boolean);
  }
  return [normalizeEmail("jaume@somosgigson.com")];
}

export function canManageSsoAllowlist(userEmail: string | null | undefined): boolean {
  const normalized = userEmail ? normalizeEmail(userEmail) : "";
  if (!normalized) return false;
  return getSsoAdminEmails().includes(normalized);
}
