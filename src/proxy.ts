import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");

  const p = req.nextUrl.pathname;

  const isApiInternal =
    p === "/api/sync" ||
    p === "/api/debug-accounts" ||
    p === "/api/notify/proformas" ||
    p === "/api/mcp" ||
    p === "/api/kpis" ||
    p === "/api/projects" ||
    p.startsWith("/api/projects/") ||
    p === "/api/invoices" ||
    (p.startsWith("/api/invoices/") && p.endsWith("/classify")) ||
    p === "/api/cashflow" ||
    p === "/api/forecasts" ||
    p === "/api/suppliers/verifications" ||
    p.startsWith("/api/webhooks/");

  if (isApiAuth || isApiInternal) return NextResponse.next();
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
