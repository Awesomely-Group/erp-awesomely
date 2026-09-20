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
    p.startsWith("/api/webhooks/") ||
    // Portal de cliente (2026-09-20): lo lee gigsonapps.com con un secreto por marca
    // (x-webhook-secret, ver src/lib/portal-auth.ts). Prefijo propio y no /api/webhooks/
    // a propósito — esto es SALIDA de datos de cliente, no eventos de entrada, y este
    // allowlist es donde se audita qué se puede leer sin sesión.
    p.startsWith("/api/portal/") ||
    // Cron que recalcula el consumo de las bolsas contra Giro. Va aparte porque
    // "/api/sync" de arriba es coincidencia exacta y no cubre las subrutas.
    p === "/api/sync/hours";

  if (isApiAuth || isApiInternal) return NextResponse.next();
  // En desarrollo local (NODE_ENV !== "production") se omite el login para agilizar las
  // pruebas sin pasar por SSO. Nunca afecta a producción (ver también layout.tsx). El
  // guard de rol COMERCIAL de más abajo sí se aplica también en local, para poder
  // probarlo sin desplegar.
  const skipLoginCheck = process.env.NODE_ENV !== "production";
  if (!skipLoginCheck) {
    if (!isLoggedIn && !isLoginPage) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (isLoggedIn && isLoginPage) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Growth (D8, revisión 2026-09-18): COMERCIAL solo ve /crm y /campanas — el resto del
  // ERP (facturación, nóminas, previsiones…) queda fuera. ADMIN (o cualquier usuario sin
  // rol explícito, default en BD) no tiene restricción, igual que hoy.
  const role = req.auth?.user?.role;
  const isGrowthRoute = p === "/crm" || p.startsWith("/crm/") || p === "/campanas" || p.startsWith("/campanas/");
  if (role === "COMERCIAL" && !isGrowthRoute && !isLoginPage) {
    return NextResponse.redirect(new URL("/crm", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
