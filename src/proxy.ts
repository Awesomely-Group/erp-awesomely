import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");

  const p = req.nextUrl.pathname;

  // Rutas que **no** pasan por sesión porque tienen su propia autenticación. Antes
  // esto era un allowlist literal ruta a ruta, y se había desincronizado de lo que los
  // handlers aceptaban: `/api/invoices/[id]`, `classify-lines` y los dos PDFs admitían
  // `x-api-key` pero el middleware los mandaba a /login, así que por API eran
  // inalcanzables. Cuatro reglas por prefijo en vez de una lista que hay que recordar
  // actualizar:
  const isApiInternal =
    // API pública versionada: autentica en `apiRoute` con Bearer + scope.
    p.startsWith("/api/v1/") ||
    // Eventos de entrada, cada integración con su secreto.
    p.startsWith("/api/webhooks/") ||
    // Portal de cliente (2026-09-20): lo lee gigsonapps.com con un secreto por marca
    // (x-webhook-secret, ver src/lib/portal-auth.ts). Prefijo propio y no /api/webhooks/
    // a propósito — esto es SALIDA de datos de cliente, no eventos de entrada.
    p.startsWith("/api/portal/") ||
    // Disparadores programados, con CRON_SECRET.
    p === "/api/sync" ||
    p === "/api/sync/hours" ||
    p === "/api/notify/proformas" ||
    // Ruta vieja del MCP: hoy solo devuelve un 307 a /api/v1/mcp. Tiene que seguir
    // fuera de la sesión o un cliente ya configurado recibiría el redirect al login
    // en vez del suyo. Se borra cuando se borre la ruta.
    p === "/api/mcp";

  if (isApiAuth || isApiInternal) return NextResponse.next();
  // En desarrollo local (NODE_ENV !== "production") se omite el login para agilizar las
  // pruebas sin pasar por SSO. Nunca afecta a producción (ver también layout.tsx). El
  // guard de rol COMERCIAL de más abajo sí se aplica también en local, para poder
  // probarlo sin desplegar.
  // `/api/v1` queda fuera de esta excepción a propósito: si en local se pudiera entrar
  // sin Bearer, una prueba manual pasaría aquí y fallaría en producción.
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
