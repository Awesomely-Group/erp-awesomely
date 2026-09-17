import { prisma } from "@/lib/prisma";
import {
  getContactsBankData,
  type ContactBankRequest,
} from "@/lib/holded-contacts";
import { getForecastFormOptions } from "@/app/(dashboard)/forecasts/forecasts-data";
import { PaymentsView } from "./payments-view";
import { type ContactBankInfo, type PaymentInvoice } from "./payment-row";

const L1_LABELS: Record<string, string> = {
  COGS: "COGS",
  OPEX: "Opex",
  CAPEX: "Capex",
};

// Emparejamos facturas con proveedores "partner" por holdedContactId (la sync ya lo guarda
// en la factura, ver src/lib/sync.ts) y, como respaldo para facturas sin contactId, por
// nombre normalizado + companyId (`nameKey`).
const nameKey = (companyId: string, name: string): string =>
  `${companyId}:${name.toLowerCase().trim()}`;

export default async function PaymentsPage(): Promise<React.JSX.Element> {
  const [
    invoices,
    partnerSuppliers,
    forecastOptions,
    companies,
    manualPayments,
    salaryRecords,
    users,
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: { type: { in: ["PURCHASE", "SALE"] }, removedFromHoldedAt: null },
      omit: { status: true },
      include: {
        company: true,
        erpPayments: true,
        verifications: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, periodMismatch: true },
        },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.supplier.findMany({
      where: { isPartner: true },
      select: { holdedContactId: true, companyId: true, name: true },
    }),
    // accountMappings (COGS/OPEX/CAPEX) para el AccountMappingSelect del modal de pago suelto.
    getForecastFormOptions(),
    prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Pagos manuales sueltos (sin factura asociada) — pendientes (paidAt null) o ya
    // pagados. Se mezclan más abajo en las mismas listas pendingPayments/pendingCollections
    // que las facturas, no se muestran aparte.
    prisma.invoicePayment.findMany({
      where: { invoiceId: null },
      include: {
        company: { select: { name: true } },
        accountMapping: { select: { description: true, l1: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Nóminas sincronizadas desde el módulo Team de Holded (E15, 2026-09-15) — se
    // mezclan más abajo en pendingPayments como source: "payroll". Los borradores
    // (isDraft) no están confirmados en Holded todavía, se excluyen.
    prisma.salaryRecord.findMany({
      where: { isDraft: false },
      include: {
        company: { select: { name: true } },
        employee: { select: { iban: true } },
        erpPayments: true,
      },
      orderBy: { date: "asc" },
    }),
    // Nombres de usuario para mostrar "Pagado por {nombre}" en vez del email en los
    // pagos registrados en el ERP.
    prisma.user.findMany({ select: { email: true, name: true } }),
  ]);

  // Email (normalizado) → nombre, para resolver quién registró cada pago.
  const userNameByEmail = new Map<string, string>(
    users.flatMap((u) => (u.name ? [[u.email.toLowerCase(), u.name] as [string, string]] : [])),
  );
  // Muestra el nombre del usuario si el paidBy es un email conocido; si no, deja el valor
  // tal cual (email de un usuario ya no existente, o "unknown").
  const displayPaidBy = (raw: string | null): string =>
    raw ? (userNameByEmail.get(raw.toLowerCase()) ?? raw) : "—";

  const partnerNameSet = new Set(
    partnerSuppliers.map((s) => nameKey(s.companyId ?? "", s.name)),
  );
  // Map name key → supplier's holdedContactId (for IBAN lookup)
  const supplierContactIdByName = new Map<string, string>(
    partnerSuppliers
      .filter((s) => s.holdedContactId)
      .map((s) => [nameKey(s.companyId ?? "", s.name), s.holdedContactId]),
  );
  // Emparejamiento robusto por holdedContactId (independiente del nombre) + nombre a mostrar.
  const partnerContactIds = new Set<string>(
    partnerSuppliers.flatMap((s) => (s.holdedContactId ? [s.holdedContactId] : [])),
  );
  const supplierNameByContactId = new Map<string, string>(
    partnerSuppliers.flatMap((s) =>
      s.holdedContactId ? [[s.holdedContactId, s.name] as [string, string]] : [],
    ),
  );

  /**
   * Devuelve el contacto de Holded y el nombre a mostrar de una factura de proveedor
   * "partner", o null si no lo es. Empareja por holdedContactId y, como respaldo, por
   * nombre normalizado — así una factura cuyo counterparty difiere de la ficha (p.ej. el
   * sufijo "(IreneVirtual)") se sigue reconociendo y muestra el nombre del proveedor.
   */
  const matchPartner = (inv: {
    holdedContactId: string | null;
    counterparty: string | null;
    companyId: string;
  }): { contactId: string | null; displayName: string | null } | null => {
    if (inv.holdedContactId && partnerContactIds.has(inv.holdedContactId)) {
      return {
        contactId: inv.holdedContactId,
        displayName: inv.counterparty ?? supplierNameByContactId.get(inv.holdedContactId) ?? null,
      };
    }
    const nk = inv.counterparty ? nameKey(inv.companyId, inv.counterparty) : null;
    if (nk && partnerNameSet.has(nk)) {
      return { contactId: supplierContactIdByName.get(nk) ?? null, displayName: inv.counterparty };
    }
    return null;
  };

  // Contactos a resolver en Holded, deduplicados por (empresa, contacto). Solo
  // las compras de proveedores partner tienen contacto que consultar.
  const bankRequests: ContactBankRequest[] = [];
  const seenContacts = new Set<string>();
  for (const inv of invoices) {
    if (inv.type !== "PURCHASE") continue;
    const contactId = matchPartner(inv)?.contactId;
    if (!contactId) continue;
    const key = `${inv.companyId}:${contactId}`;
    if (seenContacts.has(key)) continue;
    seenContacts.add(key);
    bankRequests.push({
      companyId: inv.companyId,
      apiKey: inv.company.holdedApiKey,
      contactId,
    });
  }

  // Nunca lanza: los fallos vuelven como `status: "unavailable"`, con caché y
  // concurrencia acotada dentro del módulo.
  const bankData = await getContactsBankData(bankRequests);

  function bankInfoFor(
    companyId: string,
    contactId: string | null | undefined,
  ): ContactBankInfo | null {
    if (!contactId) return null;
    const result = bankData.get(`${companyId}:${contactId}`);
    if (!result) return null;
    if (result.status === "unavailable") return { status: "unavailable" };
    return {
      status: "ok",
      iban: result.data.iban,
      holder: result.data.holder,
      bic: result.data.bic,
      bankName: result.data.bankName,
    };
  }


  const pendingPayments: PaymentInvoice[] = [];
  const pendingCollections: PaymentInvoice[] = [];
  const companyNames = new Set<string>();
  const invoiceOptionsPurchase: {
    id: string;
    label: string;
    sublabel?: string;
  }[] = [];
  const invoiceOptionsSale: { id: string; label: string; sublabel?: string }[] =
    [];

  for (const inv of invoices) {
    const erpPaid = inv.erpPayments.reduce((s, p) => s + Number(p.amount), 0);
    const holdedPending = Number(inv.paymentsPending);
    const effectivePending = Math.max(0, holdedPending - erpPaid);

    // El selector de factura del formulario de pago suelto incluye TODAS las facturas
    // (también las ya pagadas del todo, para permitir registrar correcciones o excesos de
    // pago) — se construye para todas antes de filtrar por pendiente > 0 más abajo. En
    // PURCHASE solo se ofrecen facturas de proveedores "partner": la pestaña Pagos solo
    // muestra esos (ver filtro más abajo) — ofrecer el resto en el selector creaba pagos
    // que quedaban invisibles para siempre (bug: pago de prueba contra factura de Todoist,
    // proveedor no-partner, 2026-09-02).
    const partnerMatch = inv.type === "PURCHASE" ? matchPartner(inv) : null;
    const option = {
      id: inv.id,
      label: inv.counterparty ?? partnerMatch?.displayName ?? "Sin nombre",
      sublabel: `${inv.number ?? inv.holdedId.slice(0, 8)} · ${inv.company.name}`,
    };
    if (inv.type === "PURCHASE") {
      if (partnerMatch) invoiceOptionsPurchase.push(option);
    } else {
      invoiceOptionsSale.push(option);
    }

    // Si Holded ya no muestra pendiente pero hay pagos ERP registrados encima (una
    // corrección o exceso de pago contra una factura ya reconciliada), la fila se sigue
    // mostrando — de lo contrario ese pago queda invisible sin ninguna forma de verlo o
    // borrarlo desde aquí.
    if (holdedPending <= 0.005 && inv.erpPayments.length === 0) continue;

    companyNames.add(inv.company.name);

    // Los pagos ligados a factura (relación erpPayments) siempre se crean con paidAt/paidBy
    // ya informados (registerPayment/createManualPayment rama ligada) — solo quedan a null
    // en la rama suelta y pendiente (invoiceId null), que no aparece aquí.
    const erpPaymentsPayload = inv.erpPayments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidAt: p.paidAt!.toISOString(),
      paidBy: displayPaidBy(p.paidBy),
      notes: p.notes,
    }));

    if (inv.type === "PURCHASE") {
      if (!partnerMatch) continue;

      const supplierContactId = partnerMatch.contactId;

      pendingPayments.push({
        id: inv.id,
        holdedId: inv.holdedId,
        type: inv.type,
        source: "invoice",
        number: inv.number,
        counterparty: partnerMatch.displayName,
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        totalEur: Number(inv.totalEur),
        paymentsPending: holdedPending,
        erpPaid,
        effectivePending,
        companyName: inv.company.name,
        verificationStatus: inv.verifications[0]?.status ?? null,
        erpPayments: erpPaymentsPayload,
        contactBank: bankInfoFor(inv.companyId, supplierContactId),
        contactHoldedUrl: supplierContactId
          ? `https://app.holded.com/contacts/${supplierContactId}`
          : null,
      });
    } else {
      pendingCollections.push({
        id: inv.id,
        holdedId: inv.holdedId,
        type: inv.type,
        source: "invoice",
        number: inv.number,
        counterparty: inv.counterparty,
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        totalEur: Number(inv.totalEur),
        paymentsPending: holdedPending,
        erpPaid,
        effectivePending,
        companyName: inv.company.name,
        verificationStatus: null,
        erpPayments: erpPaymentsPayload,
        contactBank: null,
        contactHoldedUrl: null,
      });
    }
  }

  // Pagos manuales sueltos: se mezclan en la MISMA lista que las facturas (pendientes o
  // ya pagadas), no aparte — con `holdedId`/enlaces vacíos y `source: "manual"` para que
  // PaymentRow oculte los enlaces a Holded/ERP y use markManualPaymentPaid al marcarlos.
  for (const p of manualPayments) {
    const amount = Number(p.amount);
    const isPaid = p.paidAt != null;
    const accountMappingLabel = p.accountMapping
      ? `${L1_LABELS[p.accountMapping.l1] ?? p.accountMapping.l1} · ${p.accountMapping.description}`
      : null;
    const isExpense = p.direction !== "INCOME";

    const row: PaymentInvoice = {
      id: p.id,
      holdedId: "",
      type: isExpense ? "PURCHASE" : "SALE",
      source: "manual",
      number: accountMappingLabel,
      counterparty:
        p.notes?.trim() || (isExpense ? "Pago suelto" : "Cobro suelto"),
      dueDate: (p.dueDate ?? p.paidAt)?.toISOString() ?? null,
      totalEur: amount,
      paymentsPending: amount,
      erpPaid: isPaid ? amount : 0,
      effectivePending: isPaid ? 0 : amount,
      companyName: p.company?.name ?? "Sin empresa",
      verificationStatus: null,
      erpPayments: isPaid
        ? [{ id: p.id, amount, paidAt: p.paidAt!.toISOString(), paidBy: displayPaidBy(p.paidBy), notes: p.notes }]
        : [],
      contactBank: { status: "ok", iban: p.iban, holder: null, bic: null, bankName: null },
      contactHoldedUrl: null,
    };

    if (p.company?.name) companyNames.add(p.company.name);
    if (isExpense) pendingPayments.push(row);
    else pendingCollections.push(row);
  }

  // Nóminas: se mezclan en la lista de "Pagos pendientes" (siempre gasto, nunca
  // cobro) — mismo criterio que las facturas: si Holded ya no muestra pendiente pero
  // hay pagos ERP registrados encima, la fila se sigue mostrando.
  for (const sr of salaryRecords) {
    const erpPaid = sr.erpPayments.reduce((s, p) => s + Number(p.amount), 0);
    const holdedPending = Number(sr.paymentPending);
    const effectivePending = Math.max(0, holdedPending - erpPaid);

    if (holdedPending <= 0.005 && sr.erpPayments.length === 0) continue;

    companyNames.add(sr.company.name);

    const erpPaymentsPayload = sr.erpPayments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidAt: p.paidAt!.toISOString(),
      paidBy: displayPaidBy(p.paidBy),
      notes: p.notes,
    }));

    pendingPayments.push({
      id: sr.id,
      holdedId: sr.holdedSalaryRecordId,
      type: "PURCHASE",
      source: "payroll",
      number: sr.description,
      counterparty: sr.employeeName,
      dueDate: sr.date.toISOString(),
      totalEur: Number(sr.totalPayable),
      paymentsPending: holdedPending,
      erpPaid,
      effectivePending,
      companyName: sr.company.name,
      verificationStatus: null,
      erpPayments: erpPaymentsPayload,
      contactBank: {
        status: "ok",
        iban: sr.employee?.iban ?? null,
        holder: null,
        bic: null,
        bankName: null,
      },
      contactHoldedUrl: null,
    });
  }

  const companyNameList = Array.from(companyNames).sort();

  return (
    <PaymentsView
      pendingPayments={pendingPayments}
      pendingCollections={pendingCollections}
      companies={companyNameList}
      invoiceOptionsPurchase={invoiceOptionsPurchase}
      invoiceOptionsSale={invoiceOptionsSale}
      accountMappings={forecastOptions.accountMappings}
      companyOptions={companies}
    />
  );
}
