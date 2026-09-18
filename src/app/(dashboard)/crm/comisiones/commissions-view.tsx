"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { updateCommissionRule, updateCommissionStatus } from "../actions";

interface CommissionRow {
  id: string;
  type: string;
  marca: string;
  amount: number;
  status: string;
  triggeredAt: string;
  userLabel: string;
  leadId: string | null;
  leadName: string | null;
}

interface RuleRow {
  marca: string;
  proposalPercent: number;
  qualifiedMeetingAmount: number;
  active: boolean;
}

const STATUS_OPTIONS = ["PENDING", "CONFIRMED", "PAID", "CANCELLED"] as const;

function RuleEditor({ rule }: { rule: RuleRow }): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [percent, setPercent] = useState(rule.proposalPercent);
  const [amount, setAmount] = useState(rule.qualifiedMeetingAmount);
  const [active, setActive] = useState(rule.active);

  function handleSave(): void {
    startTransition(async () => {
      await updateCommissionRule({
        marca: rule.marca,
        proposalPercent: percent,
        qualifiedMeetingAmount: amount,
        active,
      });
    });
  }

  return (
    <tr className="border-b border-gray-100">
      <td className="px-3 py-2 font-medium text-gray-900">{rule.marca}</td>
      <td className="px-3 py-2">
        <input
          type="number"
          step="0.1"
          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
        />
        %
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          step="1"
          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        €
      </td>
      <td className="px-3 py-2">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td className="px-3 py-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          Guardar
        </button>
      </td>
    </tr>
  );
}

export function CommissionsView({
  isAdmin,
  commissions,
  rules,
}: {
  isAdmin: boolean;
  commissions: CommissionRow[];
  rules: RuleRow[];
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();

  function handleStatusChange(id: string, status: (typeof STATUS_OPTIONS)[number]): void {
    startTransition(async () => {
      await updateCommissionStatus(id, status);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Comisiones</h1>
        <p className="text-sm text-gray-500">
          {isAdmin ? "Todas las comisiones generadas" : "Tus comisiones"}
        </p>
      </div>

      {isAdmin && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Reglas por marca</h2>
          <p className="text-xs text-gray-400">
            Una marca sin fila activa no genera comisiones (hoy solo LaTroupe).
          </p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-3 py-1">Marca</th>
                <th className="px-3 py-1">% propuesta</th>
                <th className="px-3 py-1">€ reunión</th>
                <th className="px-3 py-1">Activa</th>
                <th className="px-3 py-1" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <RuleEditor key={r.marca} rule={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Lead</th>
              {isAdmin && <th className="px-4 py-2">Comercial</th>}
              <th className="px-4 py-2">Importe</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {commissions.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-500">{formatDate(c.triggeredAt)}</td>
                <td className="px-4 py-2 text-gray-700">
                  {c.type === "PROPOSAL_PERCENT" ? "% propuesta" : "Reunión cualificada"}
                </td>
                <td className="px-4 py-2">
                  {c.leadId ? (
                    <Link href={`/crm/leads/${c.leadId}`} className="text-indigo-600 hover:text-indigo-800">
                      {c.leadName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                {isAdmin && <td className="px-4 py-2 text-gray-500">{c.userLabel}</td>}
                <td className="px-4 py-2 font-medium text-gray-900">{formatCurrency(c.amount)}</td>
                <td className="px-4 py-2">
                  {isAdmin ? (
                    <select
                      value={c.status}
                      disabled={isPending}
                      onChange={(e) => handleStatusChange(c.id, e.target.value as (typeof STATUS_OPTIONS)[number])}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-500">{c.status}</span>
                  )}
                </td>
              </tr>
            ))}
            {commissions.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-sm text-gray-400">
                  Sin comisiones todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
