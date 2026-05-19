"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TABS = [
  { value: "todos", label: "Todos" },
  { value: "proveedores", label: "Proveedores" },
  { value: "partners", label: "Partners" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

interface Props {
  tab: string | undefined;
}

export function SuppliersTabNav({ tab }: Props): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  function navigate(value: TabValue): void {
    const params = new URLSearchParams(sp.toString());
    if (value === "todos") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    router.push(`/suppliers?${params.toString()}`);
  }

  const active = (tab ?? "todos") as TabValue;

  return (
    <div className="flex border-b border-gray-200">
      {TABS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => navigate(value)}
          className={`px-4 pb-3 text-sm font-medium border-b-2 transition-colors ${
            active === value
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
