import { prisma } from "./prisma";
import { HoldedClient } from "./holded";
import { JiraClient } from "./jira";
import { convertToEur } from "./exchange-rates";
import { InvoiceType, SyncResult, SyncSource } from "@prisma/client";

// ─── Jira Sync ─────────────────────────────────────────────────────────────────

export async function syncJiraWorkspace(workspaceId: string): Promise<void> {
  const workspace = await prisma.jiraWorkspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  const startedAt = new Date();
  let projectsSynced = 0;
  let errorMessage: string | undefined;

  try {
    const client = new JiraClient(workspace.domain, workspace.email, workspace.apiToken);
    const projects = await client.getAllProjects();

    for (const project of projects) {
      await prisma.jiraProject.upsert({
        where: { jiraId_workspaceId: { jiraId: project.id, workspaceId } },
        update: { jiraKey: project.key, name: project.name, active: !project.archived },
        create: {
          jiraId: project.id,
          jiraKey: project.key,
          name: project.name,
          workspaceId,
          active: !project.archived,
        },
      });
      projectsSynced++;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  await prisma.syncLog.create({
    data: {
      source: SyncSource.JIRA,
      result: errorMessage ? SyncResult.ERROR : SyncResult.SUCCESS,
      workspaceId,
      projectsSynced,
      errorMessage,
      startedAt,
      finishedAt: new Date(),
    },
  });

  if (errorMessage) throw new Error(errorMessage);
}

// ─── Holded Sync ───────────────────────────────────────────────────────────────

export async function syncHoldedCompany(companyId: string): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  const startedAt = new Date();
  let invoicesSynced = 0;
  let errorMessage: string | undefined;

  try {
    const client = new HoldedClient(company.holdedApiKey);

    // Sync sales invoices
    const salesInvoices = await client.getAllInvoicesPaginated("invoice");
    for (const inv of salesInvoices) {
      await upsertInvoice(inv, companyId, InvoiceType.SALE);
      invoicesSynced++;
    }

    // Sync purchase invoices
    const purchaseInvoices = await client.getAllInvoicesPaginated("purchase");
    for (const inv of purchaseInvoices) {
      await upsertInvoice(inv, companyId, InvoiceType.PURCHASE);
      invoicesSynced++;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  await prisma.syncLog.create({
    data: {
      source: SyncSource.HOLDED,
      result: errorMessage ? SyncResult.ERROR : SyncResult.SUCCESS,
      companyId,
      invoicesSynced,
      errorMessage,
      startedAt,
      finishedAt: new Date(),
    },
  });

  if (errorMessage) throw new Error(errorMessage);
}

async function upsertInvoice(
  inv: Awaited<ReturnType<HoldedClient["getAllInvoicesPaginated"]>>[number],
  companyId: string,
  type: InvoiceType
): Promise<void> {
  const date = new Date(inv.date * 1000);
  const currency = (inv.currency ?? "EUR").toUpperCase();
  const fxRate = inv.currencyChange && inv.currencyChange !== 0 ? inv.currencyChange : 1;

  // Use Holded's own fx rate if available, else fetch from Frankfurter
  let resolvedFxRate = fxRate;
  if (currency !== "EUR" && fxRate === 1) {
    const { rate } = await convertToEur(1, currency, date);
    resolvedFxRate = rate;
  }

  const totalEur = (inv.total ?? 0) * resolvedFxRate;

  const invoice = await prisma.invoice.upsert({
    where: { holdedId_companyId: { holdedId: inv.id, companyId } },
    update: {
      number: inv.docNumber,
      counterparty: inv.contactName,
      date,
      dueDate: inv.dueDate ? new Date(inv.dueDate * 1000) : null,
      currency,
      fxRateToEur: resolvedFxRate,
      subtotal: inv.subtotal ?? 0,
      tax: inv.tax ?? 0,
      total: inv.total ?? 0,
      totalEur,
    },
    create: {
      holdedId: inv.id,
      companyId,
      type,
      number: inv.docNumber,
      counterparty: inv.contactName,
      date,
      dueDate: inv.dueDate ? new Date(inv.dueDate * 1000) : null,
      currency,
      fxRateToEur: resolvedFxRate,
      subtotal: inv.subtotal ?? 0,
      tax: inv.tax ?? 0,
      total: inv.total ?? 0,
      totalEur,
    },
  });

  // Upsert lines
  if (inv.products && inv.products.length > 0) {
    // Delete existing lines and recreate (simpler than line-level upsert without stable IDs)
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });

    for (let i = 0; i < inv.products.length; i++) {
      const product = inv.products[i];
      const lineTotalEur = (product.total ?? 0) * resolvedFxRate;

      await prisma.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          name: product.name,
          description: product.desc ?? null,
          quantity: product.units ?? 0,
          unitPrice: product.price ?? 0,
          subtotal: product.subtotal ?? 0,
          tax: product.tax ?? 0,
          total: product.total ?? 0,
          totalEur: lineTotalEur,
          sortOrder: i,
        },
      });
    }
  }

  // Update invoice status based on classification coverage
  await updateInvoiceStatus(invoice.id);
}

export async function updateInvoiceStatus(invoiceId: string): Promise<void> {
  const lines = await prisma.invoiceLine.findMany({
    where: { invoiceId },
    include: { classification: true },
  });

  if (lines.length === 0) return;

  const classified = lines.filter((l) => l.classification !== null).length;

  let status: "PENDING" | "PARTIAL" | "CLASSIFIED" | "REVIEWED" | "APPROVED" =
    "PENDING";

  if (classified === 0) {
    status = "PENDING";
  } else if (classified < lines.length) {
    status = "PARTIAL";
  } else {
    // All classified — use the minimum status of all lines
    const statuses = lines
      .map((l) => l.classification?.status)
      .filter(Boolean);

    if (statuses.every((s) => s === "APPROVED")) {
      status = "APPROVED";
    } else if (statuses.every((s) => s === "REVIEWED" || s === "APPROVED")) {
      status = "REVIEWED";
    } else {
      status = "CLASSIFIED";
    }
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status },
  });
}

// ─── Full sync ─────────────────────────────────────────────────────────────────

export async function syncAll(): Promise<{
  companies: number;
  workspaces: number;
  errors: string[];
}> {
  const [companies, workspaces] = await Promise.all([
    prisma.company.findMany({ where: { active: true } }),
    prisma.jiraWorkspace.findMany({ where: { active: true } }),
  ]);

  const errors: string[] = [];

  await Promise.allSettled([
    ...companies.map((c) =>
      syncHoldedCompany(c.id).catch((e: unknown) => {
        errors.push(`Holded ${c.name}: ${e instanceof Error ? e.message : String(e)}`);
      })
    ),
    ...workspaces.map((w) =>
      syncJiraWorkspace(w.id).catch((e: unknown) => {
        errors.push(`Jira ${w.name}: ${e instanceof Error ? e.message : String(e)}`);
      })
    ),
  ]);

  return { companies: companies.length, workspaces: workspaces.length, errors };
}
