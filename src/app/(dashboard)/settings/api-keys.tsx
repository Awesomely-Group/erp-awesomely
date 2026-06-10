import { prisma } from "@/lib/prisma";
import { ApiKeysClient } from "./api-keys-client";

export async function ApiKeysSection(): Promise<React.JSX.Element> {
  const keys = await prisma.apiKey.findMany({
    include: { createdBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          Claves de API
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Genera claves para acceso programático al ERP desde herramientas
          externas (Claude Desktop, Cursor, CI/CD…). Cada clave se muestra una
          sola vez al crearla.
        </p>
      </div>
      <ApiKeysClient
        keys={keys.map((k) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
          creatorName: k.createdBy.name ?? k.createdBy.email ?? null,
        }))}
      />
    </section>
  );
}
