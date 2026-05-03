"use server";

import { prisma } from "@/lib/prisma";
import { getSuggestionsForLine } from "@/lib/suggestions";
import { InvoiceType } from "@prisma/client";
import { classifyLine } from "../[id]/actions";

interface SuggestedProject {
  projectId: string;
  projectName: string;
  workspaceName: string;
  confidence: number;
  reason: string;
}

export interface Proposal {
  lineId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  counterparty: string | null;
  lineName: string;
  totalEur: number;
  topSuggestion: SuggestedProject | null;
  allSuggestions: SuggestedProject[];
}

export interface ApplyItem {
  lineId: string;
  invoiceId: string;
  projectId: string | null;
  notes?: string;
}

export interface ApplyResult {
  lineId: string;
  success: boolean;
  error?: string;
}

export async function getBatchProposals(): Promise<Proposal[]> {
  const lines = await prisma.invoiceLine.findMany({
    where: {
      invoice: { type: InvoiceType.SALE },
      classification: null,
    },
    include: {
      invoice: {
        select: { id: true, number: true, counterparty: true },
      },
    },
    orderBy: [{ invoice: { date: "desc" } }, { sortOrder: "asc" }],
  });

  const proposals = await Promise.all(
    lines.map(async (line): Promise<Proposal> => {
      const suggestions = await getSuggestionsForLine({
        counterparty: line.invoice.counterparty,
        lineName: line.name,
        lineDescription: line.description,
      });
      return {
        lineId: line.id,
        invoiceId: line.invoice.id,
        invoiceNumber: line.invoice.number,
        counterparty: line.invoice.counterparty,
        lineName: line.name,
        totalEur: Number(line.totalEur),
        topSuggestion: suggestions[0] ?? null,
        allSuggestions: suggestions,
      };
    })
  );

  return proposals;
}

export async function applyProposals(items: ApplyItem[]): Promise<ApplyResult[]> {
  const results = await Promise.allSettled(
    items.map((item) =>
      classifyLine({
        lineId: item.lineId,
        projectId: item.projectId,
        notes: item.notes ?? "",
        invoiceId: item.invoiceId,
      })
    )
  );

  return results.map((result, i) => ({
    lineId: items[i].lineId,
    success: result.status === "fulfilled",
    error: result.status === "rejected" ? String((result as PromiseRejectedResult).reason) : undefined,
  }));
}
