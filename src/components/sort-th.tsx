"use client";

import Link from "next/link";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }): React.JSX.Element {
  const Icon = active ? (dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-indigo-600" : "text-gray-300"}`} />;
}

/** Link-based sort header — for server-side sorted tables (URL params). */
export function SortTh({
  label,
  active,
  sortDir,
  href,
  align = "left",
  className,
}: {
  label: string;
  active: boolean;
  sortDir: SortDir;
  href: string;
  align?: "left" | "right" | "center";
  className?: string;
}): React.JSX.Element {
  const alignClass = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "";
  return (
    <th className={`px-4 py-3 font-medium text-gray-600 ${className ?? ""}`}>
      <Link href={href} className={`inline-flex items-center gap-1 hover:text-gray-900 ${alignClass}`}>
        {label}
        <SortIcon active={active} dir={sortDir} />
      </Link>
    </th>
  );
}

/** Button-based sort header — for client-side sorted tables. */
export function SortThClick({
  label,
  active,
  sortDir,
  onClick,
  align = "left",
  className,
}: {
  label: string;
  active: boolean;
  sortDir: SortDir;
  onClick: () => void;
  align?: "left" | "right" | "center";
  className?: string;
}): React.JSX.Element {
  const alignClass = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "";
  return (
    <th className={`px-4 py-3 font-medium text-gray-600 ${className ?? ""}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-gray-900 ${alignClass}`}
      >
        {label}
        <SortIcon active={active} dir={sortDir} />
      </button>
    </th>
  );
}
