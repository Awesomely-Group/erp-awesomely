"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  projects: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ProjectCombobox({
  projects,
  value,
  onChange,
  disabled,
  placeholder = "Sin proyecto",
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedProject = projects.find((p) => p.id === value) ?? null;

  const filtered = query
    ? projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : projects;

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
    if (!disabled) {
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
  }

  function handleSelect(id: string): void {
    onChange(id);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function handleClear(e: React.MouseEvent): void {
    e.stopPropagation();
    onChange("");
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : (selectedProject?.name ?? "")}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {value && !disabled && (
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

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden"
        >
          {projects.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Sin proyectos para esta marca</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Sin resultados</div>
          ) : (
            <ul className="max-h-52 overflow-y-auto">
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect("")}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                    !value ? "font-medium text-indigo-700" : "text-gray-500"
                  }`}
                >
                  Sin proyecto
                </button>
              </li>
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(p.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                      p.id === value ? "font-medium text-indigo-700 bg-indigo-50" : "text-gray-700"
                    }`}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
