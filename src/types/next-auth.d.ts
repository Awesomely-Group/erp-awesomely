import type { DefaultSession } from "next-auth";
import type { UserRole } from "@prisma/client";

/**
 * Growth (revisión 2026-09-18): añade `role` a la sesión/JWT para el guard de
 * `/crm`+`/campanas` en src/proxy.ts. El valor se fija en el `jwt` callback
 * (src/lib/auth.config.ts) solo en el sign-in — si el rol de un usuario cambia en BD,
 * hace falta que vuelva a iniciar sesión para que se refleje (mismo comportamiento que
 * ya tenía `id`).
 */
declare module "next-auth" {
  interface User {
    role?: UserRole;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
  }
}
