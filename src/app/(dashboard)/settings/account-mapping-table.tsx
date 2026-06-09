"use client";

import { useState, useTransition, useMemo } from "react";
import { Pencil, Trash2, Plus, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SortThClick } from "@/components/sort-th";
import {
  createAccountMapping,
  updateAccountMapping,
  deleteAccountMapping,
} from "./actions";

interface AccountMapping {
  id: string;
  tag: string;
  description: string;
  l1: string;
  accountNumSL: string | null;
  accountNameSL: string | null;
  accountNumOU: string | null;
  accountNameOU: string | null;
}

interface Props {
  mappings: AccountMapping[];
}

type SortKey = "tag" | "description" | "l1" | "accountNumSL" | "accountNameSL" | "accountNumOU" | "accountNameOU";
type SortDir = "asc" | "desc";

const L1_OPTIONS = ["REVENUE", "COGS", "OPEX", "CAPEX", "AMORT"] as const;

const L1_COLORS: Record<string, string> = {
  REVENUE: "bg-green-100 text-green-700",
  COGS: "bg-orange-100 text-orange-700",
  OPEX: "bg-blue-100 text-blue-700",
  CAPEX: "bg-purple-100 text-purple-700",
  AMORT: "bg-gray-100 text-gray-600",
};

const EMPTY_FORM = {
  tag: "",
  description: "",
  l1: "OPEX",
  accountNumSL: "",
  accountNameSL: "",
  accountNumOU: "",
  accountNameOU: "",
};

type FormState = typeof EMPTY_FORM;

export function AccountMappingTable({ mappings: initial }: Props): React.JSX.Element {
  const [mappings, setMappings] = useState(initial);
  const [l1Filter, setL1Filter] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>("tag");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(col: SortKey): void {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const base = l1Filter ? mappings.filter((m) => m.l1 === l1Filter) : mappings;
    return [...base].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "tag": cmp = a.tag.localeCompare(b.tag); break;
        case "description": cmp = a.description.localeCompare(b.description); break;
        case "l1": cmp = a.l1.localeCompare(b.l1); break;
        case "accountNumSL": cmp = (a.accountNumSL ?? "").localeCompare(b.accountNumSL ?? ""); break;
        case "accountNameSL": cmp = (a.accountNameSL ?? "").localeCompare(b.accountNameSL ?? ""); break;
        case "accountNumOU": cmp = (a.accountNumOU ?? "").localeCompare(b.accountNumOU ?? ""); break;
        case "accountNameOU": cmp = (a.accountNameOU ?? "").localeCompare(b.accountNameOU ?? ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [mappings, l1Filter, sortKey, sortDir]);

  function startEdit(m: AccountMapping): void {
    setEditingId(m.id);
    setShowAdd(false);
    setForm({
      tag: m.tag,
      description: m.description,
      l1: m.l1,
      accountNumSL: m.accountNumSL ?? "",
      accountNameSL: m.accountNameSL ?? "",
      accountNumOU: m.accountNumOU ?? "",
      accountNameOU: m.accountNameOU ?? "",
    });
  }

  function startAdd(): void {
    setShowAdd(true);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function cancelForm(): void {
    setShowAdd(false);
    setEditingId(null);
  }

  function handleSave(): void {
    const data = {
      tag: form.tag.trim(),
      description: form.description.trim(),
      l1: form.l1,
      accountNumSL: form.accountNumSL.trim() || null,
      accountNameSL: form.accountNameSL.trim() || null,
      accountNumOU: form.accountNumOU.trim() || null,
      accountNameOU: form.accountNameOU.trim() || null,
    };
    if (!data.tag || !data.description || !data.l1) return;

    startTransition(async () => {
      if (editingId) {
        await updateAccountMapping(editingId, data);
        setMappings((prev) =>
          prev.map((m) => (m.id === editingId ? { ...m, ...data } : m))
        );
      } else {
        await createAccountMapping(data);
        setMappings((prev) => [
          ...prev,
          { id: `new-${Date.now()}`, ...data },
        ]);
      }
      cancelForm();
    });
  }

  function handleDelete(id: string): void {
    if (!confirm("¿Eliminar esta cuenta?")) return;
    startTransition(async () => {
      await deleteAccountMapping(id);
      setMappings((prev) => prev.filter((m) => m.id !== id));
    });
  }

  function field(key: keyof FormState, label: string, placeholder?: string): React.JSX.Element {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">{label}</label>
        <input
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder ?? label}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm bg-white"
          disabled={isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters + Add button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setL1Filter("")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
              l1Filter === ""
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"
            )}
          >
            Todas
          </button>
          {L1_OPTIONS.map((l1) => (
            <button
              key={l1}
              onClick={() => setL1Filter(l1 === l1Filter ? "" : l1)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                l1Filter === l1
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"
              )}
            >
              {l1}
            </button>
          ))}
        </div>
        <button
          onClick={startAdd}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Añadir
        </button>
      </div>

      {/* Inline add/edit form */}
      {(showAdd || editingId) && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-indigo-800">
            {editingId ? "Editar cuenta" : "Nueva cuenta"}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {field("tag", "Tag", "COGS:Subcontrata")}
            {field("description", "Descripción")}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">L1</label>
              <select
                value={form.l1}
                onChange={(e) => setForm((f) => ({ ...f, l1: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm bg-white"
                disabled={isPending}
              >
                {L1_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {field("accountNumSL", "Num SL", "62300000")}
            {field("accountNameSL", "Nombre SL", "623 Servicios profesionales")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("accountNumOU", "Num OÜ", "52300100")}
            {field("accountNameOU", "Nombre OÜ", "4370 Consultations")}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending || !form.tag || !form.description}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              Guardar
            </button>
            <button
              onClick={cancelForm}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <SortThClick label="Tag" active={sortKey === "tag"} sortDir={sortDir} onClick={() => handleSort("tag")} className="text-xs" />
              <SortThClick label="Descripción" active={sortKey === "description"} sortDir={sortDir} onClick={() => handleSort("description")} className="text-xs" />
              <SortThClick label="L1" active={sortKey === "l1"} sortDir={sortDir} onClick={() => handleSort("l1")} className="text-xs" />
              <SortThClick label="Num SL" active={sortKey === "accountNumSL"} sortDir={sortDir} onClick={() => handleSort("accountNumSL")} className="text-xs" />
              <SortThClick label="Cuenta SL" active={sortKey === "accountNameSL"} sortDir={sortDir} onClick={() => handleSort("accountNameSL")} className="text-xs" />
              <SortThClick label="Num OÜ" active={sortKey === "accountNumOU"} sortDir={sortDir} onClick={() => handleSort("accountNumOU")} className="text-xs" />
              <SortThClick label="Cuenta OÜ" active={sortKey === "accountNameOU"} sortDir={sortDir} onClick={() => handleSort("accountNameOU")} className="text-xs" />
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-20">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((m) => (
              <tr key={m.id} className={cn("hover:bg-gray-50", editingId === m.id && "bg-indigo-50")}>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-800 whitespace-nowrap">{m.tag}</td>
                <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[200px] truncate">{m.description}</td>
                <td className="px-4 py-2.5">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", L1_COLORS[m.l1] ?? "bg-gray-100 text-gray-600")}>
                    {m.l1}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">{m.accountNumSL ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[160px] truncate">{m.accountNameSL ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">{m.accountNumOU ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[160px] truncate">{m.accountNameOU ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(m)}
                      className="text-gray-400 hover:text-indigo-600 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={isPending}
                      className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                  No hay entradas{l1Filter ? ` con L1 = ${l1Filter}` : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">{filtered.length} de {mappings.length} entradas</p>
    </div>
  );
}
