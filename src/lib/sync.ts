import { prisma } from "./prisma";
import { HoldedClient, HOLDED_SYNC_FROM_YEAR, type HoldedJournalEntry } from "./holded";
import { JiraClient } from "./jira";
import { convertToEur } from "./exchange-rates";
import { InvoiceType, SyncResult, SyncSource } from "@prisma/client";
import { tagToBrand } from "./utils";
import { inferInvoiceRecurrence } from "./invoice-recurrence";

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

  // Process a list of invoices in parallel batches to reduce total sync time
  type AccountMaps = Awaited<ReturnType<HoldedClient["getAccountMaps"]>>;

  const upsertErrors: string[] = [];

  async function upsertBatch(
    invoices: Awaited<ReturnType<HoldedClient["getAllInvoicesPaginated"]>>,
    type: InvoiceType,
    accountMaps: AccountMaps,
    batchSize = 20
  ): Promise<void> {
    for (let i = 0; i < invoices.length; i += batchSize) {
      const chunk = invoices.slice(i, i + batchSize);
      await Promise.all(
        chunk.map((inv) =>
          upsertInvoice(inv, companyId, type, accountMaps)
            .then(() => { invoicesSynced++; })
            .catch((err: unknown) => {
              const msg = `${type} ${inv.id} (${inv.docNumber}): ${err instanceof Error ? err.message : String(err)}`;
              upsertErrors.push(msg);
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

      const keptIds = orphanedIds.filter((id) => !safeIds.includes(id));
      if (keptIds.length > 0) {
        console.warn(`[sync] ${keptIds.length} invoice(s) no longer in Holded but kept because they have classifications or payments`);
        await prisma.invoice.updateMany({
          where: { id: { in: keptIds }, removedFromHoldedAt: null },
          data: { removedFromHoldedAt: new Date() },
        });
        console.log(`[sync] Marked ${keptIds.length} invoice(s) as removed from Holded (kept for classifications)`);
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // Backfill sweep: classify any PURCHASE invoices still without recurrence
  // (covers initial backfill and any that slipped through)
  try {
    const unclassified = await prisma.invoice.findMany({
      where: { companyId, type: InvoiceType.PURCHASE, recurrence: null, removedFromHoldedAt: null },
      select: {
        id: true, type: true, companyId: true, holdedContactId: true,
        counterparty: true, date: true, totalEur: true,
        lines: { select: { name: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      },
    });
    for (const inv of unclassified) {
      const inferred = await inferInvoiceRecurrence(prisma, inv);
      if (inferred !== null) {
        await prisma.invoice.update({ where: { id: inv.id }, data: { recurrence: inferred } });
      }
    }
  } catch (err) {
    console.error("[sync] Error in recurrence backfill sweep:", err);
  }

  const combinedError = errorMessage
    ?? (upsertErrors.length > 0 ? `${upsertErrors.length} upsert errors — first: ${upsertErrors[0]}` : undefined);

  await prisma.syncLog.create({
    data: {
      source: SyncSource.HOLDED,
      result: combinedError ? SyncResult.ERROR : SyncResult.SUCCESS,
      companyId,
      invoicesSynced,
      errorMessage: combinedError ?? null,
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
  // Holded v2 does not return a `from` field on invoices (v1 did), so we can't detect
  // conversion from the API response. Instead we cross-reference by DB:
  // a proforma is considered converted when a SALE invoice exists for the same company,
  // contact, currency and exact native-currency total, dated within 45 days after the proforma.
  await markConvertedProformas(companyId).catch((err: unknown) => {
    console.error("[sync] Error marking converted proformas:", err);
  });

  await syncJournalEntries(companyId).catch((err: unknown) => {
    console.error("[sync] Error syncing journal entries:", err);
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

  const rawPayTotal = (inv.paymentsTotal ?? 0) * toForeign;
  const rawPayPending = (inv.paymentsPending ?? (inv.total ?? 0)) * toForeign;
  if (!Number.isFinite(rawPayTotal) || !Number.isFinite(rawPayPending)) {
    console.error(
      `[sync] NaN payments for ${type} ${inv.id}: paymentsTotal=${inv.paymentsTotal}, paymentsPending=${inv.paymentsPending}, toForeign=${toForeign}, status=${inv.status}, currency=${currency}, currencyChange=${inv.currencyChange}`
    );
  }
  const safePayTotal = Number.isFinite(rawPayTotal) ? rawPayTotal : 0;
  const safePayPending = Number.isFinite(rawPayPending) ? rawPayPending : (invTotalForeign ?? 0);

  // Holded keeps status=1 even after full payment; derive from paymentsPending instead.
  const effectiveHoldedStatus =
    safePayPending === 0 && safePayTotal > 0 ? 2 : inv.status;

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
      paymentsTotal: safePayTotal,
      paymentsPending: safePayPending,
      removedFromHoldedAt: null,
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
      paymentsTotal: safePayTotal,
      paymentsPending: safePayPending,
      removedFromHoldedAt: null,
    },
  });

  // Upsert lines
  if (inv.products && inv.products.length > 0) {
    // Preserve existing classifications before deleting lines.
    // Primary key: line name (when unique within the invoice) — survives reordering between API versions.
    // Fallback: sortOrder (position) — used when the same name appears multiple times.
    const existingLines = await prisma.invoiceLine.findMany({
      where: { invoiceId: invoice.id },
      include: { classification: true },
      orderBy: { sortOrder: "asc" },
    });

    // Count how many times each name appears (to detect ambiguous names)
    const nameCount = new Map<string, number>();
    for (const l of existingLines) nameCount.set(l.name, (nameCount.get(l.name) ?? 0) + 1);

    // Name → classification (only for lines with a unique name that has a classification)
    const classificationByName = new Map(
      existingLines
        .filter((l) => l.classification !== null && nameCount.get(l.name) === 1)
        .map((l) => [l.name, l.classification!])
    );

    // SortOrder → classification (fallback for duplicate names)
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

      // Restore classification: prefer name-match (order-change safe), fall back to position
      const prevClassification =
        classificationByName.get(product.name) ?? classificationBySortOrder.get(i);
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

  // Auto-infer recurrence for new/updated PURCHASE invoices that don't have one yet
  if (invoice.type === InvoiceType.PURCHASE && invoice.recurrence === null) {
    const firstLine = await prisma.invoiceLine.findFirst({
      where: { invoiceId: invoice.id },
      orderBy: { sortOrder: "asc" },
      select: { name: true },
    });
    const inferred = await inferInvoiceRecurrence(prisma, {
      ...invoice,
      lines: firstLine ? [{ name: firstLine.name }] : [],
    });
    if (inferred !== null) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { recurrence: inferred },
      });
    }
  }
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

  let status: "PENDING" | "PARTIAL" | "CLASSIFIED" | "SIN_MARCA" = "PENDING";

  const marcaValues = (invoice?.marca ?? "").split(",").filter(Boolean);
  const isAutoClassifiedMarca =
    marcaValues.length > 0 && marcaValues.every((m) => AUTO_CLASSIFIED_MARCAS.has(m));

  if (marcaValues.length === 0 && !isAutoClassifiedMarca) {
    status = "SIN_MARCA";
  } else if (classified === 0) {
    status = isAutoClassifiedMarca ? "CLASSIFIED" : "PENDING";
  } else if (classified < lines.length) {
    status = isAutoClassifiedMarca ? "CLASSIFIED" : "PARTIAL";
  } else {
    // All classified — use the minimum status of non-ignored lines
    const statuses = lines
      .map((l) => l.classification?.status)
      .filter((s) => s !== undefined && s !== "IGNORED");

    status = "CLASSIFIED";
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status },
  });
}

// ─── Converted-proforma detection ──────────────────────────────────────────────
// Holded v2 API does not expose the proforma→invoice link (v1 had invoice.from.docType).
// We infer conversion by matching: same company + same contact + same currency +
// exact native-currency total + invoice dated within 45 days AFTER the proforma.
// Runs after every invoice+proforma sync so the notification never shows billed proformas.

async function markConvertedProformas(companyId: string): Promise<void> {
  // Window: invoices issued up to 15 days BEFORE the proforma (handles cases where the
  // invoice is dated slightly earlier than the proforma) or up to 45 days AFTER.
  const WINDOW_BEFORE_DAYS = 15;
  const WINDOW_AFTER_DAYS  = 45;

  // Fetch all pending proformas and all sale invoices in two queries, then match in memory.
  const [pendingProformas, saleInvoices] = await Promise.all([
    prisma.proforma.findMany({
      where: {
        companyId,
        holdedStatus: { notIn: [3, -1] },
        holdedContactId: { not: null },
      },
      select: { holdedId: true, holdedContactId: true, currency: true, total: true, totalEur: true, date: true },
    }),
    prisma.invoice.findMany({
      where: {
        companyId,
        type: InvoiceType.SALE,
        holdedStatus: { not: -1 },
        holdedContactId: { not: null },
      },
      select: { holdedContactId: true, currency: true, total: true, totalEur: true, date: true },
    }),
  ]);

  if (pendingProformas.length === 0) return;

  const toNum = (d: unknown): number =>
    typeof d === "object" && d !== null && "toNumber" in (d as object)
      ? (d as { toNumber(): number }).toNumber()
      : Number(d);

  const toFixed2 = (d: unknown): string => toNum(d).toFixed(2);

  // Primary lookup: exact match on contactId + currency + native total
  const exactLookup = new Map<string, Date[]>();
  // Fallback lookup: contactId → list of { totalEur, date } for cross-currency matching
  const eurLookup = new Map<string, { totalEur: number; date: Date }[]>();

  for (const inv of saleInvoices) {
    const exactKey = `${inv.holdedContactId}|${inv.currency}|${toFixed2(inv.total)}`;
    const exactDates = exactLookup.get(exactKey) ?? [];
    exactDates.push(inv.date);
    exactLookup.set(exactKey, exactDates);

    const eurList = eurLookup.get(inv.holdedContactId!) ?? [];
    eurList.push({ totalEur: toNum(inv.totalEur), date: inv.date });
    eurLookup.set(inv.holdedContactId!, eurList);
  }

  const toMarkConverted: string[] = [];
  for (const pf of pendingProformas) {
    const windowStart = new Date(pf.date);
    windowStart.setDate(windowStart.getDate() - WINDOW_BEFORE_DAYS);
    const windowEnd = new Date(pf.date);
    windowEnd.setDate(windowEnd.getDate() + WINDOW_AFTER_DAYS);

    // 1️⃣ Primary: exact currency + amount match
    const exactKey = `${pf.holdedContactId}|${pf.currency}|${toFixed2(pf.total)}`;
    const exactDates = exactLookup.get(exactKey);
    if (exactDates?.some(d => d >= windowStart && d <= windowEnd)) {
      toMarkConverted.push(pf.holdedId);
      continue;
    }

    // 2️⃣ Fallback: match on EUR equivalent ±5% (handles cross-currency billing)
    const pfTotalEur = toNum(pf.totalEur);
    if (pfTotalEur > 0) {
      const eurEntries = eurLookup.get(pf.holdedContactId!) ?? [];
      const hasFallbackMatch = eurEntries.some(({ totalEur, date }) => {
        if (date < windowStart || date > windowEnd) return false;
        const diff = Math.abs(totalEur - pfTotalEur) / pfTotalEur;
        return diff <= 0.05;
      });
      if (hasFallbackMatch) toMarkConverted.push(pf.holdedId);
    }
  }

  if (toMarkConverted.length === 0) return;

  await prisma.proforma.updateMany({
    where: {
      companyId,
      holdedId: { in: toMarkConverted },
      holdedStatus: { notIn: [3, -1] },
    },
    data: { holdedStatus: 3 },
  });

  console.log(`[sync] Marked ${toMarkConverted.length} proforma(s) as converted (contact+amount+date match)`);
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

    // Preserve existing classification and holdedStatus=3 (converted).
    // Holded v2 never updates proforma status on conversion — we set 3 ourselves via
    // markConvertedProformas. We must not let the API reset it back to 1 on every sync.
    const existing = await prisma.proforma.findUnique({
      where: { holdedId_companyId: { holdedId: pf.id, companyId } },
      select: { marca: true, projectId: true, notes: true, holdedStatus: true },
    });
    const marcaFromTags = tagToBrand(tags);

    // Only allow Holded's status if we haven't already marked it as converted (3)
    const effectiveHoldedStatus = existing?.holdedStatus === 3 ? 3 : pf.status;

    await prisma.proforma.upsert({
      where: { holdedId_companyId: { holdedId: pf.id, companyId } },
      update: {
        holdedStatus: effectiveHoldedStatus,
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

// ─── Journal Entry Sync ────────────────────────────────────────────────────────
//
// Sincroniza los asientos contables de Holded que NO proceden de facturas de
// venta o compra (éstas ya están en la tabla invoices).
// Los asientos que sí proceden de facturas se omiten para evitar doble conteo.
//
// Convención de signo en amountEur = crédito − débito:
//   cuentas de gasto (6xx): debit > credit → amountEur < 0
//   cuentas de ingreso (7xx): credit > debit → amountEur > 0

// Tipos de documento Holded que ya están cubiertos por el sync de facturas.
// Cualquier otro tipo (payroll, manual, bank, depreciation, null…) se importa.
const HOLDED_INVOICE_DOC_TYPES = new Set([
  "invoice", "invoicing", "sale", "sales", "sale_invoice", "sales_invoice",
  "purchase", "purchase_invoice", "bill", "expense", "income",
]);

// Solo almacenamos líneas de cuentas de P&L (6xx gastos, 7xx ingresos).
// Las cuentas de balance (1xx-5xx, 8xx-9xx) se descartan.
function isPlAccount(account: string): boolean {
  const first = account.replace(/\D/g, "")[0];
  return first === "6" || first === "7";
}

export async function syncJournalEntries(companyId: string): Promise<number> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const client  = new HoldedClient(company.holdedApiKey);

  const currentYear         = new Date().getFullYear();
  let   totalSynced         = 0;
  const allReturnedEntryIds = new Set<string>();

  for (let year = HOLDED_SYNC_FROM_YEAR; year <= currentYear; year++) {
    let entries: HoldedJournalEntry[];
    try {
      entries = await client.getJournalEntries(year);
    } catch (err) {
      console.error(`[sync] Journal entries year=${year} company=${companyId}:`, err);
      continue;
    }

    for (const entry of entries) {
      // Omitir asientos auto-generados por facturas (ya en invoice sync)
      const docType = (entry.documentType ?? "").toLowerCase();
      if (docType && HOLDED_INVOICE_DOC_TYPES.has(docType)) continue;

      allReturnedEntryIds.add(entry.id);
      const date = new Date(entry.date);

      // Solo líneas de cuentas P&L (6xx / 7xx)
      const plLines = entry.lines.filter((l) => isPlAccount(l.account));

      for (let idx = 0; idx < plLines.length; idx++) {
        const line      = plLines[idx];
        const amountEur = line.credit - line.debit;

        if (amountEur === 0) continue;

        try {
          await prisma.journalEntryLine.upsert({
            where: {
              companyId_holdedEntryId_holdedLineIdx: {
                companyId,
                holdedEntryId: entry.id,
                holdedLineIdx: idx,
              },
            },
            update: {
              date,
              description: entry.description ?? line.description ?? null,
              account:     line.account,
              amountEur,
              originType:  entry.documentType ?? null,
            },
            create: {
              companyId,
              holdedEntryId: entry.id,
              holdedLineIdx: idx,
              date,
              description: entry.description ?? line.description ?? null,
              account:     line.account,
              amountEur,
              originType:  entry.documentType ?? null,
            },
          });
          totalSynced++;
        } catch (err) {
          console.error(
            `[sync] JournalEntryLine upsert error entry=${entry.id} idx=${idx}:`, err
          );
        }
      }
    }
  }

  // Eliminar líneas de asientos que Holded ya no devuelve
  // (los journal entries no tienen datos de usuario, se pueden borrar sin riesgo)
  if (allReturnedEntryIds.size > 0) {
    const dbLines = await prisma.journalEntryLine.findMany({
      where:  { companyId },
      select: { id: true, holdedEntryId: true },
    });
    const orphanIds = dbLines
      .filter((l) => !allReturnedEntryIds.has(l.holdedEntryId))
      .map((l) => l.id);
    if (orphanIds.length > 0) {
      await prisma.journalEntryLine.deleteMany({ where: { id: { in: orphanIds } } });
      console.log(
        `[sync] Eliminados ${orphanIds.length} journal entry lines huérfanos (company=${companyId})`
      );
    }
  }

  console.log(`[sync] Journal entries company=${companyId}: ${totalSynced} líneas P&L sincronizadas`);
  return totalSynced;
}

// ─── Full sync ─────────────────────────────────────────────────────────────────

export type SyncProgressEvent =
  | { type: "init"; items: Array<{ source: "HOLDED" | "JIRA"; entityId: string; entityName: string }> }
  | { type: "update"; source: "HOLDED" | "JIRA"; entityId: string; status: "done" | "error"; error?: string }
  | { type: "complete"; companies: number; workspaces: number; errors: string[] }
  | { type: "fatal"; error: string };

export async function syncAll(
  triggeredBy?: string,
  onProgress?: (event: SyncProgressEvent) => void
): Promise<{
  companies: number;
  workspaces: number;
  errors: string[];
}> {
  const [companies, workspaces] = await Promise.all([
    prisma.company.findMany({ where: { active: true } }),
    prisma.jiraWorkspace.findMany({ where: { active: true } }),
  ]);

  // Announce all sources upfront so the UI can show spinners for everything
  onProgress?.({
    type: "init",
    items: [
      ...companies.map((c) => ({ source: "HOLDED" as const, entityId: c.id, entityName: c.name })),
      ...workspaces.map((w) => ({ source: "JIRA" as const, entityId: w.id, entityName: w.name })),
    ],
  });

  const errors: string[] = [];

  await Promise.allSettled([
    ...companies.map((c) =>
      syncHoldedCompany(c.id, triggeredBy)
        .then(() => {
          onProgress?.({ type: "update", source: "HOLDED", entityId: c.id, status: "done" });
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Holded ${c.name}: ${msg}`);
          onProgress?.({ type: "update", source: "HOLDED", entityId: c.id, status: "error", error: msg });
        })
    ),
    ...workspaces.map((w) =>
      syncJiraWorkspace(w.id, triggeredBy)
        .then(() => {
          onProgress?.({ type: "update", source: "JIRA", entityId: w.id, status: "done" });
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Jira ${w.name}: ${msg}`);
          onProgress?.({ type: "update", source: "JIRA", entityId: w.id, status: "error", error: msg });
        })
    ),
  ]);

  return { companies: companies.length, workspaces: workspaces.length, errors };
}
