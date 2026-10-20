-- Puente de identidad Jira ↔ Giro (Bloque E).
--
-- Aditiva: no toca `SupplierJiraUser.accountId` ni `ProjectUserRole.jiraAccountId`, que
-- siguen siendo la clave de esas tablas. Lo que cambia es que, a partir de aquí, la
-- resolución a persona se hace contra esta tabla en vez de construir a mano un email.
CREATE TYPE "link_source" AS ENUM ('API', 'MANUAL');

CREATE TABLE "giro_user_links" (
    "jiraAccountId" TEXT NOT NULL,
    "giroUserId" TEXT NOT NULL,
    "giroUserEmail" TEXT NOT NULL,
    "isShadow" BOOLEAN NOT NULL DEFAULT false,
    "source" "link_source" NOT NULL DEFAULT 'API',
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giro_user_links_pkey" PRIMARY KEY ("jiraAccountId")
);

-- Sin UNIQUE sobre giroUserId a propósito: Giro fusiona cuentas de Atlassian que son la
-- misma persona, así que dos accountId pueden apuntar al mismo usuario.
CREATE INDEX "giro_user_links_giroUserId_idx" ON "giro_user_links"("giroUserId");
