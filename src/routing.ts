"use strict";
// Role-based post-login routing.
//
// Admins land on /admin, regular users on /dashboard. Sending a non-admin to
// /admin used to bounce off requireAdmin back to /login, which then bounced
// straight back to /admin — an infinite redirect loop (ERR_TOO_MANY_REDIRECTS).

/** Landing page for a role. */
export function homeFor(role: string | undefined): string {
  return role === "admin" ? "/admin" : "/dashboard";
}

/**
 * Validate a `next` redirect target: must be a local path, and a non-admin may
 * never be sent to an admin-only page (that is what caused the loop).
 * Falls back to the role's home page.
 */
export function safeNext(next: unknown, role: string | undefined): string {
  const home = homeFor(role);
  if (typeof next !== "string" || !next) return home;
  // local paths only — no protocol-relative (//evil.com) or absolute URLs
  if (!next.startsWith("/") || next.startsWith("//")) return home;
  if (role !== "admin" && next.startsWith("/admin")) return home;
  return next;
}
