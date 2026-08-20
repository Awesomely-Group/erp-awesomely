// Shared status label/color/filter definitions for Proforma.holdedStatus.
//
// Codes:
//  -1  Cancelada         (Holded: void/cancelled)
//   0  Borrador          (Holded: draft, no docNumber)
//   1  Borrador          (Holded: pending/sent — grouped with 0 in the UI)
//   2  Aprobado          (Holded: paid/accepted)
//   3  Facturado         (locally synthesized — never returned by Holded itself; set by
//                         linkProformasByHoldedRelation/markConvertedProformas in sync.ts,
//                         or manually via linkProformaToInvoice)
//   4  Vencida           (Holded: overdue/late, NOT yet converted — kept distinct from 3
//                         so a raw "overdue" proforma is never mistaken for "Facturado")

export interface ProformaStatusInfo {
  label: string;
  badgeClass: string;
}

export const PROFORMA_STATUS_MAP: Record<number, ProformaStatusInfo> = {
  [-1]: { label: "Cancelada", badgeClass: "bg-red-100 text-red-700" },
  [0]:  { label: "Borrador",  badgeClass: "bg-gray-100 text-gray-600" },
  [1]:  { label: "Borrador",  badgeClass: "bg-gray-100 text-gray-600" },
  [2]:  { label: "Aprobado",  badgeClass: "bg-green-100 text-green-700" },
  [3]:  { label: "Facturado", badgeClass: "bg-blue-100 text-blue-700" },
  [4]:  { label: "Vencida",   badgeClass: "bg-amber-100 text-amber-700" },
};

export function getProformaStatusInfo(status: number | null | undefined): ProformaStatusInfo {
  const s = status ?? 0;
  return PROFORMA_STATUS_MAP[s] ?? { label: `Estado ${s}`, badgeClass: "bg-gray-100 text-gray-600" };
}

/** Distinct filter dropdown options (dedupes the 0/1 "Borrador" grouping). */
export const PROFORMA_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "0", label: "Borrador" },
  { value: "2", label: "Aprobado" },
  { value: "3", label: "Facturado" },
  { value: "4", label: "Vencida" },
  { value: "-1", label: "Cancelada" },
];
