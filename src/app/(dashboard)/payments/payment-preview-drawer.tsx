"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X, FileWarning } from "lucide-react";
import { InvoiceDetailView } from "@/components/invoice-detail-view";
import type { InvoiceDetail } from "@/lib/invoice-detail";

/**
 * Sidebar de previsualización de factura/nómina — mismo patrón que
 * `invoices/invoice-drawer.tsx` (panel lateral controlado por query params, Escape para
 * cerrar), pero el PDF se pide a Holded al vuelo cada vez (nunca se guarda, E14/E15,
 * 2026-09-15) vía los proxies `/api/invoices/[id]/pdf` y `/api/payroll/[id]/pdf`.
 * Controlado por `?previewId=&previewType=invoice|payroll` en la URL de /payments.
 */
export function PaymentPreviewDrawer(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const previewId = searchParams.get("previewId");
  const previewType =
    searchParams.get("previewType") === "payroll" ? "payroll" : "invoice";
  const open = !!previewId;

  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pdfHttpStatus, setPdfHttpStatus] = useState<number | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  // `null` = automático: se muestra el PDF salvo que falle. En cuanto el
  // usuario elige una pestaña, manda su elección.
  const [tab, setTab] = useState<"pdf" | "detail" | null>(null);

  // Las nóminas no tienen detalle de líneas en el ERP: ahí el panel se comporta
  // exactamente igual que antes, sin pestañas. Lo usa /payroll.
  const hasDetail = previewType === "invoice";
  const activeTab = tab ?? (status === "error" && detail ? "detail" : "pdf");

  function close(): void {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("previewId");
    params.delete("previewType");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  }

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!previewId) {
      setStatus("loading");
      setPdfObjectUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setStatus("loading");
    setPdfObjectUrl(null);
    setErrorMessage(null);
    setPdfHttpStatus(null);
    setDetail(null);
    setTab(null);

    const src = `/api/${previewType}/${previewId}/pdf`;

    fetch(src)
      .then(async (res) => {
        if (!res.ok) {
          setPdfHttpStatus(res.status);
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `Error ${res.status} al pedir el PDF`);
        }
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfObjectUrl(objectUrl);
        setStatus("ok");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "No se pudo cargar la vista previa",
        );
        setStatus("error");
      });

    // En paralelo, no en cascada: en Pagos la mayoría son facturas de compra y
    // Holded solo tiene PDF si alguien adjuntó el escaneado, así que encadenar
    // las dos peticiones mostraría dos esperas seguidas en el caso habitual.
    if (previewType === "invoice") {
      fetch(`/api/invoices/${previewId}`)
        .then((res) => (res.ok ? (res.json() as Promise<InvoiceDetail>) : null))
        .then((data) => {
          if (!cancelled) setDetail(data);
        })
        .catch(() => {
          if (!cancelled) setDetail(null);
        });
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewId, previewType]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-200 ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Drawer panel — más ancho que invoice-drawer.tsx (w-1/3) porque contiene un PDF */}
      <div
        className={`fixed right-0 top-0 h-screen w-1/2 z-50 bg-white shadow-2xl flex flex-col transform transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <p className="text-sm font-medium text-gray-700">
            {previewType === "payroll"
              ? "Vista previa de nómina"
              : "Vista previa de factura"}
          </p>
          <button
            onClick={close}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {hasDetail && detail && (
          <div
            role="tablist"
            aria-label="Vista del documento"
            className="flex items-center gap-1 px-3 pt-2 border-b border-gray-100 flex-shrink-0"
          >
            {(["pdf", "detail"] as const).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
                  activeTab === key
                    ? "bg-gray-50 text-gray-800 border-b-2 border-indigo-500"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {key === "pdf" ? "Documento" : "Detalle"}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 bg-gray-50">
          {open && activeTab === "detail" && detail && (
            <InvoiceDetailView detail={detail} />
          )}

          <div className="h-full" hidden={activeTab !== "pdf"}>
            {open && status === "loading" && (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Cargando PDF desde Holded…
              </div>
            )}
            {open && status === "error" && (
              <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center">
                <FileWarning className="h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">
                  {pdfHttpStatus !== null && pdfHttpStatus >= 500
                    ? "No se pudo conectar con Holded"
                    : "Sin documento adjunto en Holded"}
                </p>
                {errorMessage && (
                  <p className="text-xs text-gray-400">{errorMessage}</p>
                )}
                {detail && (
                  <button
                    onClick={() => setTab("detail")}
                    className="mt-1 text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    Ver el detalle del ERP
                  </button>
                )}
              </div>
            )}
            {/* El iframe se oculta en vez de desmontarse: así volver a la
                pestaña del documento no recarga el visor. */}
            {open && status === "ok" && pdfObjectUrl && (
              <iframe
                src={pdfObjectUrl}
                title="Vista previa PDF"
                className="w-full h-full border-0"
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
