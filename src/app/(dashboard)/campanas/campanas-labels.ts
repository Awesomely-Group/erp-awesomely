// Sin "use client": lo usan componentes de servidor y de cliente. (Un módulo cliente no
// puede exportar constantes hacia el servidor: llegan como referencias, no como valores.)
export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  ENABLED: "Activa",
  PAUSED: "Pausada",
  REMOVED: "Eliminada",
  UNKNOWN: "—",
};
