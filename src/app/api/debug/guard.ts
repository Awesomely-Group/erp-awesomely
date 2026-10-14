/**
 * Guard común de `/api/debug/*`.
 *
 * Estas rutas vuelcan payloads crudos de Holded para diagnosticar sincronizaciones, y
 * alguna incluye datos bancarios (`/api/debug/contacts` expone `iban`, `swift` y
 * `sepa_ref` tal cual llegan). Por eso piden **ADMIN** y no solo sesión: no es dato de
 * trabajo, es material de depuración con información sensible dentro.
 *
 * Antes vivían sueltas como `/api/debug-*`, y una de ellas estaba en el allowlist del
 * middleware — entraba sin sesión y se salvaba solo porque el handler comprobaba
 * `CRON_SECRET` por su cuenta. Bajo un prefijo propio dejan de depender de esa
 * coincidencia.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function requireAdminDebug(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Solo un administrador puede usar las rutas de debug" },
      { status: 403 },
    );
  }
  return null;
}
