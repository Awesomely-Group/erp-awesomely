import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { PaymentRow, type PaymentInvoice } from "./payment-row";

// Returns the latest batch date (15th or 30th) that is <= dueDate
// This maximizes delay while keeping payment on time
function getPaymentBatch(dueDate: Date): Date {
  const y = dueDate.getFullYear();
  const m = dueDate.getMonth();
  const d = dueDate.getDate();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const batch30 = Math.min(30, lastDay);

  if (d >= batch30) return new Date(y, m, batch30);
  if (d >= 15) return new Date(y, m, 15);

  // Due before the 15th: use previous month's last batch
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const prevLastDay = new Date(prevY, prevM + 1, 0).getDate();
  return new Date(prevY, prevM, Math.min(30, prevLastDay));
}

function batchKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function batchLabel(d: Date): string {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

export default async function PaymentsPage(): Promise<React.JSX.Element> {
  const invoices = await prisma.invoice.findMany({
    where: { type: "PURCHASE" },
    include: {
      company: true,
      erpPayments: { orderBy: { paidAt: "asc" } },
    },
    orderBy: { dueDate: "asc" },
  });

  // Build PaymentInvoice rows
  const rows: PaymentInvoice[] = invoices.map((inv) => {
    const erpPaid = inv.erpPayments.reduce((s, p) => s + Number(p.amount), 0);
    const holdedPending = Number(inv.paymentsPending);
    const effectivePending = Math.max(0, holdedPending - erpPaid);

    return {
      id: inv.id,
      holdedId: inv.holdedId,
      number: inv.number,
      counterparty: inv.counterparty,
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      totalEur: Number(inv.totalEur),
      paymentsPending: holdedPending,
      erpPaid,
      effectivePending,
      companyName: inv.company.name,
      erpPayments: inv.erpPayments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        paidAt: p.paidAt.toISOString(),
        paidBy: p.paidBy,
        notes: p.notes,
      })),
    };
  });

  // Group by batch
  const batchMap = new Map<string, { date: Date; rows: PaymentInvoice[] }>();
  const noDueRows: PaymentInvoice[] = [];

  for (const row of rows) {
    if (!row.dueDate) {
      noDueRows.push(row);
      continue;
    }
    const batchDate = getPaymentBatch(new Date(row.dueDate));
    const key = batchKey(batchDate);
    if (!batchMap.has(key)) batchMap.set(key, { date: batchDate, rows: [] });
    batchMap.get(key)!.rows.push(row);
  }

  // Sort batches chronologically
  const batches = Array.from(batchMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const totalPending = rows.reduce((s, r) => s + r.effectivePending, 0);
  const totalPaidRows = rows.filter((r) => r.effectivePending <= 0.005).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagos a proveedores</h1>
          <p className="text-sm text-gray-500 mt-1">
            {rows.length} facturas de compra · {totalPaidRows} pagadas ·{" "}
            <span className="font-medium text-red-600">{formatCurrency(totalPending)} pendiente</span>
          </p>
        </div>
      </div>

      {batches.map((batch) => {
        const batchPending = batch.rows.reduce((s, r) => s + r.effectivePending, 0);
        const now = new Date();
        const isOverdue = batch.date < now;
        const allPaid = batchPending <= 0.005;

        return (
          <div key={batchKey(batch.date)} className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-700">
                Pago del {batchLabel(batch.date)}
              </h2>
              {!allPaid && isOverdue && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  Vencido
                </span>
              )}
              {!allPaid && !isOverdue && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {formatCurrency(batchPending)} pendiente
                </span>
              )}
              {allPaid && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Pagado
                </span>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 bg-gray-50 border-b border-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
                <div className="w-6" />
                <div>Proveedor / Factura</div>
                <div className="w-28 text-right">Total</div>
                <div className="w-28 text-right">Pendiente</div>
                <div className="w-[110px]" />
              </div>
              {batch.rows.map((row) => (
                <PaymentRow key={row.id} invoice={row} />
              ))}
            </div>
          </div>
        );
      })}

      {noDueRows.length > 0 && (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-gray-700">Sin fecha de vencimiento</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {noDueRows.map((row) => (
              <PaymentRow key={row.id} invoice={row} />
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-12 text-center text-gray-400">
          No hay facturas de compra. Sincroniza primero.
        </div>
      )}
    </div>
  );
}
