"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface InvoiceOption {
  id: string;
  number: string | null;
  counterparty: string | null;
  date: string;
  totalEur: number;
  marca: string | null;
}

interface Props {
  marca: string;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}

export function InvoiceCombobox({ marca, value, onChange, disabled }: Props): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<InvoiceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<InvoiceOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInvoices = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams({ marca });
          if (q) params.set("q", q);
          const res = await fetch(`/api/invoices/search?${params.toString()}`);
          if (res.ok) {
            const data = (await res.json()) as InvoiceOption[];
            setOptions(data);
          }
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [marca]
  );

  useEffect(() => {
    if (open) fetchInvoices(query);
  }, [open, query, fetchInvoices]);

  // Load selected invoice label when value changes externally
  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const found = options.find((o) => o.id === value);
    if (found) {
      setSelected(found);
    } else if (value) {
      // fetch single invoice to get label
      fetch(`/api/invoices/search?marca=${encodeURIComponent(marca)}&q=`)
        .then((r) => r.json())
        .then((data: InvoiceOption[]) => {
          const match = data.find((o) => o.id === value);
          if (match) setSelected(match);
        })
        .catch(() => null);
    }
  }, [value, marca]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSelect(inv: InvoiceOption): void {
    setSelected(inv);
    onChange(inv.id);
    setOpen(false);
    setQuery("");
  }

  function handleClear(): void {
    setSelected(null);
    onChange(null);
    setQuery("");
  }

  function formatLabel(inv: InvoiceOption): string {
    const num = inv.number ? `#${inv.number}` : "(sin nº)";
    const cp = inv.counterparty ?? "—";
    const date = inv.date.slice(0, 7);
    const total = inv.totalEur.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
    return `${num} · ${cp} · ${date} · ${total}`;
  }

  return (
    <div ref={containerRef} className="relative">
      {selected && !open ? (
        <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800">
          <span className="flex-1 truncate">{formatLabel(selected)}</span>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="ml-1 flex-shrink-0 text-gray-400 hover:text-gray-600"
              aria-label="Quitar factura"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {!disabled && (
            <button
              type="button"
              onClick={() => { setOpen(true); setQuery(""); }}
              className="ml-1 flex-shrink-0 text-gray-400 hover:text-gray-600"
              aria-label="Cambiar factura"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            {loading ? (
              <svg className="w-3.5 h-3.5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4l-3 3-3-3h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            )}
          </div>
          <input
            type="text"
            value={query}
            disabled={disabled}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar factura de venta…"
            className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">
              {loading ? "Cargando…" : "Sin resultados"}
            </p>
          ) : (
            options.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => handleSelect(inv)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                {formatLabel(inv)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
