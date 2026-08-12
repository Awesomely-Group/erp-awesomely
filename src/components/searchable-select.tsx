"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type SearchableSelectOption = {
  id: string;
  label: string;
  sublabel?: string;
};

interface Props {
  /** Nombre del campo para envío nativo del formulario (via FormData). */
  name: string;
  options: SearchableSelectOption[];
  defaultValue?: string | null;
  placeholder?: string;
  /** Si se indica, se muestra como primera opción de la lista para vaciar la selección. */
  clearLabel?: string;
  disabled?: boolean;
  emptyMessage?: string;
}

/**
 * Select con buscador (combobox) reutilizable, siguiendo el mismo patrón de interacción
 * que `ProjectCombobox`/`InvoiceCombobox`, pero pensado para formularios no controlados
 * (`FormData`): mantiene su propio estado y expone el valor seleccionado vía un
 * `<input type="hidden">` con el `name` indicado.
 */
export function SearchableSelect({
  name,
  options,
  defaultValue,
  placeholder = "Buscar…",
  clearLabel,
  disabled,
  emptyMessage = "Sin resultados",
}: Props): React.JSX.Element {
  const [selectedId, setSelectedId] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.id === selectedId) ?? null;

  const filtered = query
    ? options.filter((o) => `${o.sublabel ?? ""} ${o.label}`.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent): void {
      const target = e.target as Node;
      const insideContainer = containerRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insideContainer && !insideDropdown) {
        setOpen(false);
        setQuery("");
      }
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleFocus(): void {
    if (disabled) return;
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setOpen(true);
    setQuery("");
  }

  function handleSelect(id: string): void {
    setSelectedId(id);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function handleClear(e: React.MouseEvent): void {
    e.stopPropagation();
    setSelectedId("");
    setOpen(false);
    setQuery("");
  }

  const displayValue = selected ? (selected.sublabel ? `${selected.sublabel} · ${selected.label}` : selected.label) : "";

  return (
    <div ref={containerRef} className="relative w-full">
      <input type="hidden" name={name} value={selectedId} />
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : displayValue}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50"
        />
        {selectedId && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden"
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">Sin opciones disponibles</div>
            ) : filtered.length === 0 && !clearLabel ? (
              <div className="px-3 py-2 text-xs text-gray-400">{emptyMessage}</div>
            ) : (
              <ul className="max-h-56 overflow-y-auto">
                {clearLabel && (
                  <li>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect("")}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                        !selectedId ? "font-medium text-indigo-700" : "text-gray-500"
                      }`}
                    >
                      {clearLabel}
                    </button>
                  </li>
                )}
                {filtered.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-gray-400">{emptyMessage}</li>
                ) : (
                  filtered.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelect(o.id)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                          o.id === selectedId ? "font-medium text-indigo-700 bg-indigo-50" : "text-gray-700"
                        }`}
                      >
                        {o.sublabel && <span className="text-gray-400 mr-1.5">{o.sublabel} ·</span>}
                        {o.label}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
