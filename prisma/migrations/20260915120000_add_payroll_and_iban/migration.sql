-- CreateEnum
CREATE TYPE "salary_payment_status" AS ENUM ('PENDING', 'PAID', 'PARTIALLY_PAID');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "holdedEmployeeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "iban" TEXT,
    "isExEmployee" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "holdedSalaryRecordId" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "totalPayable" DECIMAL(65,30) NOT NULL,
    "paymentTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentPending" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paymentStatus" "salary_payment_status" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_record_lines" (
    "id" TEXT NOT NULL,
    "salaryRecordId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT,

    CONSTRAINT "salary_record_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_holdedEmployeeId_key" ON "employees"("companyId", "holdedEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_records_companyId_holdedSalaryRecordId_key" ON "salary_records"("companyId", "holdedSalaryRecordId");

-- CreateIndex
CREATE INDEX "salary_records_companyId_date_idx" ON "salary_records"("companyId", "date");

-- CreateIndex
CREATE INDEX "salary_records_paymentStatus_idx" ON "salary_records"("paymentStatus");

-- CreateIndex
CREATE INDEX "salary_record_lines_salaryRecordId_idx" ON "salary_record_lines"("salaryRecordId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_record_lines" ADD CONSTRAINT "salary_record_lines_salaryRecordId_fkey" FOREIGN KEY ("salaryRecordId") REFERENCES "salary_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "invoice_payments" ADD COLUMN     "iban" TEXT,
ADD COLUMN     "salaryRecordId" TEXT;

-- CreateIndex
CREATE INDEX "invoice_payments_salaryRecordId_idx" ON "invoice_payments"("salaryRecordId");

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_salaryRecordId_fkey" FOREIGN KEY ("salaryRecordId") REFERENCES "salary_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
