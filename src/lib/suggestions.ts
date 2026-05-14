import { prisma } from "./prisma";

export interface SuggestedProject {
  projectId: string;
  projectName: string;
  workspaceName: string;
  confidence: number;
  reason: string;
}

export interface ProjectForSuggestion {
  id: string;
  name: string;
  jiraKey: string;
  workspace: { name: string };
}

export function extractKeywords(text: string): string[] {
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

export function scoreProjectSuggestions(
  projects: ProjectForSuggestion[],
  params: { lineName: string; lineDescription?: string | null },
): SuggestedProject[] {
  const lineKeywords = extractKeywords(
    params.lineName + " " + (params.lineDescription ?? ""),
  );
  if (lineKeywords.length === 0) return [];

  const scored = new Map<
    string,
    { score: number; project: ProjectForSuggestion }
  >();

  for (const project of projects) {
    const projectTerms = [
      ...extractKeywords(project.name),
      project.jiraKey.toLowerCase(),
    ].filter((t) => t.length > 2);

    let score = 0;
    for (const kw of lineKeywords) {
      if (projectTerms.some((t) => t.includes(kw) || kw.includes(t))) {
        score += 1;
      }
    }

    if (score > 0) {
      scored.set(project.id, { score, project });
    }
  }

  if (scored.size === 0) return [];

  const maxScore = Math.max(...Array.from(scored.values()).map((v) => v.score));

  return Array.from(scored.entries())
    .map(([, v]) => ({
      projectId: v.project.id,
      projectName: v.project.name,
      workspaceName: v.project.workspace.name,
      confidence: v.score / maxScore,
      reason: "Coincidencia con proyecto Jira",
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

export async function getSuggestionsForLine(params: {
  counterparty?: string | null;
  lineName: string;
  lineDescription?: string | null;
}): Promise<SuggestedProject[]> {
  const projects = await prisma.jiraProject.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      jiraKey: true,
      workspace: { select: { name: true } },
    },
  });

  return scoreProjectSuggestions(projects, params);
}
