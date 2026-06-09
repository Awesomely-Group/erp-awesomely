"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type ProjectTab = "dashboard" | "equipo" | "facturas" | "timesheet";

const TABS: { value: ProjectTab; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "equipo", label: "Equipo" },
  { value: "facturas", label: "Facturas" },
  { value: "timesheet", label: "Timesheet" },
];

interface Props {
  activeTab: ProjectTab;
  projectId: string;
}

export function ProjectTabNav({ activeTab, projectId }: Props): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  function navigate(value: ProjectTab): void {
    const params = new URLSearchParams(sp.toString());
    if (value === "dashboard") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    router.push(`/projects/${projectId}?${params.toString()}`);
  }

  return (
    <div className="flex border-b border-gray-200">
      {TABS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => navigate(value)}
          className={`px-4 pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === value
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
