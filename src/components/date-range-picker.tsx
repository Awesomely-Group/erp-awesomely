"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isWithinInterval,
  startOfDay,
  endOfDay,
  startOfYear,
  endOfYear,
  startOfQuarter,
  endOfQuarter,
  subDays,
  subYears,
  startOfYesterday,
  endOfYesterday,
  eachDayOfInterval,
} from "date-fns";

export interface DateRangePickerProps {
  from?: Date | null;
  to?: Date | null;
  onChange: (from: Date, to: Date) => void;
  placeholder?: string;
  className?: string;
}

const WEEK_DAYS = ["LU", "MA", "MI", "JU", "VI", "SA", "DO"];

function getCalendarDays(month: Date): Date[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  return eachDayOfInterval({ start: calStart, end: calEnd });
}

interface CalendarGridProps {
  month: Date;
  selectedFrom: Date | null;
  selectedTo: Date | null;
  hoverDate: Date | null;
  onDayClick: (day: Date) => void;
  onDayHover: (day: Date | null) => void;
  showLeftNav: boolean;
  showRightNav: boolean;
  onPrev: () => void;
  onNext: () => void;
}

function CalendarGrid({
  month,
  selectedFrom,
  selectedTo,
  hoverDate,
  onDayClick,
  onDayHover,
  showLeftNav,
  showRightNav,
  onPrev,
  onNext,
}: CalendarGridProps): React.JSX.Element {
  const days = getCalendarDays(month);

  function getRangeEnd(): Date | null {
    if (selectedFrom && !selectedTo && hoverDate) return hoverDate;
    return selectedTo;
  }

  function getDayClasses(day: Date): string {
    const rangeEnd = getRangeEnd();
    const isStart = selectedFrom ? isSameDay(day, selectedFrom) : false;
    const isEnd = selectedTo ? isSameDay(day, selectedTo) : false;
    const isHoverEnd =
      selectedFrom !== null && selectedTo === null && hoverDate !== null
        ? isSameDay(day, hoverDate)
        : false;

    let rangeFrom: Date | null = null;
    let rangeTo: Date | null = null;

    if (selectedFrom && rangeEnd) {
      const start = selectedFrom <= rangeEnd ? selectedFrom : rangeEnd;
      const end = selectedFrom <= rangeEnd ? rangeEnd : selectedFrom;
      rangeFrom = start;
      rangeTo = end;
    }

    const isInRange =
      rangeFrom && rangeTo
        ? isWithinInterval(day, { start: startOfDay(rangeFrom), end: endOfDay(rangeTo) }) &&
          !isSameDay(day, rangeFrom) &&
          !isSameDay(day, rangeTo)
        : false;

    const isCurrentMonth = isSameMonth(day, month);

    let base = "w-8 h-8 flex items-center justify-center text-xs rounded-full cursor-pointer select-none transition-colors";

    if (!isCurrentMonth) {
      base += " text-gray-300";
    } else {
      base += " text-gray-700";
    }

    if (isStart || isEnd) {
      base += " bg-indigo-600 text-white rounded-full font-semibold";
    } else if (isHoverEnd) {
      base += " bg-indigo-600 text-white rounded-full font-semibold";
    } else if (isInRange) {
      base += " bg-indigo-50 text-indigo-800 rounded-full";
    } else if (isCurrentMonth) {
      base += " hover:bg-gray-100";
    }

    return base;
  }

  return (
    <div className="flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        {showLeftNav ? (
          <button
            type="button"
            onClick={onPrev}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500"
            aria-label="Mes anterior"
          >
            ‹
          </button>
        ) : (
          <div className="w-6 h-6" />
        )}
        <span className="text-sm font-medium text-gray-900 capitalize">
          {format(month, "MMMM yyyy", { locale: undefined })}
        </span>
        {showRightNav ? (
          <button
            type="button"
            onClick={onNext}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500"
            aria-label="Mes siguiente"
          >
            ›
          </button>
        ) : (
          <div className="w-6 h-6" />
        )}
      </div>

      {/* Week day headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="w-8 h-6 flex items-center justify-center text-xs font-medium text-gray-400">
            {d}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="flex items-center justify-center"
            onClick={() => onDayClick(day)}
            onMouseEnter={() => onDayHover(day)}
            onMouseLeave={() => onDayHover(null)}
          >
            <span className={getDayClasses(day)}>
              {format(day, "d")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Preset {
  label: string;
  getRange: () => { from: Date; to: Date };
}

function buildPresets(): Preset[] {
  const now = new Date();
  return [
    {
      label: "Hoy",
      getRange: () => ({ from: startOfDay(now), to: endOfDay(now) }),
    },
    {
      label: "Ayer",
      getRange: () => ({ from: startOfYesterday(), to: endOfYesterday() }),
    },
    {
      label: "Últimos 7 días",
      getRange: () => ({ from: startOfDay(subDays(now, 6)), to: endOfDay(now) }),
    },
    {
      label: "Últimas 4 semanas",
      getRange: () => ({ from: startOfDay(subDays(now, 27)), to: endOfDay(now) }),
    },
    {
      label: "Mes actual",
      getRange: () => ({ from: startOfMonth(now), to: endOfMonth(now) }),
    },
    {
      label: "Mes anterior",
      getRange: () => {
        const prev = subMonths(now, 1);
        return { from: startOfMonth(prev), to: endOfMonth(prev) };
      },
    },
    {
      label: "Trimestre actual",
      getRange: () => ({ from: startOfQuarter(now), to: endOfQuarter(now) }),
    },
    {
      label: "Trimestre anterior",
      getRange: () => {
        const prev = subMonths(now, 3);
        return { from: startOfQuarter(prev), to: endOfQuarter(prev) };
      },
    },
    {
      label: "Año actual",
      getRange: () => ({ from: startOfYear(now), to: endOfYear(now) }),
    },
    {
      label: "Año anterior",
      getRange: () => {
        const prev = subYears(now, 1);
        return { from: startOfYear(prev), to: endOfYear(prev) };
      },
    },
    {
      label: "Últimos 12 meses",
      getRange: () => ({ from: startOfDay(subMonths(now, 12)), to: endOfDay(now) }),
    },
  ];
}

export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = "Seleccionar rango",
  className = "",
}: DateRangePickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [leftMonth, setLeftMonth] = useState<Date>(
    from ? startOfMonth(from) : startOfMonth(new Date())
  );
  const [pendingFrom, setPendingFrom] = useState<Date | null>(from ?? null);
  const [pendingTo, setPendingTo] = useState<Date | null>(to ?? null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [selecting, setSelecting] = useState<"from" | "to">("from");

  const containerRef = useRef<HTMLDivElement>(null);

  const rightMonth = addMonths(leftMonth, 1);

  // Sync external values when they change
  useEffect(() => {
    setPendingFrom(from ?? null);
    setPendingTo(to ?? null);
  }, [from, to]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleDayClick = useCallback(
    (day: Date): void => {
      if (selecting === "from" || !pendingFrom) {
        setPendingFrom(day);
        setPendingTo(null);
        setSelecting("to");
      } else {
        // Second click
        let f = pendingFrom;
        let t = day;
        if (t < f) {
          [f, t] = [t, f];
        }
        setPendingFrom(f);
        setPendingTo(t);
        setSelecting("from");
        onChange(f, t);
        setOpen(false);
      }
    },
    [selecting, pendingFrom, onChange]
  );

  const handlePreset = useCallback(
    (preset: Preset): void => {
      const { from: f, to: t } = preset.getRange();
      setPendingFrom(f);
      setPendingTo(t);
      setSelecting("from");
      onChange(f, t);
      setOpen(false);
    },
    [onChange]
  );

  function formatTriggerLabel(): string {
    if (from && to) {
      return `${format(from, "dd/MM/yyyy")} – ${format(to, "dd/MM/yyyy")}`;
    }
    return placeholder;
  }

  const presets = buildPresets();

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
      >
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className={from && to ? "text-gray-900" : "text-gray-400"}>
          {formatTriggerLabel()}
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-white rounded-xl border border-gray-200 shadow-lg flex">
          {/* Left calendar */}
          <div className="p-4">
            <CalendarGrid
              month={leftMonth}
              selectedFrom={pendingFrom}
              selectedTo={pendingTo}
              hoverDate={hoverDate}
              onDayClick={handleDayClick}
              onDayHover={setHoverDate}
              showLeftNav
              showRightNav={false}
              onPrev={() => setLeftMonth((m) => subMonths(m, 1))}
              onNext={() => setLeftMonth((m) => addMonths(m, 1))}
            />
          </div>

          {/* Right calendar */}
          <div className="p-4 pl-2">
            <CalendarGrid
              month={rightMonth}
              selectedFrom={pendingFrom}
              selectedTo={pendingTo}
              hoverDate={hoverDate}
              onDayClick={handleDayClick}
              onDayHover={setHoverDate}
              showLeftNav={false}
              showRightNav
              onPrev={() => setLeftMonth((m) => subMonths(m, 1))}
              onNext={() => setLeftMonth((m) => addMonths(m, 1))}
            />
          </div>

          {/* Presets panel */}
          <div className="w-44 flex-shrink-0 border-l border-gray-100 py-3 flex flex-col gap-0.5">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePreset(preset)}
                className="w-full text-left px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
