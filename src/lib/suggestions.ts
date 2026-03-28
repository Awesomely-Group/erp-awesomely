import { prisma } from "./prisma";

interface SuggestedProject {
  projectId: string;
  projectName: string;
  workspaceName: string;
  confidence: number; // 0-1
  reason: string;
}

// Simple heuristic recommender:
// 1. Same counterparty → same project (highest weight)
// 2. Similar line name (keyword match)
// 3. Most frequently used project overall (fallback)
export async function getSuggestionsForLine(params: {
  counterparty?: string | null;
  lineName: string;
  lineDescription?: string | null;
}): Promise<SuggestedProject[]> {
  const { counterparty, lineName, lineDescription } = params;

  const scored = new Map<string, { score: number; project: { id: string; name: string; workspace: { name: string } } }>();

  // 1. Find classifications for same counterparty
  if (counterparty) {
    const sameCounterparty = await prisma.classification.findMany({
      where: {
        invoiceLine: {
          invoice: { counterparty: { contains: counterparty, mode: "insensitive" } },
        },
      },
      select: {
        projectId: true,
        project: { select: { id: true, name: true, workspace: { select: { name: true } } } },
      },
      take: 100,
    });

    for (const c of sameCounterparty) {
      const existing = scored.get(c.projectId);
      scored.set(c.projectId, {
        score: (existing?.score ?? 0) + 3,
        project: c.project,
      });
    }
  }

  // 2. Find classifications with similar line name keywords
  const keywords = extractKeywords(lineName + " " + (lineDescription ?? ""));
  if (keywords.length > 0) {
    for (const keyword of keywords.slice(0, 3)) {
      const similar = await prisma.classification.findMany({
        where: {
          invoiceLine: {
            name: { contains: keyword, mode: "insensitive" },
          },
        },
        select: {
          projectId: true,
          project: { select: { id: true, name: true, workspace: { select: { name: true } } } },
        },
        take: 50,
      });

      for (const c of similar) {
        const existing = scored.get(c.projectId);
        scored.set(c.projectId, {
          score: (existing?.score ?? 0) + 1,
          project: c.project,
        });
      }
    }
  }

  // 3. Fallback: most used projects globally
  if (scored.size === 0) {
    const topProjects = await prisma.classification.groupBy({
      by: ["projectId"],
      _count: { projectId: true },
      orderBy: { _count: { projectId: "desc" } },
      take: 3,
    });

    for (const row of topProjects) {
      const project = await prisma.jiraProject.findUnique({
        where: { id: row.projectId },
        select: { id: true, name: true, workspace: { select: { name: true } } },
      });
      if (project) {
        scored.set(row.projectId, {
          score: row._count.projectId * 0.5,
          project,
        });
      }
    }
  }

  if (scored.size === 0) return [];

  const maxScore = Math.max(...Array.from(scored.values()).map((v) => v.score));

  return Array.from(scored.entries())
    .map(([, v]) => ({
      projectId: v.project.id,
      projectName: v.project.name,
      workspaceName: v.project.workspace.name,
      confidence: Math.min(v.score / maxScore, 1),
      reason: v.score >= 3 ? "Mismo proveedor" : "Descripción similar",
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "de", "del", "la", "el", "los", "las", "un", "una", "y", "en", "a",
    "con", "por", "para", "the", "of", "and", "for", "to", "in", "a",
    "service", "services", "servicio", "servicios", "factura",
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-záéíóúüñ\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 10);
}
