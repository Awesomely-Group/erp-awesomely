import { prisma } from "./prisma";
import { HoldedClient } from "./holded";
import { JiraClient } from "./jira";
import { convertToEur } from "./exchange-rates";
import { tagToBrand } from "./utils";
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

  // Process a list of invoices in parallel batches to reduce total sync time
  type AccountMaps = Awaited<ReturnType<HoldedClient["getAccountMaps"]>>;

  async function upsertBatch(
    invoices: Awaited<ReturnType<HoldedClient["getAllInvoicesPaginated"]>>,
    type: InvoiceType,
    accountMaps: AccountMaps,
    batchSize = 10
  ): Promise<void> {
    for (let i = 0; i < invoices.length; i += batchSize) {
      const chunk = invoices.slice(i, i + batchSize);
      await Promise.all(
        chunk.map((inv) =>
          upsertInvoice(inv, companyId, type, accountMaps)
            .then(() => { invoicesSynced++; })
            .catch((err: unknown) => {
              console.error(`[sync] Error upserting ${type} invoice ${inv.id} (${inv.docNumber}):`, err);
            })
        )
      );
    }
  }

  try {
    const client = new HoldedClient(company.holdedApiKey);

    // Fetch chart of accounts and both invoice types in parallel
    const [accountMaps, salesInvoices, purchaseInvoices] = await Promise.all([
      client.getAccountMaps(),
      client.getAllInvoicesPaginated("invoice"),
      client.getAllInvoicesPaginated("purchase"),
    ]);

    await Promise.all([
      upsertBatch(salesInvoices, InvoiceType.SALE, accountMaps),
      upsertBatch(purchaseInvoices, InvoiceType.PURCHASE, accountMaps),
    ]);
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

type AccountMaps = Awaited<ReturnType<HoldedClient["getAccountMaps"]>>;

function resolveAccount(
  raw: string | { id?: string; num?: string; name?: string } | undefined,
  maps: AccountMaps
): { num: string | null; name: string | null } {
  if (!raw) return { num: null, name: null };

  if (typeof raw === "object") {
    const num = raw.num ?? null;
    const name = raw.name ?? (num ? (maps.byNum.get(num) ?? null) : null);
    return { num, name };
  }

  // raw is a string — could be a Holded internal ID or a numeric code
  const fromId = maps.byId.get(raw);
  if (fromId) return fromId;

  const nameFromNum = maps.byNum.get(raw);
  if (nameFromNum) return { num: raw, name: nameFromNum };

  // Unknown string (probably a Holded internal ID) — store it so it can be resolved later
  return { num: raw, name: null };
}

async function upsertInvoice(
  inv: Awaited<ReturnType<HoldedClient["getAllInvoicesPaginated"]>>[number],
  companyId: string,
  type: InvoiceType,
  accountMaps: AccountMaps = { byNum: new Map(), byId: new Map() }
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
  const marca = tagToBrand(inv.tags);

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
      marca,
      paymentsTotal: inv.paymentsTotal ?? 0,
      paymentsPending: inv.paymentsPending ?? (inv.total ?? 0),
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
      marca,
      paymentsTotal: inv.paymentsTotal ?? 0,
      paymentsPending: inv.paymentsPending ?? (inv.total ?? 0),
    },
  });

  // Upsert lines
  if (inv.products && inv.products.length > 0) {
    // Preserve existing classifications keyed by sortOrder before deleting lines
    const existingLines = await prisma.invoiceLine.findMany({
      where: { invoiceId: invoice.id },
      include: { classification: true },
      orderBy: { sortOrder: "asc" },
    });
    const classificationBySortOrder = new Map(
      existingLines
        .filter((l) => l.classification !== null)
        .map((l) => [l.sortOrder, l.classification!])
    );

    await prisma.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });

    // Holded returns the correct invoice total (including retentions, multiple taxes, etc.)
    // We distribute it proportionally across lines by subtotal weight
    const invSubtotal = inv.subtotal ?? 0;
    const invTotal = inv.total ?? 0;

    for (let i = 0; i < inv.products.length; i++) {
      const product = inv.products[i];
      const qty = product.units ?? 0;
      const price = product.price ?? 0;
      const discountPct = product.discount ?? 0;
      const lineSubtotal = qty * price * (1 - discountPct / 100);
      // Use invoice-level total proportionally so retentions and extra taxes are accounted for
      const lineTotal =
        invSubtotal !== 0 ? (lineSubtotal / invSubtotal) * invTotal : lineSubtotal;
      const lineTaxAmount = lineTotal - lineSubtotal;
      const lineTotalEur = lineTotal * resolvedFxRate;

      const newLine = await prisma.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          name: product.name,
          description: product.desc ?? null,
          quantity: qty,
          unitPrice: price,
          subtotal: lineSubtotal,
          tax: lineTaxAmount,
          total: lineTotal,
          totalEur: lineTotalEur,
          accountingAccount: resolveAccount(product.account, accountMaps).num,
          accountingAccountName: resolveAccount(product.account, accountMaps).name,
          sortOrder: i,
        },
      });

      // Restore classification if this sortOrder had one
      const prevClassification = classificationBySortOrder.get(i);
      if (prevClassification) {
        await prisma.classification.create({
          data: {
            invoiceLineId: newLine.id,
            projectId: prevClassification.projectId,
            notes: prevClassification.notes,
            status: prevClassification.status,
            classifiedBy: prevClassification.classifiedBy,
            classifiedAt: prevClassification.classifiedAt,
            reviewedBy: prevClassification.reviewedBy,
            reviewedAt: prevClassification.reviewedAt,
            approvedBy: prevClassification.approvedBy,
            approvedAt: prevClassification.approvedAt,
          },
        });
      }
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
