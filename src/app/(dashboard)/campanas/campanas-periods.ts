// Sin "use client": lo importan tanto la página (servidor) como los filtros (cliente).
// Un módulo cliente no puede exportar constantes para el servidor.
export const CAMPANAS_PERIODS = [
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes pasado" },
  { value: "this_quarter", label: "Este trimestre" },
  { value: "last_quarter", label: "Trimestre pasado" },
  { value: "this_year", label: "Este año" },
  { value: "last_year", label: "Año pasado" },
  { value: "custom", label: "Personalizado…" },
] as const;

export const CAMPANAS_DEFAULT_PERIOD = "this_month";
