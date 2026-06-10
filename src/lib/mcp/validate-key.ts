import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Validates an API key against:
 * 1. DB-stored hashed keys (ApiKey model)
 * 2. Legacy ERP_API_KEY env var as fallback
 *
 * Updates lastUsedAt on successful DB key validation.
 */
export async function validateApiKey(key: string | null): Promise<boolean> {
  if (!key) return false;

  // Fallback: legacy single env var key
  const envKey = process.env.ERP_API_KEY;
  if (envKey && key === envKey) return true;

  // DB lookup via SHA-256 hash
  const keyHash = createHash("sha256").update(key).digest("hex");
  const record = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (!record) return false;

  // Fire-and-forget lastUsedAt update
  void prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return true;
}
