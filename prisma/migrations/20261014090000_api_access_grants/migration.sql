-- Concesiones de acceso a la API y claves con dueño.
--
-- El acceso programático deja de ser "quien tenga una clave". Toda clave nace ahora de
-- una concesión nominal que un ADMIN otorga, tiene dueño y caducidad, y lo que puede
-- hacer se recalcula en cada petición contra su concesión y el rol vivo de esa persona.
--
-- Las claves anteriores no tienen dueño que se pueda inventar, así que **se jubilan**:
-- se cuelgan de una concesión de compatibilidad nacida revocada y con cero permisos, y
-- se marcan revocadas. Quedan inertes pero auditables (su `lastUsedAt` dice si alguien
-- las seguía usando). Hay que reemitirlas a mano desde Configuración; son pocas y
-- `audit_logs` dice quién creó cada una.

-- 1. La tabla de concesiones.
CREATE TABLE "api_access_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" TEXT[],
    "companyIds" TEXT[],
    "marcas" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "grantedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_access_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_access_grants_userId_key" ON "api_access_grants"("userId");

ALTER TABLE "api_access_grants" ADD CONSTRAINT "api_access_grants_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_access_grants" ADD CONSTRAINT "api_access_grants_grantedById_fkey"
  FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "api_access_grants" ADD CONSTRAINT "api_access_grants_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Las columnas nuevas de `api_keys`, **nullable de momento** para poder rellenarlas.
ALTER TABLE "api_keys"
  ADD COLUMN "userId"      TEXT,
  ADD COLUMN "grantId"     TEXT,
  ADD COLUMN "scopes"      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "companyIds"  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "marcas"      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "expiresAt"   TIMESTAMP(3),
  ADD COLUMN "revokedAt"   TIMESTAMP(3),
  ADD COLUMN "revokedById" TEXT;

-- 3. Jubilación de las claves existentes.
DO $$
DECLARE
  creador TEXT;
  concesion TEXT;
BEGIN
  FOR creador IN SELECT DISTINCT "createdById" FROM "api_keys" LOOP
    -- Una concesión de compatibilidad por persona que tuviera claves. Nace revocada y
    -- sin permisos: existe para que las filas antiguas tengan de qué colgar, no para
    -- conceder nada.
    INSERT INTO "api_access_grants" ("id","userId","scopes","companyIds","marcas","expiresAt","revokedAt","note","createdAt","updatedAt")
    VALUES (gen_random_uuid()::TEXT, creador, '{}', '{}', '{}', NOW(), NOW(),
            'Concesión de compatibilidad: cuelga las claves anteriores al control de acceso. Nace revocada.',
            NOW(), NOW())
    RETURNING "id" INTO concesion;

    UPDATE "api_keys"
    SET "userId"    = creador,
        "grantId"   = concesion,
        "expiresAt" = NOW(),
        "revokedAt" = COALESCE("revokedAt", NOW())
    WHERE "createdById" = creador;
  END LOOP;
END $$;

-- 4. Ya se puede exigir dueño, concesión y caducidad.
ALTER TABLE "api_keys"
  ALTER COLUMN "userId"    SET NOT NULL,
  ALTER COLUMN "grantId"   SET NOT NULL,
  ALTER COLUMN "expiresAt" SET NOT NULL;

ALTER TABLE "api_keys" ALTER COLUMN "scopes"     DROP DEFAULT;
ALTER TABLE "api_keys" ALTER COLUMN "companyIds" DROP DEFAULT;
ALTER TABLE "api_keys" ALTER COLUMN "marcas"     DROP DEFAULT;

CREATE INDEX "api_keys_userId_idx"  ON "api_keys"("userId");
CREATE INDEX "api_keys_grantId_idx" ON "api_keys"("grantId");

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_grantId_fkey"
  FOREIGN KEY ("grantId") REFERENCES "api_access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Con qué credencial se escribió. Sin tabla de auditoría nueva: ya existe `audit_logs`.
ALTER TABLE "audit_logs" ADD COLUMN "viaApiKeyId" TEXT;
CREATE INDEX "audit_logs_viaApiKeyId_idx" ON "audit_logs"("viaApiKeyId");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_viaApiKeyId_fkey"
  FOREIGN KEY ("viaApiKeyId") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
