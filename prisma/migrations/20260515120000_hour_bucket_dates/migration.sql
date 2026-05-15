-- AddColumns: startDate and endDate to hour_buckets
-- Using IF NOT EXISTS because prisma db push may have already applied these columns.

ALTER TABLE "hour_buckets" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "hour_buckets" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
