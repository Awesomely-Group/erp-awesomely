import type { CrmRelationType, CrmDecisionRole, CrmDealType, CrmLeadStatus, CrmOrigin } from "@prisma/client";

/**
 * Una relación entre cuentas se guarda una sola vez, en una dirección, pero la ficha de
 * las DOS cuentas implicadas tiene que mostrarla. Desde el otro lado significa lo
 * contrario: si Boby Brands "es holding de" ZZEN Labs, en la ficha de ZZEN hay que leer
 * "es filial de Boby Brands".
 *
 * Guardar además la relación inversa sería duplicar el dato y abrir la puerta a que las
 * dos copias se contradigan.
 */
export type RelationDirection = "outgoing" | "incoming";

const RELATION_LABELS: Record<CrmRelationType, Record<RelationDirection, string>> = {
  HOLDING_OF: { outgoing: "es holding de", incoming: "es filial de" },
  SUBSIDIARY_OF: { outgoing: "es filial de", incoming: "es holding de" },
  // Simétrica: se lee igual desde los dos lados.
  SIBLING_OF: { outgoing: "es sociedad hermana de", incoming: "es sociedad hermana de" },
  SUPPLIER_OF: { outgoing: "es proveedor de", incoming: "tiene como proveedor a" },
  ADVISOR_OF: { outgoing: "asesora a", incoming: "está asesorada por" },
};

/** Cómo se lee la relación desde la ficha de una de las dos cuentas. */
export function describeRelation(type: CrmRelationType, direction: RelationDirection): string {
  return RELATION_LABELS[type][direction];
}

/** Opciones del selector al crear una relación — siempre en sentido saliente. */
export const RELATION_TYPE_OPTIONS: { value: CrmRelationType; label: string }[] = (
  Object.keys(RELATION_LABELS) as CrmRelationType[]
).map((value) => ({ value, label: RELATION_LABELS[value].outgoing }));

const DECISION_ROLE_LABELS: Record<CrmDecisionRole, string> = {
  DECISOR: "Decisor",
  PRESCRIPTOR: "Prescriptor",
  ASESOR_EXTERNO: "Asesor externo",
  TECNICO: "Técnico",
  ADMINISTRATIVO: "Administrativo",
  USUARIO: "Usuario",
};

export function decisionRoleLabel(role: CrmDecisionRole): string {
  return DECISION_ROLE_LABELS[role];
}

export const DECISION_ROLE_OPTIONS: { value: CrmDecisionRole; label: string }[] = (
  Object.keys(DECISION_ROLE_LABELS) as CrmDecisionRole[]
).map((value) => ({ value, label: DECISION_ROLE_LABELS[value] }));

const DEAL_TYPE_LABELS: Record<CrmDealType, string> = {
  NEW_BUSINESS: "Negocio nuevo",
  EXPANSION: "Ampliación",
  RENEWAL: "Renovación",
};

export function dealTypeLabel(type: CrmDealType): string {
  return DEAL_TYPE_LABELS[type];
}

export const DEAL_TYPE_OPTIONS: { value: CrmDealType; label: string }[] = (
  Object.keys(DEAL_TYPE_LABELS) as CrmDealType[]
).map((value) => ({ value, label: DEAL_TYPE_LABELS[value] }));

const ORIGIN_LABELS: Record<CrmOrigin, string> = {
  INSIDE_OUT: "Base instalada (inside-out)",
  OUTSIDE_IN: "Mercado abierto (outside-in)",
  REFERRAL: "Referido",
  INBOUND: "Inbound",
  PARTNER: "Partner",
};

export function originLabel(origin: CrmOrigin): string {
  return ORIGIN_LABELS[origin];
}

export const ORIGIN_OPTIONS: { value: CrmOrigin; label: string }[] = (
  Object.keys(ORIGIN_LABELS) as CrmOrigin[]
).map((value) => ({ value, label: ORIGIN_LABELS[value] }));

/**
 * Estado del lead, que NO es una etapa del embudo: el embudo es de oportunidades. Un
 * lead solo responde a "¿lo hemos llamado ya?" y "¿ha salido algo de ahí?".
 */
const LEAD_STATUS_LABELS: Record<CrmLeadStatus, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  QUALIFIED: "Cualificado",
  DISQUALIFIED: "Descartado",
};

export function leadStatusLabel(status: CrmLeadStatus): string {
  return LEAD_STATUS_LABELS[status];
}
