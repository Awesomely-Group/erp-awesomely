"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  DEFAULT_PRESET_KEYS,
  getPreset,
  matchPreset,
  shiftRange,
  type DatePresetKey,
  type DateRange,
} from "@/lib/date-range";

export interface DateRangePickerProps {
  from: Date | null;
  to: Date | null;
  /** `null` solo llega cuando `allowClear` está activo (opción "Todas las fechas"). */
  onChange: (range: DateRange | null) => void;
  /** Atajos del panel izquierdo, en orden. Por defecto los de facturas/dashboard. */
  presets?: readonly DatePresetKey[];
  /** Muestra la opción para quitar el filtro de fechas. */
  allowClear?: boolean;
  clearLabel?: string;
  /** Botones Anterior / Siguiente que desplazan el rango un paso. */
  showNavigation?: boolean;
  className?: string;
}

type Submenu = "years" | "quarters" | "months";

interface SubmenuItem {
  label: string;
  range: DateRange;
}

/** Ancho aproximado del desplegable: se usa para decidir si se alinea a la derecha. */
const POPOVER_WIDTH = 720;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function formatDay(d: Date): string {
  return format(d, "dd/MM/yyyy");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildSubmenuItems(kind: Submenu, now: Date): SubmenuItem[] {
  const y = now.getFullYear();
  const m = now.getMonth();
  const items: SubmenuItem[] = [];

  if (kind === "years") {
    for (let i = 0; i < 6; i++) {
      const year = y - i;
      items.push({
        label: String(year),
        range: { from: new Date(year, 0, 1), to: endOfDay(new Date(year, 11, 31)) },
      });
    }
  } else if (kind === "quarters") {
    const currentQ = Math.floor(m / 3);
    for (let i = 0; i < 8; i++) {
      const startMonth = currentQ * 3 - i * 3;
      const from = new Date(y, startMonth, 1);
      items.push({
        label: `T${Math.floor(from.getMonth() / 3) + 1} ${from.getFullYear()}`,
        range: { from, to: endOfDay(new Date(y, startMonth + 3, 0)) },
      });
    }
  } else {
    for (let i = 0; i < 24; i++) {
      const from = new Date(y, m - i, 1);
      items.push({
        label: capitalize(format(from, "MMMM yyyy", { locale: es })),
        range: { from, to: endOfDay(endOfMonth(from)) },
      });
    }
  }
  return items;
}

const SUBMENU_TITLES: Record<Submenu, string> = {
  years: "Años",
  quarters: "Trimestres",
  months: "Meses",
};

interface CalendarGridProps {
  month: Date;
  draftFrom: Date | null;
  draftTo: Date | null;
  hoverDate: Date | null;
  onDayClick: (day: Date) => void;
  onDayHover: (day: Date | null) => void;
}

function CalendarGrid({
  month,
  draftFrom,
  draftTo,
  hoverDate,
  onDayClick,
  onDayHover,
}: CalendarGridProps): React.JSX.Element {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const weekDays = useMemo(() => {
    const monday = startOfWeek(new Date(2024, 0, 1), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) =>
      format(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i), "EEE", { locale: es })
    );
  }, []);

  // Mientras se elige el fin, el día bajo el ratón hace de fin provisional.
  const previewTo = draftFrom && !draftTo ? hoverDate : draftTo;
  let rangeStart: Date | null = null;
  let rangeEnd: Date | null = null;
  if (draftFrom && previewTo) {
    rangeStart = draftFrom <= previewTo ? draftFrom : previewTo;
    rangeEnd = draftFrom <= previewTo ? previewTo : draftFrom;
  } else if (draftFrom) {
    rangeStart = draftFrom;
    rangeEnd = draftFrom;
  }

  function dayClasses(day: Date): string {
    const base =
      "h-8 w-8 flex items-center justify-center rounded-full text-xs select-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
    if (!rangeStart || !rangeEnd) return `${base} text-gray-700 hover:bg-gray-100`;
    const isEdge = isSameDay(day, rangeStart) || isSameDay(day, rangeEnd);
    if (isEdge) return `${base} bg-indigo-600 text-white font-semibold`;
    const inRange = day > rangeStart && day < rangeEnd;
    if (inRange) return `${base} bg-indigo-100 text-indigo-800`;
    return `${base} text-gray-700 hover:bg-gray-100`;
  }

  return (
    <div className="w-[15rem]">
      <p className="mb-2 text-center text-sm font-medium text-gray-900 capitalize">
        {format(month, "MMMM 'de' yyyy", { locale: es })}
      </p>
      <div className="grid grid-cols-7 mb-1">
        {weekDays.map((d) => (
          <div key={d} className="h-6 flex items-center justify-center text-[11px] text-gray-400">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) =>
          isSameMonth(day, month) ? (
            <div key={day.toISOString()} className="flex items-center justify-center">
              <button
                type="button"
                aria-label={format(day, "d 'de' MMMM 'de' yyyy", { locale: es })}
                onClick={() => onDayClick(day)}
                onMouseEnter={() => onDayHover(day)}
                onMouseLeave={() => onDayHover(null)}
                className={dayClasses(day)}
              >
                {format(day, "d")}
              </button>
            </div>
          ) : (
            <div key={day.toISOString()} className="h-8" />
          )
        )}
      </div>
    </div>
  );
}

export function DateRangePicker({
  from,
  to,
  onChange,
  presets = DEFAULT_PRESET_KEYS,
  allowClear = false,
  clearLabel = "Todas las fechas",
  showNavigation = true,
  className = "",
}: DateRangePickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [submenu, setSubmenu] = useState<Submenu | null>(null);
  const [submenuItems, setSubmenuItems] = useState<SubmenuItem[]>([]);
  const [leftMonth, setLeftMonth] = useState<Date>(() => startOfMonth(from ?? new Date()));
  const [draftFrom, setDraftFrom] = useState<Date | null>(from);
  const [draftTo, setDraftTo] = useState<Date | null>(to);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const hasRange = from !== null && to !== null;

  const activePreset = useMemo(
    () => (from && to ? matchPreset(from, to) : null),
    [from, to]
  );

  const close = useCallback((): void => {
    setOpen(false);
    setSubmenu(null);
    setHoverDate(null);
  }, []);

  function openPopover(): void {
    // Cada apertura parte del rango aplicado, no de un borrador anterior.
    setDraftFrom(from);
    setDraftTo(to);
    setLeftMonth(startOfMonth(from ?? new Date()));
    setSubmenu(null);
    const rect = containerRef.current?.getBoundingClientRect();
    setAlignRight(rect !== undefined && rect.left + POPOVER_WIDTH > window.innerWidth);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  function apply(range: DateRange | null): void {
    onChange(range);
    close();
  }

  function handleDayClick(day: Date): void {
    if (!draftFrom || draftTo) {
      setDraftFrom(startOfDay(day));
      setDraftTo(null);
      return;
    }
    const start = startOfDay(day <= draftFrom ? day : draftFrom);
    const end = endOfDay(day <= draftFrom ? draftFrom : day);
    setDraftFrom(start);
    setDraftTo(end);
  }

  function handleApply(): void {
    if (!draftFrom) return;
    apply({ from: startOfDay(draftFrom), to: endOfDay(draftTo ?? draftFrom) });
  }

  function handleShift(direction: -1 | 1): void {
    if (!from || !to) return;
    onChange(shiftRange({ from, to }, direction));
  }

  function openSubmenu(kind: Submenu): void {
    setSubmenuItems(buildSubmenuItems(kind, new Date()));
    setSubmenu(kind);
  }

  const triggerLabel = hasRange ? `${formatDay(from)} - ${formatDay(to)}` : clearLabel;
  const draftLabel = draftFrom
    ? `${formatDay(draftFrom)} - ${draftTo ? formatDay(draftTo) : "…"}`
    : "Elige un rango en el calendario";

  const navButtonClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const presetItemClass = (active: boolean): string =>
    `w-full text-left rounded-md px-3 py-1.5 text-sm transition-colors ${
      active ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"
    }`;

  return (
    <div ref={containerRef} className={`relative inline-flex items-center gap-2 ${className}`}>
      {showNavigation && (
        <>
          <button
            type="button"
            onClick={() => handleShift(-1)}
            disabled={!hasRange}
            className={navButtonClass}
            aria-label="Periodo anterior"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Anterior
          </button>
          <button
            type="button"
            onClick={() => handleShift(1)}
            disabled={!hasRange}
            className={navButtonClass}
            aria-label="Periodo siguiente"
          >
            Siguiente
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => (open ? close() : openPopover())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm transition-colors whitespace-nowrap ${
          open ? "border-indigo-400 ring-2 ring-indigo-100" : "border-gray-300 hover:bg-gray-50"
        }`}
      >
        <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden />
        <span className={hasRange ? "text-gray-900" : "text-gray-500"}>{triggerLabel}</span>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Seleccionar periodo"
          className={`absolute top-full mt-1.5 z-50 flex max-w-[calc(100vw-2rem)] overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-lg ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          {/* Atajos */}
          <div className="w-48 flex-shrink-0 border-r border-gray-100 p-2 flex flex-col gap-0.5">
            {submenu === null ? (
              <>
                {allowClear && (
                  <button
                    type="button"
                    onClick={() => apply(null)}
                    className={presetItemClass(!hasRange)}
                  >
                    {clearLabel}
                  </button>
                )}
                {presets.map((key) => {
                  const preset = getPreset(key);
                  if (!preset) return null;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => apply(preset.getRange(new Date()))}
                      className={presetItemClass(activePreset === key)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
                <div className="my-1.5 border-t border-gray-100" />
                {(["years", "quarters", "months"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => openSubmenu(kind)}
                    className="w-full flex items-center justify-between rounded-md px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {SUBMENU_TITLES[kind]}
                    <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden />
                  </button>
                ))}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSubmenu(null)}
                  className="w-full flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  {SUBMENU_TITLES[submenu]}
                </button>
                <div className="max-h-80 overflow-y-auto flex flex-col gap-0.5">
                  {submenuItems.map((item) => {
                    const active =
                      from !== null && to !== null &&
                      isSameDay(item.range.from, from) && isSameDay(item.range.to, to);
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => apply(item.range)}
                        className={presetItemClass(active)}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Personalizado */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Personalizado</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLeftMonth((m) => subMonths(m, 1))}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                  aria-label="Mes anterior"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setLeftMonth((m) => addMonths(m, 1))}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                  aria-label="Mes siguiente"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            <div className="flex gap-6">
              <CalendarGrid
                month={leftMonth}
                draftFrom={draftFrom}
                draftTo={draftTo}
                hoverDate={hoverDate}
                onDayClick={handleDayClick}
                onDayHover={setHoverDate}
              />
              <CalendarGrid
                month={addMonths(leftMonth, 1)}
                draftFrom={draftFrom}
                draftTo={draftTo}
                hoverDate={hoverDate}
                onDayClick={handleDayClick}
                onDayHover={setHoverDate}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-sm text-gray-600 tabular-nums">{draftLabel}</span>
              <button
                type="button"
                onClick={handleApply}
                disabled={!draftFrom}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
