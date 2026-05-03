"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  children: React.ReactNode;
}

export function InvoiceDrawer({ open, children }: Props): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  function close(): void {
    const params = new URLSearchParams(sp.toString());
    params.delete("invoiceId");
    router.push(`/invoices?${params.toString()}`);
  }

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 h-screen w-[500px] max-w-full z-50 bg-white shadow-2xl flex flex-col transform transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* Drawer close button */}
        <div className="flex items-center justify-end px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <button
            onClick={close}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer content */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </>
  );
}
