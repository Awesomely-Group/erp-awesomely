import { prisma } from "./prisma";
import {
  HoldedClient,
  HOLDED_SYNC_FROM_YEAR,
  createHoldedApiStats,
  type HoldedApiStats,
  type HoldedInvoice,
  type HoldedJournalEntry,
  type HoldedSalaryRecordDetail,
  type HoldedSalaryRecordSummary,
} from "./holded";
import {
  resolveSyncScope,
  yearsInScope,
  type SyncMode,
  type SyncScope,
} from "./sync-scope";
import { JiraClient } from "./jira";
import { InvoiceType, Prisma, SyncResult, SyncSource } from "@prisma/client";
import { tagToBrand } from "./utils";
import { inferInvoiceRecurrence } from "./invoice-recurrence";

// ─── Contexto de sincronización ────────────────────────────────────────────────
//
// `scope` decide cuánta historia se relee (ver sync-scope.ts) y `stats` es el
// contador de llamadas compartido por todas las fases, para poder registrar en
// SyncLog lo que ha costado realmente la ejecución.

export interface SyncContext {
  scope: SyncScope;
  stats: HoldedApiStats;
}

export function createSyncContext(mode: SyncMode = "full"): SyncContext {
  return {
    scope: resolveSyncScope(mode, { fromYear: HOLDED_SYNC_FROM_YEAR }),
    stats: createHoldedApiStats(),
  };
}

// ─── Jira Sync ─────────────────────────────────────────────────────────────────

export async function syncJiraWorkspace(
  workspaceId: string,
  triggeredBy?: string,
): Promise<void> {
  const workspace = await prisma.jiraWorkspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  const startedAt = new Date();
  let projectsSynced = 0;
  let errorMessage: string | undefined;

  try {
    const client = new JiraClient(
      workspace.domain,
      workspace.email,
      workspace.apiToken,
    );
    const projects = await client.getAllProjects();

    for (const project of projects) {
      await prisma.jiraProject.upsert({
        where: { jiraId_workspaceId: { jiraId: project.id, workspaceId } },
        update: {
          jiraKey: project.key,
          name: project.name,
          active: !project.archived,
        },
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
      where: {
        workspaceId,
        jiraId: { notIn: [...returnedJiraIds] },
        active: true,
      },
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

export async function syncSuppliers(
  companyId: string,
  ctx: SyncContext = createSyncContext(),
): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });
  const client = new HoldedClient(company.holdedApiKey, ctx.stats);
  const contacts = await client.getSupplierContacts();

  const activeHoldedIds = new Set(contacts.map((c) => c.id));

  for (const contact of contacts) {
    await prisma.supplier.upsert({
      where: {
        holdedContactId_companyId: { holdedContactId: contact.id, companyId },
      },
      create: { holdedContactId: contact.id, companyId, name: contact.name },
      update: { name: contact.name, active: true },
    });
  }

  // Deactivate suppliers no longer classified as supplier-type in Holded
  await prisma.supplier.updateMany({
    where: {
      companyId,
      holdedContactId: { notIn: [...activeHoldedIds] },
      active: true,
    },
    data: { active: false },
  });
}

// ─── Holded Sync ───────────────────────────────────────────────────────────────

export async function syncHoldedCompany(
  companyId: string,
  triggeredBy?: string,
  ctx: SyncContext = createSyncContext(),
): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  const { scope } = ctx;
  const startedAt = new Date();
  let invoicesSynced = 0;
  let errorMessage: string | undefined;

  // Process a list of invoices in parallel batches to reduce total sync time
  type AccountMaps = Awaited<ReturnType<HoldedClient["getAccountMaps"]>>;

  type UpsertError = {
    type: string;
    holdedId: string;
    docNumber: string;
    error: string;
  };
  const upsertErrors: UpsertError[] = [];
  let fetchedIds: string[] = [];
  /** Listados que llegaron truncados; mientras haya alguno no se borra nada. */
  const truncations: string[] = [];

  async function upsertBatch(
    invoices: HoldedInvoice[],
    type: InvoiceType,
    accountMaps: AccountMaps,
    batchSize = 20,
  ): Promise<void> {
    for (let i = 0; i < invoices.length; i += batchSize) {
      const chunk = invoices.slice(i, i + batchSize);
      await Promise.all(
        chunk.map((inv) =>
          upsertInvoice(inv, companyId, type, accountMaps)
            .then(() => {
              invoicesSynced++;
            })
            .catch((err: unknown) => {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.error(
                `[sync] upsertInvoice failed: ${type} ${inv.id} (${inv.docNumber}):`,
                errMsg,
              );
              upsertErrors.push({
                type: String(type),
                holdedId: inv.id,
                docNumber: inv.docNumber,
                error: errMsg,
              });
            }),
        ),
      );
    }
  }

  try {
    const client = new HoldedClient(company.holdedApiKey, ctx.stats);

    // Fetch chart of accounts and both invoice types in parallel.
    // /invoices (ventas) se pide sin filtro de fecha y paginado por cursor hasta
    // el final, porque los borrados de ventas se reconcilian en los dos modos.
    // /purchases se pide en una sola ventana de fechas, también paginada: el
    // ámbito recorta el tamaño de la ventana, no el número de llamadas.
    const [accountMaps, sales, purchases] = await Promise.all([
      client.getAccountMaps(),
      client.getAllInvoicesPaginated("invoice"),
      client.getAllInvoicesPaginated("purchase", { fromDate: scope.fromDate }),
    ]);

    const salesInvoices = sales.documents;
    const purchaseInvoices = purchases.documents;

    if (!sales.complete) {
      truncations.push(`ventas: ${sales.incompleteReason ?? "listado incompleto"}`);
    }
    if (!purchases.complete) {
      truncations.push(
        `compras: ${purchases.incompleteReason ?? "listado incompleto"}`,
      );
    }

    fetchedIds = [
      ...salesInvoices.map((i) => i.id),
      ...purchaseInvoices.map((i) => i.id),
    ];

    // Guardar lo recibido siempre es seguro: el upsert añade y actualiza, nunca
    // quita. Lo que no puede hacerse sobre una lista a medias es lo de después.
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

    // La reconciliación de borrados solo es válida sobre lo que se ha pedido a
    // Holded *y* ha llegado entero. Son dos condiciones distintas, y se evalúan
    // por tipo de documento:
    //
    //   · Ámbito: en incremental las compras anteriores a la ventana no se han
    //     consultado. Incluirlas aquí las marcaría como huérfanas y vaciaría la
    //     histórica. Las ventas se piden enteras, así que se reconcilian siempre.
    //   · Integridad: si el listado llegó truncado faltan documentos que sí
    //     existen. No haber preguntado y no haber recibido se parecen desde
    //     aquí —en los dos casos el documento no está en la lista— y los dos
    //     acaban borrando lo que no toca.
    const reconcileScopes: Prisma.InvoiceWhereInput[] = [];
    if (sales.complete) {
      reconcileScopes.push({ type: InvoiceType.SALE });
    }
    if (purchases.complete) {
      reconcileScopes.push(
        scope.mode === "full"
          ? { type: InvoiceType.PURCHASE }
          : { type: InvoiceType.PURCHASE, date: { gte: scope.fromDate } },
      );
    }

    if (truncations.length > 0) {
      console.error(
        `[sync] company=${companyId}: no se reconcilian borrados donde el listado llegó incompleto — ${truncations.join(" | ")}`,
      );
    }

    const dbInvoices =
      reconcileScopes.length === 0
        ? []
        : await prisma.invoice.findMany({
            where: { companyId, OR: reconcileScopes },
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
        console.log(
          `[sync] Deleted ${safeIds.length} invoice(s) removed from Holded for company ${companyId}`,
        );
      }

      const keptIds = orphanedIds.filter((id) => !safeIds.includes(id));
      if (keptIds.length > 0) {
        console.warn(
          `[sync] ${keptIds.length} invoice(s) no longer in Holded but kept because they have classifications or payments`,
        );
        await prisma.invoice.updateMany({
          where: { id: { in: keptIds }, removedFromHoldedAt: null },
          data: { removedFromHoldedAt: new Date() },
        });
        console.log(
          `[sync] Marked ${keptIds.length} invoice(s) as removed from Holded (kept for classifications)`,
        );
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // Backfill sweep: classify any PURCHASE invoices still without recurrence
  // (covers initial backfill and any that slipped through)
  try {
    const unclassified = await prisma.invoice.findMany({
      where: {
        companyId,
        type: InvoiceType.PURCHASE,
        recurrence: null,
        removedFromHoldedAt: null,
      },
      select: {
        id: true,
        type: true,
        companyId: true,
        holdedContactId: true,
        counterparty: true,
        date: true,
        totalEur: true,
        lines: {
          select: { name: true },
          orderBy: { sortOrder: "asc" },
          take: 1,
        },
      },
    });
    for (const inv of unclassified) {
      const inferred = await inferInvoiceRecurrence(prisma, inv);
      if (inferred !== null) {
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { recurrence: inferred },
        });
      }
    }
  } catch (err) {
    console.error("[sync] Error in recurrence backfill sweep:", err);
  }

  const combinedError =
    errorMessage ??
    (upsertErrors.length > 0
      ? `${upsertErrors.length} upsert errors — first: ${upsertErrors[0].error}`
      : undefined);

  // Un listado truncado no es un error de ejecución —los documentos recibidos se
  // han guardado— pero sí deja el sync a medias: se registra como PARCIAL para
  // que se vea en /sync, en vez de quedar solo en los logs de la función.
  const truncationWarning =
    truncations.length > 0
      ? `Listado(s) incompleto(s) de Holded — reconciliación de borrados omitida: ${truncations.join(" | ")}`
      : undefined;

  const syncLog = await prisma.syncLog.create({
    data: {
      source: SyncSource.HOLDED,
      result: combinedError
        ? SyncResult.ERROR
        : truncationWarning
          ? SyncResult.PARTIAL
          : SyncResult.SUCCESS,
      companyId,
      invoicesSynced,
      errorMessage: combinedError ?? truncationWarning ?? null,
      details: {
        mode: scope.mode,
        fromDate: scope.fromDate.toISOString(),
        ...(truncations.length > 0 ? { truncations } : {}),
        ...(fetchedIds.length > 0 ? { fetchedIds } : {}),
        ...(upsertErrors.length > 0 ? { upsertErrors } : {}),
      },
      triggeredBy: triggeredBy ?? null,
      startedAt,
      finishedAt: new Date(),
    },
    select: { id: true },
  });

  await syncSuppliers(companyId, ctx).catch((err: unknown) => {
    console.error("[sync] Error syncing suppliers:", err);
  });

  await syncProformas(companyId, ctx).catch((err: unknown) => {
    console.error("[sync] Error syncing proformas:", err);
  });

  // Resolve each SALE invoice's source document (Holded's `from` field — only exposed on
  // the per-document detail endpoint, GET /invoices/{id}, not on the list endpoint used by
  // syncProformas/syncHoldedCompany above). Cached via sourceDocumentChecked so this only
  // costs an extra API call once per invoice, not on every sync.
  await resolveInvoiceSourceDocuments(companyId, ctx).catch((err: unknown) => {
    console.error("[sync] Error resolving invoice source documents:", err);
  });

  // Primary detection: link a proforma to the invoice it was converted into using Holded's
  // own recorded relation (deterministic, no guessing).
  await linkProformasByHoldedRelation(companyId).catch((err: unknown) => {
    console.error("[sync] Error linking proformas by Holded relation:", err);
  });

  // Fallback ONLY for proformas that resolveInvoiceSourceDocuments/linkProformasByHoldedRelation
  // could not resolve (e.g. invoices predating this account's proforma-tracking, or a
  // temporary API gap). Never runs for proformas that already have invoiceId set.
  await markConvertedProformas(companyId).catch((err: unknown) => {
    console.error("[sync] Error marking converted proformas:", err);
  });

  await syncJournalEntries(companyId, ctx).catch((err: unknown) => {
    console.error("[sync] Error syncing journal entries:", err);
  });

  await syncEmployeesAndSalaryRecords(companyId, ctx).catch((err: unknown) => {
    console.error("[sync] Error syncing employees/salary records:", err);
  });

  // Coste real de la ejecución. La cuota de Holded se mide en llamadas, así que
  // queda registrado para poder comparar incremental vs full desde /sync-logs.
  console.log(
    `[sync] company=${companyId} mode=${scope.mode} desde=${scope.fromDate
      .toISOString()
      .slice(0, 10)} → ${ctx.stats.total} llamadas a la API de Holded`,
  );
  await prisma.syncLog
    .update({
      where: { id: syncLog.id },
      data: {
        details: {
          mode: scope.mode,
          fromDate: scope.fromDate.toISOString(),
          apiCalls: {
            total: ctx.stats.total,
            byEndpoint: ctx.stats.byEndpoint,
          },
          ...(truncations.length > 0 ? { truncations } : {}),
          ...(fetchedIds.length > 0 ? { fetchedIds } : {}),
          ...(upsertErrors.length > 0 ? { upsertErrors } : {}),
        },
      },
    })
    .catch((err: unknown) => {
      console.error("[sync] No se pudo registrar el coste de API:", err);
    });

  if (errorMessage) throw new Error(errorMessage);
}

type AccountMaps = Awaited<ReturnType<HoldedClient["getAccountMaps"]>>;

function resolveAccount(
  raw: string | { id?: string; num?: string; name?: string } | undefined,
  maps: AccountMaps,
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
  inv: HoldedInvoice,
  companyId: string,
  type: InvoiceType,
  accountMaps: AccountMaps = { byNum: new Map(), byId: new Map() },
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
    // Holded omite currency_change SIEMPRE en el endpoint de listado (/invoices,
    // /purchases) que usamos en el sync en bloque — solo lo devuelve el endpoint de
    // detalle de un documento individual. Antes caíamos aquí a un tipo BCE (Frankfurter)
    // calculado por nosotros, pero verificado contra el PyG real de Holded (ver
    // docs/PLAN-fix-pl-reconciliation.md, "Estado tras verificación real"): el propio
    // asiento contable que Holded genera para estas facturas guarda el importe en la
    // divisa original de la factura, no convertido — es decir, Holded tampoco aplica
    // una conversión real aquí, trata el importe como si ya fuera EUR. El BCE producía
    // una cifra de ventas ~7.000€ por encima de la real para una empresa con toda su
    // facturación en GBP/USD; con fxRateToEur=1 el PyG cuadra exacto.
    fxRateToEur = 1;
    toForeign = 1;
    invTotalForeign = inv.total ?? 0;
    invTotalEur = invTotalForeign;
    invSubtotalForeign = inv.subtotal ?? 0;
    invTaxForeign = inv.tax ?? 0;
  }

  const rawPayTotal = (inv.paymentsTotal ?? 0) * toForeign;
  const rawPayPending = (inv.paymentsPending ?? inv.total ?? 0) * toForeign;
  if (!Number.isFinite(rawPayTotal) || !Number.isFinite(rawPayPending)) {
    console.error(
      `[sync] NaN payments for ${type} ${inv.id}: paymentsTotal=${inv.paymentsTotal}, paymentsPending=${inv.paymentsPending}, toForeign=${toForeign}, status=${inv.status}, currency=${currency}, currencyChange=${inv.currencyChange}`,
    );
  }
  const safePayTotal = Number.isFinite(rawPayTotal) ? rawPayTotal : 0;
  const safePayPending = Number.isFinite(rawPayPending)
    ? rawPayPending
    : (invTotalForeign ?? 0);

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
    for (const l of existingLines)
      nameCount.set(l.name, (nameCount.get(l.name) ?? 0) + 1);

    // Name → classification (only for lines with a unique name that has a classification)
    const classificationByName = new Map(
      existingLines
        .filter((l) => l.classification !== null && nameCount.get(l.name) === 1)
        .map((l) => [l.name, l.classification!]),
    );

    // SortOrder → classification (fallback for duplicate names)
    const classificationBySortOrder = new Map(
      existingLines
        .filter((l) => l.classification !== null)
        .map((l) => [l.sortOrder, l.classification!]),
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
        classificationByName.get(product.name) ??
        classificationBySortOrder.get(i);
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
      ...classifications
        .filter((c) => c.project)
        .map((c) => c.project!.workspace.name),
      ...classifications
        .filter((c) => !c.project && c.marca)
        .map((c) => c.marca!),
      ...classifications
        .filter((c) => !c.project && !c.marca)
        .map(() => "Awesomely"),
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
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { marca: true },
    }),
    prisma.invoiceLine.findMany({
      where: { invoiceId },
      include: { classification: true },
    }),
  ]);

  if (lines.length === 0) return;

  const classified = lines.filter((l) => l.classification !== null).length;

  let status: "PENDING" | "PARTIAL" | "CLASSIFIED" | "SIN_MARCA" = "PENDING";

  const marcaValues = (invoice?.marca ?? "").split(",").filter(Boolean);
  const isAutoClassifiedMarca =
    marcaValues.length > 0 &&
    marcaValues.every((m) => AUTO_CLASSIFIED_MARCAS.has(m));

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

// ─── Converted-proforma detection (legacy fallback) ────────────────────────────
// Deterministic detection now happens in linkProformasByHoldedRelation(), using Holded's
// own recorded proforma→invoice relation (the `from` field on the invoice's detail
// endpoint). This heuristic only runs as a fallback for proformas that could NOT be
// resolved that way (e.g. invoices predating this account's proforma-tracking, or a
// temporary gap in resolveInvoiceSourceDocuments) — it never touches a proforma that
// already has `invoiceId` set. Kept unchanged (same thresholds as before) since it's now
// a narrow safety net rather than the primary mechanism.
// It infers conversion by matching: same company + same contact + same currency +
// exact native-currency total + invoice dated within 45 days AFTER the proforma.

async function markConvertedProformas(companyId: string): Promise<void> {
  // Window: invoices issued up to 15 days BEFORE the proforma (handles cases where the
  // invoice is dated slightly earlier than the proforma) or up to 45 days AFTER.
  const WINDOW_BEFORE_DAYS = 15;
  const WINDOW_AFTER_DAYS = 45;

  // Fetch all pending proformas and all sale invoices in two queries, then match in memory.
  const [pendingProformas, saleInvoices] = await Promise.all([
    prisma.proforma.findMany({
      where: {
        companyId,
        holdedStatus: { notIn: [3, -1] },
        invoiceId: null,
        holdedContactId: { not: null },
      },
      select: {
        holdedId: true,
        holdedContactId: true,
        currency: true,
        total: true,
        totalEur: true,
        date: true,
      },
    }),
    prisma.invoice.findMany({
      where: {
        companyId,
        type: InvoiceType.SALE,
        holdedStatus: { not: -1 },
        holdedContactId: { not: null },
      },
      select: {
        holdedContactId: true,
        currency: true,
        total: true,
        totalEur: true,
        date: true,
      },
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
    if (exactDates?.some((d) => d >= windowStart && d <= windowEnd)) {
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
      invoiceId: null,
    },
    data: { holdedStatus: 3, invoiceLinkConfidence: "amount_match" },
  });

  console.log(
    `[sync] Marked ${toMarkConverted.length} proforma(s) as converted (contact+amount+date match, no Holded-native link found)`,
  );
}

// ─── Invoice source-document resolution ────────────────────────────────────────
// Holded's `from: { id, doc_type }` field — the real, deterministic record of what
// document an invoice was created from (e.g. a proforma) — is only exposed on the
// per-document detail endpoint (GET /invoices/{id}), not on the list endpoint used by
// getAllInvoicesPaginated(). This resolves it once per invoice and caches the result
// locally (sourceDocumentChecked) so subsequent syncs don't re-fetch it.

async function resolveInvoiceSourceDocuments(
  companyId: string,
  ctx: SyncContext = createSyncContext(),
): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });
  const client = new HoldedClient(company.holdedApiKey, ctx.stats);

  const unresolvedInvoices = await prisma.invoice.findMany({
    where: { companyId, type: InvoiceType.SALE, sourceDocumentChecked: false },
    select: { id: true, holdedId: true },
  });

  if (unresolvedInvoices.length === 0) return;

  const BATCH_SIZE = 10;
  let resolvedCount = 0;

  for (let i = 0; i < unresolvedInvoices.length; i += BATCH_SIZE) {
    const chunk = unresolvedInvoices.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(async (inv) => {
        try {
          const detail = await client.getDocumentById("invoice", inv.holdedId);
          await prisma.invoice.update({
            where: { id: inv.id },
            data: {
              sourceDocumentHoldedId: detail?.from?.id ?? null,
              sourceDocumentType: detail?.from?.docType ?? null,
              sourceDocumentChecked: true,
            },
          });
          if (detail?.from) resolvedCount++;
        } catch (err) {
          console.error(
            `[sync] Error resolving source document for invoice ${inv.holdedId}:`,
            err,
          );
        }
      }),
    );
  }

  console.log(
    `[sync] Resolved source documents for ${unresolvedInvoices.length} invoice(s), ${resolvedCount} had a source document`,
  );
}

// ─── Proforma↔invoice linking via Holded's native relation ────────────────────
// Deterministic — no amount/date guessing. If Holded recorded that an invoice came from
// one of our proformas, trust it directly.

async function linkProformasByHoldedRelation(companyId: string): Promise<void> {
  const linkedInvoices = await prisma.invoice.findMany({
    where: {
      companyId,
      type: InvoiceType.SALE,
      sourceDocumentType: "proform",
      sourceDocumentHoldedId: { not: null },
    },
    select: { id: true, sourceDocumentHoldedId: true },
  });

  if (linkedInvoices.length === 0) return;

  let linkedCount = 0;
  for (const inv of linkedInvoices) {
    const result = await prisma.proforma.updateMany({
      where: {
        companyId,
        holdedId: inv.sourceDocumentHoldedId!,
        invoiceLinkedManually: false,
        OR: [{ invoiceId: null }, { invoiceId: { not: inv.id } }],
      },
      data: {
        invoiceId: inv.id,
        invoiceLinkConfidence: "holded_link",
        holdedStatus: 3,
      },
    });
    linkedCount += result.count;
  }

  if (linkedCount > 0) {
    console.log(
      `[sync] Linked ${linkedCount} proforma(s) to their invoice via Holded's native relation`,
    );
  }
}

// ─── Proforma Sync ─────────────────────────────────────────────────────────────

export async function syncProformas(
  companyId: string,
  ctx: SyncContext = createSyncContext(),
): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });
  const client = new HoldedClient(company.holdedApiKey, ctx.stats);
  const proformaList = await client.getAllProformasPaginated({
    fromDate: ctx.scope.fromDate,
  });

  const seenHoldedIds = new Set<string>();

  for (const pf of proformaList.documents) {
    seenHoldedIds.add(pf.id);
    const date = new Date(pf.date * 1000);
    const currency = (pf.currency ?? "EUR").toUpperCase();

    const holdedRate =
      pf.currencyChange && pf.currencyChange !== 0 ? pf.currencyChange : null;

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
      // Mismo criterio que upsertInvoice: Holded no da currency_change en el listado
      // de proformas y, para esta cuenta, tampoco aplica conversión real — se trata el
      // importe como si ya fuera EUR en vez de recalcularlo con el tipo BCE.
      fxRateToEur = 1;
      totalEur = pf.total ?? 0;
      subtotalForeign = pf.subtotal ?? 0;
      taxForeign = pf.tax ?? 0;
      totalForeign = pf.total ?? 0;
    }

    const tags = pf.tags ?? [];
    const description = pf.products?.[0]?.name ?? null;

    // Preserve existing classification, holdedStatus=3 (converted) and any established
    // proforma→invoice link. Holded v2 never updates proforma status on conversion — we set
    // 3 ourselves via linkProformasByHoldedRelation/markConvertedProformas. We must not let
    // the API reset it, or the link, back on every resync.
    const existing = await prisma.proforma.findUnique({
      where: { holdedId_companyId: { holdedId: pf.id, companyId } },
      select: {
        marca: true,
        projectId: true,
        notes: true,
        holdedStatus: true,
        invoiceId: true,
        invoiceLinkedManually: true,
        invoiceLinkConfidence: true,
      },
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
        ...(existing?.marca == null && marcaFromTags
          ? { marca: marcaFromTags }
          : {}),
        // Never let a resync clobber an already-established proforma→invoice link
        // (automatic or manual) — linkProformasByHoldedRelation/markConvertedProformas/the
        // manual linking action are the only things allowed to change these.
        ...(existing?.invoiceId
          ? {
              invoiceId: existing.invoiceId,
              invoiceLinkedManually: existing.invoiceLinkedManually,
              invoiceLinkConfidence: existing.invoiceLinkConfidence,
            }
          : {}),
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

  // Remove proformas no longer in Holded (no user data to preserve).
  // Igual que con las facturas: en incremental solo se ha consultado la ventana,
  // así que fuera de ella no se puede concluir que una proforma haya desaparecido.
  // Y si el listado llegó truncado no se borra nada: aquí el borrado es directo,
  // sin la red de seguridad de "solo si no tiene trabajo del usuario".
  if (!proformaList.complete) {
    console.error(
      `[sync] company=${companyId}: listado de proformas incompleto, no se borra ninguna — ${
        proformaList.incompleteReason ?? "motivo desconocido"
      }`,
    );
    return;
  }

  const dbProformas = await prisma.proforma.findMany({
    where:
      ctx.scope.mode === "full"
        ? { companyId }
        : { companyId, date: { gte: ctx.scope.fromDate } },
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

// Tipos de asiento de /api/v2/ledger-entries que NO deben sincronizarse como
// journal_entry_lines para evitar doble contabilización o datos incorrectos:
//   - invoice / purchase: ya cubiertos por el sync de facturas (revenueRows +
//     expenseRows en la tabla invoices) — sus líneas 6xx/7xx NO deben duplicarse
//     aquí. getAllInvoicesPaginated solo trae "invoice"/"purchase", nunca los
//     demás tipos de este Set, así que no hay riesgo de doble conteo con ellos.
//   - opening:          asiento de apertura — saldos iniciales de balance, no P&L.
//   - reg:              asiento de regularización/cierre anual (carga a P&G) — ya
//                       queda reflejado en el resultado del ejercicio, no debe
//                       incluirse en el cálculo de líneas individuales.
//   - vat_regularization: regularización de IVA — cuenta 47x (balance).
// Tipos incluidos (no en esta lista, SÍ se sincronizan como journal_entry_lines):
//   - purchaserefund: rectificativas de compra — no existe endpoint de facturas
//     para importarlas de otra forma (/api/v2/purchaserefunds da 404), así que
//     esta es su única vía de entrada al P&L.
//   - collect: cobros de clientes — normalmente solo tocan cuentas de balance
//     (430/57x, excluidas por isPlAccount), pero cuando afectan a una cuenta
//     6xx/7xx (u OU mapeada) sí debe contabilizarse.
//   - payroll, entry, expense, payment, creditnote, amortization, y cualquier
//     otro tipo que Holded pueda añadir en el futuro.
const HOLDED_INVOICE_DOC_TYPES = new Set([
  "invoice", // facturas de venta → revenueRows
  "purchase", // facturas de compra → expenseRows
  "opening", // asiento de apertura → balance, no P&L
  "reg", // cierre anual → no debe sumarse a las líneas del período
  "vat_regularization", // regularización IVA → cuenta 47x (balance)
]);

// Solo almacenamos líneas de cuentas de P&L (6xx gastos, 7xx ingresos), más las
// cuentas del plan contable OU (Estonia) que account_mappings traduce explícitamente
// a una cuenta PGC 6xx/7xx (coincidencia exacta con accountNumOU o accountNumSL).
// El resto de cuentas de balance (1xx-5xx, 8xx-9xx sin mapear) se descartan.
function isPlAccount(account: string, mappedAccounts: Set<string>): boolean {
  const digits = account.replace(/\D/g, "");
  const first = digits[0];
  if (first === "6" || first === "7") return true;
  return mappedAccounts.has(digits);
}

export async function syncJournalEntries(
  companyId: string,
  ctx: SyncContext = createSyncContext(),
): Promise<number> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });
  const client = new HoldedClient(company.holdedApiKey, ctx.stats);

  // Cuentas OU↔SL mapeadas explícitamente (account_mappings), cargadas una única vez
  // por sync — permiten que isPlAccount reconozca cuentas del plan contable estonio
  // que no empiezan por 6/7 pero sí representan gasto/ingreso real.
  const accountMappingRows = await prisma.accountMapping.findMany({
    select: { accountNumOU: true, accountNumSL: true },
  });
  const mappedAccounts = new Set<string>();
  for (const m of accountMappingRows) {
    if (m.accountNumOU) mappedAccounts.add(m.accountNumOU);
    if (m.accountNumSL) mappedAccounts.add(m.accountNumSL);
  }

  let totalSynced = 0;
  const allReturnedEntryIds = new Set<string>();

  // El mayor se pide por año y cada año son varias páginas de 200 líneas: es la
  // llamada más cara del sync. En incremental solo se releen los ejercicios que
  // toca la ventana — los años cerrados ya no cambian.
  for (const year of yearsInScope(ctx.scope)) {
    let entries: HoldedJournalEntry[];
    try {
      entries = await client.getJournalEntries(year);
    } catch (err) {
      console.error(
        `[sync] Journal entries year=${year} company=${companyId}:`,
        err,
      );
      continue;
    }

    for (const entry of entries) {
      // Omitir asientos auto-generados por facturas (ya en invoice sync)
      const docType = (entry.documentType ?? "").toLowerCase();
      if (docType && HOLDED_INVOICE_DOC_TYPES.has(docType)) continue;

      allReturnedEntryIds.add(entry.id);
      const date = new Date(entry.date);

      // Solo líneas de cuentas P&L (6xx / 7xx, o cuentas OU mapeadas explícitamente)
      const plLines = entry.lines.filter((l) =>
        isPlAccount(l.account, mappedAccounts),
      );

      for (let idx = 0; idx < plLines.length; idx++) {
        const line = plLines[idx];
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
              account: line.account,
              amountEur,
              originType: entry.documentType ?? null,
            },
            create: {
              companyId,
              holdedEntryId: entry.id,
              holdedLineIdx: idx,
              date,
              description: entry.description ?? line.description ?? null,
              account: line.account,
              amountEur,
              originType: entry.documentType ?? null,
            },
          });
          totalSynced++;
        } catch (err) {
          console.error(
            `[sync] JournalEntryLine upsert error entry=${entry.id} idx=${idx}:`,
            err,
          );
        }
      }
    }
  }

  // Eliminar líneas de asientos que Holded ya no devuelve
  // (los journal entries no tienen datos de usuario, se pueden borrar sin riesgo).
  // Solo dentro del ámbito consultado: en incremental los años que no se han
  // pedido no aparecen en allReturnedEntryIds y se borrarían enteros.
  if (allReturnedEntryIds.size > 0) {
    const dbLines = await prisma.journalEntryLine.findMany({
      where:
        ctx.scope.mode === "full"
          ? { companyId }
          : { companyId, date: { gte: ctx.scope.fromDate } },
      select: { id: true, holdedEntryId: true },
    });
    const orphanIds = dbLines
      .filter((l) => !allReturnedEntryIds.has(l.holdedEntryId))
      .map((l) => l.id);
    if (orphanIds.length > 0) {
      await prisma.journalEntryLine.deleteMany({
        where: { id: { in: orphanIds } },
      });
      console.log(
        `[sync] Eliminados ${orphanIds.length} journal entry lines huérfanos (company=${companyId})`,
      );
    }
  }

  console.log(
    `[sync] Journal entries company=${companyId}: ${totalSynced} líneas P&L sincronizadas`,
  );
  return totalSynced;
}

// ─── RRHH — Empleados y Nóminas (Holded Team API) ──────────────────────────────
//
// Las nóminas se generan en la gestoría y se meten en Holded pasándolas por su
// OCR de nóminas (módulo "Team", app.holded.com/team/v2/payrolls/salary-record/…)
// — NO son facturas de compra, viven en /api/v2/employees y /api/v2/salary-records,
// separado de invoices/purchases (E15, 2026-09-15). Requiere que la API key tenga
// los scopes team:employees.read y accounting:payrolls.read habilitados en Holded
// — si no, Holded devuelve 403 y esta función no sincroniza nada (no bloqueante,
// ver el .catch() en syncHoldedCompany).

function mapHoldedSalaryStatus(
  status: string,
): "PENDING" | "PAID" | "PARTIALLY_PAID" {
  if (status === "PAID" || status === "PARTIALLY_PAID") return status;
  return "PENDING";
}

export async function syncEmployeesAndSalaryRecords(
  companyId: string,
  ctx: SyncContext = createSyncContext(),
): Promise<number> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });
  const client = new HoldedClient(company.holdedApiKey, ctx.stats);

  // ── Empleados ──────────────────────────────────────────────────────────────
  const employees = await client.getEmployees();
  const employeeIdByHoldedId = new Map<string, string>();

  for (const emp of employees) {
    const row = await prisma.employee.upsert({
      where: {
        companyId_holdedEmployeeId: { companyId, holdedEmployeeId: emp.id },
      },
      update: { fullName: emp.fullName, iban: emp.iban },
      create: {
        companyId,
        holdedEmployeeId: emp.id,
        fullName: emp.fullName,
        iban: emp.iban,
      },
      select: { id: true },
    });
    employeeIdByHoldedId.set(emp.id, row.id);
  }

  // ── Nóminas ────────────────────────────────────────────────────────────────
  // Desde HOLDED_SYNC_FROM_YEAR (o el año que corresponda) hasta hoy — cubre
  // sobradamente "desde febrero" sin tener que hardcodear esa fecha.
  const startDate = `${HOLDED_SYNC_FROM_YEAR}-01-01`;
  const summaries = await client.getSalaryRecords({ startDate });

  // El detalle de cada nómina cuesta una llamada por registro y lo único que
  // añade sobre el resumen son las líneas. Si la nómina ya está guardada con sus
  // líneas, no es un borrador y ni importes ni estado han cambiado, las líneas
  // tampoco pueden haber cambiado: nos ahorramos la llamada.
  const storedRecords = await prisma.salaryRecord.findMany({
    where: { companyId },
    select: {
      holdedSalaryRecordId: true,
      isDraft: true,
      totalPayable: true,
      paymentTotal: true,
      paymentPending: true,
      paymentStatus: true,
      _count: { select: { lines: true } },
    },
  });
  const storedByHoldedId = new Map(
    storedRecords.map((r) => [r.holdedSalaryRecordId, r]),
  );

  const sameAmount = (stored: unknown, fresh: number): boolean =>
    Number(stored).toFixed(2) === fresh.toFixed(2);

  const detailAlreadyStored = (
    summary: HoldedSalaryRecordSummary,
  ): boolean => {
    const stored = storedByHoldedId.get(summary.id);
    if (!stored || stored._count.lines === 0) return false;
    // Un borrador puede cambiar sin que se mueva ningún importe.
    if (stored.isDraft || summary.isDraft) return false;
    return (
      sameAmount(stored.totalPayable, summary.totalPayable) &&
      sameAmount(stored.paymentTotal, summary.paymentTotal) &&
      sameAmount(stored.paymentPending, summary.paymentPending) &&
      stored.paymentStatus === mapHoldedSalaryStatus(summary.paymentStatus)
    );
  };

  let totalSynced = 0;
  let detailsFetched = 0;
  for (const summary of summaries) {
    // El resumen se sigue guardando siempre (no cuesta llamadas y mantiene al
    // día el vínculo con el empleado); lo que se evita es el detalle.
    let detail: HoldedSalaryRecordDetail | undefined;
    if (!detailAlreadyStored(summary)) {
      try {
        detail = await client.getSalaryRecordDetail(summary.id);
        detailsFetched++;
      } catch (err) {
        console.error(
          `[sync] getSalaryRecordDetail id=${summary.id} company=${companyId}:`,
          err,
        );
        continue;
      }
    }

    try {
      const salaryRecord = await prisma.salaryRecord.upsert({
        where: {
          companyId_holdedSalaryRecordId: {
            companyId,
            holdedSalaryRecordId: summary.id,
          },
        },
        update: {
          employeeId: summary.employeeId
            ? (employeeIdByHoldedId.get(summary.employeeId) ?? null)
            : null,
          employeeName: summary.employeeName,
          date: new Date(summary.date),
          description: summary.description ?? null,
          isDraft: summary.isDraft,
          totalPayable: summary.totalPayable,
          paymentTotal: summary.paymentTotal,
          paymentPending: summary.paymentPending,
          paymentStatus: mapHoldedSalaryStatus(summary.paymentStatus),
        },
        create: {
          companyId,
          holdedSalaryRecordId: summary.id,
          employeeId: summary.employeeId
            ? (employeeIdByHoldedId.get(summary.employeeId) ?? null)
            : null,
          employeeName: summary.employeeName,
          date: new Date(summary.date),
          description: summary.description ?? null,
          isDraft: summary.isDraft,
          totalPayable: summary.totalPayable,
          paymentTotal: summary.paymentTotal,
          paymentPending: summary.paymentPending,
          paymentStatus: mapHoldedSalaryStatus(summary.paymentStatus),
        },
        select: { id: true },
      });

      // Las líneas se recrean solo si hemos pedido el detalle; si estaba
      // cacheado, las que ya hay en base son exactamente las mismas.
      if (detail) {
        await prisma.salaryRecordLine.deleteMany({
          where: { salaryRecordId: salaryRecord.id },
        });
        if (detail.lines.length > 0) {
          await prisma.salaryRecordLine.createMany({
            data: detail.lines.map((l) => ({
              salaryRecordId: salaryRecord.id,
              type: l.type,
              amount: l.amount,
              description: l.description ?? null,
            })),
          });
        }
      }

      totalSynced++;
    } catch (err) {
      console.error(
        `[sync] upsert SalaryRecord id=${summary.id} company=${companyId}:`,
        err,
      );
    }
  }

  console.log(
    `[sync] Nóminas company=${companyId}: ${employees.length} empleados, ${totalSynced}/${summaries.length} nóminas sincronizadas (${detailsFetched} detalles pedidos a la API)`,
  );
  return totalSynced;
}

// ─── Single-document import ────────────────────────────────────────────────────
//
// Holded's paginated list endpoints (/purchases, /invoices) exclude draft documents
// (draft: true / no docNumber). Use this function to force-import a document by its
// Holded ID — useful when a document is confirmed to exist in Holded but is absent
// from the ERP because it never appeared in a sync run.

export async function syncDocumentById(
  companyId: string,
  holdedId: string,
  type: "invoice" | "purchase",
): Promise<{ found: boolean; invoiceId: string | null }> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });
  const client = new HoldedClient(company.holdedApiKey);

  const doc = await client.getDocumentById(type, holdedId);
  if (!doc) return { found: false, invoiceId: null };

  const accountMaps = await client.getAccountMaps();
  const invType = type === "invoice" ? InvoiceType.SALE : InvoiceType.PURCHASE;

  await upsertInvoice(doc, companyId, invType, accountMaps);

  const invoice = await prisma.invoice.findUnique({
    where: { holdedId_companyId: { holdedId: doc.id, companyId } },
    select: { id: true },
  });

  return { found: true, invoiceId: invoice?.id ?? null };
}

// ─── Full sync ─────────────────────────────────────────────────────────────────

export type SyncProgressEvent =
  | {
      type: "init";
      items: Array<{
        source: "HOLDED" | "JIRA";
        entityId: string;
        entityName: string;
      }>;
    }
  | {
      type: "update";
      source: "HOLDED" | "JIRA";
      entityId: string;
      status: "done" | "error";
      error?: string;
    }
  | {
      type: "complete";
      companies: number;
      workspaces: number;
      mode: SyncMode;
      apiCalls: number;
      errors: string[];
    }
  | { type: "fatal"; error: string };

/**
 * @param mode "incremental" (por defecto) relee solo la ventana reciente;
 * "full" relee toda la historia y es el único que reconcilia borrados antiguos.
 * El cron diario usa incremental y el semanal full — ver vercel.json.
 */
export async function syncAll(
  triggeredBy?: string,
  onProgress?: (event: SyncProgressEvent) => void,
  mode: SyncMode = "incremental",
): Promise<{
  companies: number;
  workspaces: number;
  mode: SyncMode;
  apiCalls: number;
  errors: string[];
}> {
  const [companies, workspaces] = await Promise.all([
    prisma.company.findMany({ where: { active: true } }),
    prisma.jiraWorkspace.findMany({ where: { active: true } }),
  ]);

  // Un único ámbito para toda la ejecución, pero un contador por empresa: así
  // cada SyncLog registra lo que ha costado esa empresa, no la suma de todas.
  const scope = resolveSyncScope(mode, { fromYear: HOLDED_SYNC_FROM_YEAR });
  const statsByCompany = new Map<string, HoldedApiStats>();

  // Announce all sources upfront so the UI can show spinners for everything
  onProgress?.({
    type: "init",
    items: [
      ...companies.map((c) => ({
        source: "HOLDED" as const,
        entityId: c.id,
        entityName: c.name,
      })),
      ...workspaces.map((w) => ({
        source: "JIRA" as const,
        entityId: w.id,
        entityName: w.name,
      })),
    ],
  });

  const errors: string[] = [];

  await Promise.allSettled([
    ...companies.map((c) => {
      const stats = createHoldedApiStats();
      statsByCompany.set(c.id, stats);
      return syncHoldedCompany(c.id, triggeredBy, { scope, stats })
        .then(() => {
          onProgress?.({
            type: "update",
            source: "HOLDED",
            entityId: c.id,
            status: "done",
          });
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Holded ${c.name}: ${msg}`);
          onProgress?.({
            type: "update",
            source: "HOLDED",
            entityId: c.id,
            status: "error",
            error: msg,
          });
        });
    }),
    ...workspaces.map((w) =>
      syncJiraWorkspace(w.id, triggeredBy)
        .then(() => {
          onProgress?.({
            type: "update",
            source: "JIRA",
            entityId: w.id,
            status: "done",
          });
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Jira ${w.name}: ${msg}`);
          onProgress?.({
            type: "update",
            source: "JIRA",
            entityId: w.id,
            status: "error",
            error: msg,
          });
        }),
    ),
  ]);

  let apiCalls = 0;
  for (const stats of statsByCompany.values()) apiCalls += stats.total;
  console.log(
    `[sync] syncAll mode=${mode} empresas=${companies.length} → ${apiCalls} llamadas a la API de Holded`,
  );

  return {
    companies: companies.length,
    workspaces: workspaces.length,
    mode,
    apiCalls,
    errors,
  };
}
