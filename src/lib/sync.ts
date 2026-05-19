import { prisma } from "./prisma";
import { HoldedClient } from "./holded";
import { JiraClient } from "./jira";
import { convertToEur } from "./exchange-rates";
import { InvoiceType, SyncResult, SyncSource } from "@prisma/client";
import { tagToBrand } from "./utils";

// ─── Jira Sync ─────────────────────────────────────────────────────────────────

export async function syncJiraWorkspace(workspaceId: string, triggeredBy?: string): Promise<void> {
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

    // Deactivate projects that no longer exist in Jira (deleted, not just archived)
    const returnedJiraIds = new Set(projects.map((p) => p.id));
    await prisma.jiraProject.updateMany({
      where: { workspaceId, jiraId: { notIn: [...returnedJiraIds] }, active: true },
      data: { active: false },
    });
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
      triggeredBy: triggeredBy ?? null,
      startedAt,
      finishedAt: new Date(),
    },
  });

  if (errorMessage) throw new Error(errorMessage);
}

// ─── Supplier Sync ─────────────────────────────────────────────────────────────

export async function syncSuppliers(companyId: string): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const client = new HoldedClient(company.holdedApiKey);
  const contacts = await client.getSupplierContacts();

  const activeHoldedIds = new Set(contacts.map((c) => c.id));

  for (const contact of contacts) {
    await prisma.supplier.upsert({
      where: { holdedContactId_companyId: { holdedContactId: contact.id, companyId } },
      create: { holdedContactId: contact.id, companyId, name: contact.name },
      update: { name: contact.name, active: true },
    });
  }

  // Deactivate suppliers no longer classified as supplier-type in Holded
  await prisma.supplier.updateMany({
    where: { companyId, holdedContactId: { notIn: [...activeHoldedIds] }, active: true },
    data: { active: false },
  });
}

// ─── Holded Sync ───────────────────────────────────────────────────────────────

export async function syncHoldedCompany(companyId: string, triggeredBy?: string): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  const startedAt = new Date();
  let invoicesSynced = 0;
  let errorMessage: string | undefined;
  let convertedProformaHoldedIds: string[] = [];

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

    // Collect proforma Holded IDs that were converted to an invoice.
    // Holded sets invoice.from = { id: proformaHoldedId, docType: "proform" } on conversion
    // but does NOT update the proforma's own status field — so we fix it after syncProformas
    // runs (otherwise syncProformas would overwrite our status: 3 with the original Holded value).
    convertedProformaHoldedIds = salesInvoices
      .filter((inv) => inv.from?.docType === "proform")
      .map((inv) => inv.from!.id);

    // Remove invoices that no longer exist in Holded (source of truth).
    // Only delete if no user work has been done (no classifications, no ERP payments).
    const returnedHoldedIds = new Set([
      ...salesInvoices.map((i) => i.id),
      ...purchaseInvoices.map((i) => i.id),
    ]);

    const dbInvoices = await prisma.invoice.findMany({
      where: { companyId },
      select: { id: true, holdedId: true },
    });

    const orphanedIds = dbInvoices
      .filter((i) => !returnedHoldedIds.has(i.holdedId))
      .map((i) => i.id);

    if (orphanedIds.length > 0) {
      // Only delete invoices with no user work to preserve classification history
      const safeToDelete = await prisma.invoice.findMany({
        where: {
          id: { in: orphanedIds },
          lines: { none: { classification: { isNot: null } } },
          erpPayments: { none: {} },
        },
        select: { id: true },
      });

      const safeIds = safeToDelete.map((i) => i.id);
      if (safeIds.length > 0) {
        // Null out FK refs that lack cascade before deletion
        await prisma.auditLog.updateMany({
          where: { invoiceId: { in: safeIds } },
          data: { invoiceId: null },
        });
        await prisma.supplierVerification.updateMany({
          where: { invoiceId: { in: safeIds } },
          data: { invoiceId: null },
        });
        await prisma.invoice.deleteMany({ where: { id: { in: safeIds } } });
        console.log(`[sync] Deleted ${safeIds.length} invoice(s) removed from Holded for company ${companyId}`);
      }

      const skipped = orphanedIds.length - safeIds.length;
      if (skipped > 0) {
        console.warn(`[sync] ${skipped} invoice(s) no longer in Holded but kept because they have classifications or payments`);
      }
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
      triggeredBy: triggeredBy ?? null,
      startedAt,
      finishedAt: new Date(),
    },
  });

  await syncSuppliers(companyId).catch((err: unknown) => {
    console.error("[sync] Error syncing suppliers:", err);
  });

  await syncProformas(companyId).catch((err: unknown) => {
    console.error("[sync] Error syncing proformas:", err);
  });

  // Mark converted proformas AFTER syncProformas so we override whatever Holded returned.
  // Holded never sets holdedStatus=3 on the proforma side when converting to invoice.
  if (convertedProformaHoldedIds.length > 0) {
    await prisma.proforma.updateMany({
      where: {
        companyId,
        holdedId: { in: convertedProformaHoldedIds },
        holdedStatus: { notIn: [3, -1] },
      },
      data: { holdedStatus: 3 },
    });
  }

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

  // Holded's currencyChange = EUR→FOREIGN rate (e.g. 67.89 PHP per 1 EUR).
  // When provided, inv.total and product prices come from Holded already in EUR
  // (Holded's base currency). The Frankfurter fallback is used when Holded omits
  // the rate, in which case inv.total is in the foreign currency.
  const holdedRate =
    inv.currencyChange && inv.currencyChange !== 0 ? inv.currencyChange : null;

  let fxRateToEur: number; // FOREIGN→EUR multiplier stored in fxRateToEur field
  let invTotalEur: number;
  let invTotalForeign: number;
  let invSubtotalForeign: number;
  let invTaxForeign: number;
  let toForeign: number; // factor to convert EUR amounts → foreign for storage

  if (currency === "EUR") {
    fxRateToEur = 1;
    toForeign = 1;
    invTotalEur = inv.total ?? 0;
    invTotalForeign = inv.total ?? 0;
    invSubtotalForeign = inv.subtotal ?? 0;
    invTaxForeign = inv.tax ?? 0;
  } else if (holdedRate !== null) {
    // Holded gives EUR→FOREIGN rate; amounts from Holded are in EUR
    fxRateToEur = 1 / holdedRate;
    toForeign = holdedRate;
    invTotalEur = inv.total ?? 0;
    invTotalForeign = invTotalEur * holdedRate;
    invSubtotalForeign = (inv.subtotal ?? 0) * holdedRate;
    invTaxForeign = (inv.tax ?? 0) * holdedRate;
  } else {
    // Holded omits rate; inv.total is in foreign → fetch FOREIGN→EUR from Frankfurter
    const { rate } = await convertToEur(1, currency, date);
    fxRateToEur = rate;
    toForeign = 1;
    invTotalForeign = inv.total ?? 0;
    invTotalEur = invTotalForeign * rate;
    invSubtotalForeign = inv.subtotal ?? 0;
    invTaxForeign = inv.tax ?? 0;
  }

  // Holded keeps status=1 even after full payment; derive from paymentsPending instead.
  const effectiveHoldedStatus =
    inv.paymentsPending === 0 && (inv.paymentsTotal ?? 0) > 0 ? 2 : inv.status;

  const invoice = await prisma.invoice.upsert({
    where: { holdedId_companyId: { holdedId: inv.id, companyId } },
    update: {
      holdedStatus: effectiveHoldedStatus,
      number: inv.docNumber,
      counterparty: inv.contactName,
      holdedContactId: inv.contactId ?? null,
      date,
      dueDate: inv.dueDate ? new Date(inv.dueDate * 1000) : null,
      currency,
      fxRateToEur,
      subtotal: invSubtotalForeign,
      tax: invTaxForeign,
      total: invTotalForeign,
      totalEur: invTotalEur,
      paymentsTotal: (inv.paymentsTotal ?? 0) * toForeign,
      paymentsPending: (inv.paymentsPending ?? (inv.total ?? 0)) * toForeign,
    },
    create: {
      holdedId: inv.id,
      companyId,
      type,
      holdedStatus: effectiveHoldedStatus,
      number: inv.docNumber,
      counterparty: inv.contactName,
      holdedContactId: inv.contactId ?? null,
      date,
      dueDate: inv.dueDate ? new Date(inv.dueDate * 1000) : null,
      currency,
      fxRateToEur,
      subtotal: invSubtotalForeign,
      tax: invTaxForeign,
      total: invTotalForeign,
      totalEur: invTotalEur,
      paymentsTotal: (inv.paymentsTotal ?? 0) * toForeign,
      paymentsPending: (inv.paymentsPending ?? (inv.total ?? 0)) * toForeign,
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

    for (let i = 0; i < inv.products.length; i++) {
      const product = inv.products[i];
      const qty = product.units ?? 0;
      const price = product.price ?? 0;
      const discountPct = product.discount ?? 0;

      let lineTotalEur: number;
      let unitPriceStored: number;
      let lineSubtotalStored: number;
      let lineTotalStored: number;
      let lineTaxStored: number;

      if (holdedRate !== null && currency !== "EUR") {
        // Amounts from Holded are in EUR; compute proportions in EUR then convert to foreign
        const lineSubtotalEur = qty * price * (1 - discountPct / 100);
        // Distribute EUR total proportionally so retentions/extra taxes are accounted for
        lineTotalEur =
          (inv.subtotal ?? 0) !== 0
            ? (lineSubtotalEur / (inv.subtotal ?? 0)) * invTotalEur
            : lineSubtotalEur;
        unitPriceStored = price * holdedRate;
        lineSubtotalStored = lineSubtotalEur * holdedRate;
        lineTotalStored = lineTotalEur * holdedRate;
        lineTaxStored = lineTotalStored - lineSubtotalStored;
      } else {
        // EUR invoice or Frankfurter fallback: amounts are already in the storage currency
        const lineSubtotal = qty * price * (1 - discountPct / 100);
        // Distribute total proportionally so retentions/extra taxes are accounted for
        const lineTotal =
          (inv.subtotal ?? 0) !== 0
            ? (lineSubtotal / (inv.subtotal ?? 0)) * invTotalForeign
            : lineSubtotal;
        lineTotalEur = lineTotal * fxRateToEur;
        unitPriceStored = price;
        lineSubtotalStored = lineSubtotal;
        lineTotalStored = lineTotal;
        lineTaxStored = lineTotal - lineSubtotal;
      }

      const acc = resolveAccount(product.account, accountMaps);
      const newLine = await prisma.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          name: product.name,
          description: product.desc ?? null,
          quantity: qty,
          unitPrice: unitPriceStored,
          subtotal: lineSubtotalStored,
          tax: lineTaxStored,
          total: lineTotalStored,
          totalEur: lineTotalEur,
          accountingAccount: acc.num,
          accountingAccountName: acc.name,
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
            marca: prevClassification.marca,
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

  // Update invoice status and derived marca from existing classifications
  await updateInvoiceStatus(invoice.id);
  await deriveMarcaFromLines(invoice.id);
}

export async function deriveMarcaFromLines(invoiceId: string): Promise<void> {
  const classifications = await prisma.classification.findMany({
    where: { invoiceLine: { invoiceId } },
    include: { project: { include: { workspace: true } } },
  });

  // Only overwrite marca when there are line classifications — otherwise preserve
  // the manually-assigned marca (e.g. set via bulk update without line-level detail)
  if (classifications.length === 0) return;

  const marcas = [
    ...new Set([
      ...classifications.filter((c) => c.project).map((c) => c.project!.workspace.name),
      ...classifications.filter((c) => !c.project && c.marca).map((c) => c.marca!),
      ...classifications.filter((c) => !c.project && !c.marca).map(() => "Awesomely"),
    ]),
  ].sort();

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { marca: marcas.length > 0 ? marcas.join(",") : null },
  });
}

const AUTO_CLASSIFIED_MARCAS = new Set(["Awesomely", "Gigson"]);

export async function updateInvoiceStatus(invoiceId: string): Promise<void> {
  const [invoice, lines] = await Promise.all([
    prisma.invoice.findUnique({ where: { id: invoiceId }, select: { marca: true } }),
    prisma.invoiceLine.findMany({ where: { invoiceId }, include: { classification: true } }),
  ]);

  if (lines.length === 0) return;

  const classified = lines.filter((l) => l.classification !== null).length;

  let status: "PENDING" | "PARTIAL" | "CLASSIFIED" | "APPROVED" = "PENDING";

  if (classified === 0) {
    const marcaValues = (invoice?.marca ?? "").split(",").filter(Boolean);
    const isAutoClassified =
      marcaValues.length > 0 && marcaValues.every((m) => AUTO_CLASSIFIED_MARCAS.has(m));
    status = isAutoClassified ? "CLASSIFIED" : "PENDING";
  } else if (classified < lines.length) {
    status = "PARTIAL";
  } else {
    // All classified — use the minimum status of all lines
    const statuses = lines
      .map((l) => l.classification?.status)
      .filter(Boolean);

    if (statuses.every((s) => s === "APPROVED")) {
      status = "APPROVED";
    } else {
      status = "CLASSIFIED";
    }
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status },
  });
}

// ─── Proforma Sync ─────────────────────────────────────────────────────────────

export async function syncProformas(companyId: string): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const client = new HoldedClient(company.holdedApiKey);
  const proformas = await client.getAllProformasPaginated();

  const seenHoldedIds = new Set<string>();

  for (const pf of proformas) {
    seenHoldedIds.add(pf.id);
    const date = new Date(pf.date * 1000);
    const currency = (pf.currency ?? "EUR").toUpperCase();

    const holdedRate = pf.currencyChange && pf.currencyChange !== 0 ? pf.currencyChange : null;

    let fxRateToEur: number;
    let totalEur: number;
    let subtotalForeign: number;
    let taxForeign: number;
    let totalForeign: number;

    if (currency === "EUR") {
      fxRateToEur = 1;
      totalEur = pf.total ?? 0;
      subtotalForeign = pf.subtotal ?? 0;
      taxForeign = pf.tax ?? 0;
      totalForeign = pf.total ?? 0;
    } else if (holdedRate !== null) {
      fxRateToEur = 1 / holdedRate;
      totalEur = pf.total ?? 0;
      subtotalForeign = (pf.subtotal ?? 0) * holdedRate;
      taxForeign = (pf.tax ?? 0) * holdedRate;
      totalForeign = (pf.total ?? 0) * holdedRate;
    } else {
      const { rate } = await convertToEur(1, currency, date);
      fxRateToEur = rate;
      totalEur = (pf.total ?? 0) * rate;
      subtotalForeign = pf.subtotal ?? 0;
      taxForeign = pf.tax ?? 0;
      totalForeign = pf.total ?? 0;
    }

    const tags = pf.tags ?? [];
    const description = pf.products?.[0]?.name ?? null;

    // Preserve existing classification; auto-map marca from Holded tags on create
    const existing = await prisma.proforma.findUnique({
      where: { holdedId_companyId: { holdedId: pf.id, companyId } },
      select: { marca: true, projectId: true, notes: true },
    });
    const marcaFromTags = tagToBrand(tags);

    await prisma.proforma.upsert({
      where: { holdedId_companyId: { holdedId: pf.id, companyId } },
      update: {
        holdedStatus: pf.status,
        number: pf.docNumber || null,
        counterparty: pf.contactName || null,
        holdedContactId: pf.contactId ?? null,
        date,
        dueDate: pf.dueDate ? new Date(pf.dueDate * 1000) : null,
        currency,
        fxRateToEur,
        subtotal: subtotalForeign,
        tax: taxForeign,
        total: totalForeign,
        totalEur,
        description,
        tags,
        // Preserve manual marca; update auto-mapped marca only if never manually set
        ...(existing?.marca == null && marcaFromTags ? { marca: marcaFromTags } : {}),
      },
      create: {
        holdedId: pf.id,
        companyId,
        holdedStatus: pf.status,
        number: pf.docNumber || null,
        counterparty: pf.contactName || null,
        holdedContactId: pf.contactId ?? null,
        date,
        dueDate: pf.dueDate ? new Date(pf.dueDate * 1000) : null,
        currency,
        fxRateToEur,
        subtotal: subtotalForeign,
        tax: taxForeign,
        total: totalForeign,
        totalEur,
        description,
        tags,
        marca: marcaFromTags,
      },
    });
  }

  // Remove proformas no longer in Holded (no user data to preserve)
  const dbProformas = await prisma.proforma.findMany({
    where: { companyId },
    select: { id: true, holdedId: true },
  });
  const orphanedIds = dbProformas
    .filter((p) => !seenHoldedIds.has(p.holdedId))
    .map((p) => p.id);
  if (orphanedIds.length > 0) {
    await prisma.proforma.deleteMany({ where: { id: { in: orphanedIds } } });
  }
}

// ─── Full sync ─────────────────────────────────────────────────────────────────

export async function syncAll(triggeredBy?: string): Promise<{
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
      syncHoldedCompany(c.id, triggeredBy).catch((e: unknown) => {
        errors.push(`Holded ${c.name}: ${e instanceof Error ? e.message : String(e)}`);
      })
    ),
    ...workspaces.map((w) =>
      syncJiraWorkspace(w.id, triggeredBy).catch((e: unknown) => {
        errors.push(`Jira ${w.name}: ${e instanceof Error ? e.message : String(e)}`);
      })
    ),
  ]);

  return { companies: companies.length, workspaces: workspaces.length, errors };
}
