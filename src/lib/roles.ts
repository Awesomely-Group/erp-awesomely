import { auth } from "@/lib/auth";
import type { Session } from "next-auth";

/**
 * Sesión + rol para server actions de Growth (revisión 2026-09-18). Lanza si no hay
 * sesión — mismo criterio que el resto de server actions del repo (`if (!session?.user)
 * throw new Error("Unauthorized")`).
 */
export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

/** Para acciones que solo puede hacer un ADMIN (p.ej. editar CommissionRule). */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    throw new Error("Solo un administrador puede hacer esto");
  }
  return session;
}
