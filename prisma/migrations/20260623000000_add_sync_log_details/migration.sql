-- Add details Json column to SyncLog for storing fetched holdedIds and upsert errors per sync run.
-- Allows diagnosing which documents Holded returned in each sync and which failed to save.
ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "details" JSONB;
