"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  PanelLeftClose,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/actions";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Facturas", href: "/invoices", icon: FileText },
  { name: "Proformas", href: "/proformas", icon: ClipboardList },
  { name: "Proyectos", href: "/projects", icon: FolderKanban },
  { name: "Proveedores", href: "/suppliers", icon: Users },
  { name: "Flujo de Caja", href: "/cashflow", icon: TrendingUp },
  { name: "Previsiones", href: "/forecasts", icon: CalendarDays },
  { name: "Pagos y Cobros", href: "/payments", icon: CreditCard },
  { name: "Sincronización", href: "/sync", icon: RefreshCw },
  { name: "Configuración", href: "/settings", icon: Settings },
];

export function Sidebar({ onCollapse }: { onCollapse?: () => void }): React.JSX.Element {
  const pathname = usePathname();

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
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.name}
            </Link>
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
