import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSsoAllowlist } from "@/lib/sso-allowlist";
import { SsoAllowlistClient } from "./sso-allowlist-client";

export async function SsoAllowlistSection(): Promise<React.JSX.Element> {
  const session = await auth();
  const canManage = canManageSsoAllowlist(session?.user?.email);
  const entries = await prisma.ssoAllowedEmail.findMany({
    orderBy: { email: "asc" },
  });

  if (!canManage) {
    return (
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Acceso SSO</h2>
        <p className="text-sm text-gray-600">
          El inicio de sesión con Google o Microsoft está limitado a correos
          aprobados por un administrador. Si necesitas acceso, pide que te añadan
          en esta pantalla.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Acceso SSO</h2>
      <p className="text-sm text-gray-500">
        Solo los correos de esta lista pueden entrar con Google o Microsoft.
        Puedes añadir o quitar personas. Quién puede editar esta lista se
        controla con la variable de entorno{" "}
        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
          SSO_ALLOWLIST_ADMIN_EMAILS
        </code>{" "}
        (separada por comas). Si no está definida, por defecto solo el correo
        indicado en el código base puede administrarla.
      </p>
      <SsoAllowlistClient entries={entries} />
    </section>
  );
}
