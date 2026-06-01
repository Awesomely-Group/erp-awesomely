"use client";

import { useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import { Sidebar } from "./sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex min-h-screen">
      {open && <Sidebar onCollapse={() => setOpen(false)} />}
      <main className="flex-1 overflow-auto relative">
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="absolute top-4 left-4 z-10 p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Mostrar menú"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        )}
        <div className={`px-8 pt-8 pb-6${open ? "" : " pl-14"}`}>{children}</div>
      </main>
    </div>
  );
}
