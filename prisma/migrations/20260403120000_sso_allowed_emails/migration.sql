-- CreateTable
CREATE TABLE "sso_allowed_emails" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "sso_allowed_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sso_allowed_emails_email_key" ON "sso_allowed_emails"("email");

-- Seed previous hardcoded allowlist (lowercase)
INSERT INTO "sso_allowed_emails" ("id", "email", "createdAt", "createdByUserId")
VALUES
  ('seed_sso_jaume', 'jaume@somosgigson.com', CURRENT_TIMESTAMP, NULL),
  ('seed_sso_emmelin', 'emmelin@latroupestudio.com', CURRENT_TIMESTAMP, NULL);
