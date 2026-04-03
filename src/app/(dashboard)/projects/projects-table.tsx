"use client";

import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export interface ProjectRow {
  id: string;
  jiraKey: string;
  name: string;
  revenue: number;
  costs: number;
  margin: number;
  classifications: number;
}

type SortKey = "jiraKey" | "name" | "revenue" | "costs" | "margin" | "classifications";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }): React.JSX.Element {
  if (!active) return <ChevronsUpDown className="inline h-3.5 w-3.5 text-gray-300 ml-1" />;
  return dir === "asc"
    ? <ChevronUp className="inline h-3.5 w-3.5 text-indigo-600 ml-1" />
    : <ChevronDown className="inline h-3.5 w-3.5 text-indigo-600 ml-1" />;
}

function alignClass(align: "left" | "right" | "center"): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function ProjectsSortTh({
  label,
  col,
  align = "left",
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  align?: "left" | "right" | "center";
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}): React.JSX.Element {
  return (
    <th
      className={`px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 ${alignClass(align)}`}
      onClick={() => onSort(col)}
    >
      {label}
      <SortIcon active={sortKey === col} dir={sortDir} />
    </th>
  );
}

interface Props {
  projects: ProjectRow[];
  workspaceName: string;
  workspaceDomain: string;
  totalProjects: number;
  projectsWithActivity: number;
}

export function ProjectsTable({ projects, workspaceName, workspaceDomain, totalProjects, projectsWithActivity }: Props): React.JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "jiraKey" ? "asc" : "desc");
    }
  }

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "jiraKey": cmp = a.jiraKey.localeCompare(b.jiraKey); break;
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "revenue": cmp = a.revenue - b.revenue; break;
        case "costs": cmp = a.costs - b.costs; break;
        case "margin": cmp = a.margin - b.margin; break;
        case "classifications": cmp = a.classifications - b.classifications; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [projects, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900">{workspaceName}</h2>
        <span className="text-xs text-gray-400">{workspaceDomain}</span>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {totalProjects} proyectos · {projectsWithActivity} con actividad
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <ProjectsSortTh label="Clave" col="jiraKey" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <ProjectsSortTh label="Proyecto" col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <ProjectsSortTh label="Ingresos (EUR)" col="revenue" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <ProjectsSortTh label="Costes (EUR)" col="costs" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <ProjectsSortTh label="Margen (EUR)" col="margin" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <ProjectsSortTh label="Clasificaciones" col="classifications" align="center" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((project) => (
              <tr
                key={project.id}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                    {project.jiraKey}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{project.name}</td>
                <td className="px-4 py-3 text-right text-green-700">
                  {project.revenue > 0 ? formatCurrency(project.revenue) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-red-600">
                  {project.costs > 0 ? formatCurrency(project.costs) : "—"}
                </td>
                <td className={`px-4 py-3 text-right font-medium ${project.margin >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {project.revenue > 0 || project.costs > 0 ? formatCurrency(project.margin) : "—"}
                </td>
                <td className="px-4 py-3 text-center text-gray-500">
                  {project.classifications > 0 ? project.classifications : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Sin proyectos sincronizados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
