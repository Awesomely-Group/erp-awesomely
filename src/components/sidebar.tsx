"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  TrendingUp,
  Settings,
  RefreshCw,
  LogOut,
  CreditCard,
  Users,
  ClipboardList,
  CalendarDays,
  LineChart,
  BarChart3,
  PanelLeftClose,
  BookOpen,
  Scale,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/actions";

type NavItem = { name: string; href: string; icon: typeof LayoutDashboard };
type NavSubsection = { label: string; items: NavItem[] };
type NavGroup = { label: string; items: NavItem[]; subsections?: NavSubsection[] };

/**
 * Sidebar agrupada por bloques (E12, revisión 2026-09-03): antes era una lista plana
 * de 14 enlaces sin jerarquía visual, difícil de escanear. Los bloques siguen el
 * flujo marketing/ventas → operaciones → facturación → contabilidad → sistema.
 *
 * "CRM" y "Marketing" (dentro de Marketing y Ventas) son subsecciones vacías a
 * propósito, reservadas para cuando existan esas páginas — no enlazan a nada todavía.
 */
const NAVIGATION_GROUPS: NavGroup[] = [
  {
    label: "General",
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Marketing y Ventas",
    items: [],
    subsections: [
      { label: "CRM", items: [] },
      { label: "Marketing", items: [] },
    ],
  },
  {
    label: "Operaciones",
    items: [{ name: "Proyectos", href: "/projects", icon: FolderKanban }],
  },
  {
    label: "Facturación",
    items: [
      { name: "Facturas", href: "/invoices", icon: FileText },
      { name: "Pagos y Cobros", href: "/payments", icon: CreditCard },
      { name: "Proformas", href: "/proformas", icon: ClipboardList },
      { name: "Presupuestos", href: "/budgets", icon: BookOpen },
    ],
  },
  {
    label: "Contabilidad",
    items: [
      { name: "Flujo de Caja", href: "/cashflow", icon: TrendingUp },
      { name: "Previsiones", href: "/forecasts", icon: CalendarDays },
      { name: "Proyecciones", href: "/proyecciones", icon: LineChart },
      { name: "P&L", href: "/pl", icon: BarChart3 },
      { name: "Conciliación", href: "/reconciliation", icon: Scale },
    ],
  },
  {
    label: "Sistema",
    items: [
      { name: "Sincronización", href: "/sync", icon: RefreshCw },
      { name: "Proveedores", href: "/suppliers", icon: Users },
      { name: "Configuración", href: "/settings", icon: Settings },
    ],
  },
];

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

function groupHasActiveItem(group: NavGroup, pathname: string): boolean {
  return (
    group.items.some((item) => isItemActive(pathname, item.href)) ||
    (group.subsections?.some((sub) => sub.items.some((item) => isItemActive(pathname, item.href))) ?? false)
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }): React.JSX.Element {
  const isActive = isItemActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      )}
    >
      <item.icon className="h-5 w-5 shrink-0" />
      {item.name}
    </Link>
  );
}

export function Sidebar({ onCollapse }: { onCollapse?: () => void }): React.JSX.Element {
  const pathname = usePathname();

  // Secciones como acordeón: por defecto, una sección está abierta si contiene la
  // página actual (derivado en cada render, sin efectos) y plegada si no — hasta que
  // el usuario la pliega/despliega a mano, lo que prevalece sobre ese valor por
  // defecto (guardado por separado en `manualOverrides`, solo para las secciones que
  // el usuario ha tocado).
  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({});

  function isGroupOpen(group: NavGroup): boolean {
    return manualOverrides[group.label] ?? groupHasActiveItem(group, pathname);
  }

  function toggleGroup(group: NavGroup): void {
    setManualOverrides((prev) => ({ ...prev, [group.label]: !isGroupOpen(group) }));
  }

  return (
    <aside className="flex flex-col w-64 h-screen sticky top-0 bg-white border-r border-gray-200">
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">A</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">ERP Awesomely</p>
            <p className="text-xs text-gray-500">Grupo Awesomely</p>
          </div>
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
            title="Ocultar menú"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAVIGATION_GROUPS.map((group) => {
          const isOpen = isGroupOpen(group);
          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="flex w-full items-center gap-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 transition-colors"
                aria-expanded={isOpen}
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
                {group.label}
              </button>
              {isOpen && (
                <div className="space-y-1 pb-2">
                  {group.items.map((item) => (
                    <NavLink key={item.name} item={item} pathname={pathname} />
                  ))}
                  {group.subsections?.map((sub) => (
                    <div key={sub.label} className="pt-1.5 pl-2 space-y-1">
                      <p className="px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-300">
                        {sub.label}
                      </p>
                      {sub.items.length === 0 ? (
                        <p className="px-3 text-xs italic text-gray-300">Próximamente</p>
                      ) : (
                        sub.items.map((item) => (
                          <NavLink key={item.name} item={item} pathname={pathname} />
                        ))
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-200">
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
