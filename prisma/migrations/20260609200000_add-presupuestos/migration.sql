-- CreateEnum
CREATE TYPE "budget_type" AS ENUM ('PRECIO_CERRADO', 'BOLSA_DE_HORAS', 'FEE_REGULAR');

-- CreateEnum
CREATE TYPE "budget_region" AS ENUM ('UK', 'US', 'EU', 'OTHER');

-- CreateEnum
CREATE TYPE "budget_status" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "budget_template" AS ENUM ('SOLUTIONS', 'TROUPE');

-- CreateEnum
CREATE TYPE "payment_term_value_type" AS ENUM ('PERCENTAGE', 'AMOUNT');

-- AlterTable
ALTER TABLE "classifications" ADD COLUMN "budgetId" TEXT;

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "budget_type" NOT NULL,
    "region" "budget_region" NOT NULL DEFAULT 'EU',
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "estimatedHours" DOUBLE PRECISION,
    "monthlyFee" DECIMAL(65,30),
    "status" "budget_status" NOT NULL DEFAULT 'DRAFT',
    "template" "budget_template" NOT NULL DEFAULT 'SOLUTIONS',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "roleId" TEXT,
    "phase" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "estimatedHours" DOUBLE PRECISION NOT NULL,
    "pvpPerHour" DECIMAL(65,30) NOT NULL,
    "costPerHour" DECIMAL(65,30) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_terms" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "valueType" "payment_term_value_type" NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "description" TEXT,
    "proformaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_rates" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "region" "budget_region" NOT NULL,
    "pvp" DECIMAL(65,30) NOT NULL,
    "cost" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budgets_projectId_idx" ON "budgets"("projectId");

-- CreateIndex
CREATE INDEX "budgets_status_idx" ON "budgets"("status");

-- CreateIndex
CREATE INDEX "budget_lines_budgetId_idx" ON "budget_lines"("budgetId");

-- CreateIndex
CREATE INDEX "budget_lines_roleId_idx" ON "budget_lines"("roleId");

-- CreateIndex
CREATE INDEX "payment_terms_budgetId_idx" ON "payment_terms"("budgetId");

-- CreateIndex
CREATE INDEX "payment_terms_proformaId_idx" ON "payment_terms"("proformaId");

-- CreateIndex
CREATE INDEX "role_rates_roleId_idx" ON "role_rates"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_rates_roleId_region_key" ON "role_rates"("roleId", "region");

-- CreateIndex
CREATE INDEX "classifications_budgetId_idx" ON "classifications"("budgetId");

-- AddForeignKey
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "jira_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "proformas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_rates" ADD CONSTRAINT "role_rates_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
