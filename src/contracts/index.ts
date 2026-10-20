/**
 * Contrato de `/api/v1`: la forma de lo que la API del ERP devuelve.
 *
 * Vive **dentro de este repo** y no en un paquete compartido, por el mismo motivo que
 * `src/lib/giro-client.ts` está escrito a mano: el ERP no es parte de un monorepo y no
 * hay pipeline de publicación. Lo que se gana teniéndolo aquí es que el tipo de retorno
 * del handler, el `outputSchema` de la herramienta MCP equivalente y los tests salgan
 * los tres del mismo sitio, así que no pueden divergir entre ellos.
 *
 * Los importes viajan como **número** salvo los `Decimal` grandes de contrato, que van
 * como cadena: no caben en un número de JSON sin perder precisión y es justo donde no
 * se puede perder.
 */
import { z } from "zod";

export const pageSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  total: z.number(),
  hasMore: z.boolean(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    scope: z.string().optional(),
  }),
});

export const projectSchema = z.object({
  id: z.string(),
  jiraKey: z.string(),
  name: z.string(),
  status: z.enum(["NOT_STARTED", "ONGOING", "PAUSED", "DONE", "ARCHIVED"]),
  isPrecioCerrado: z.boolean(),
  isBolsasHoras: z.boolean(),
  isFeeRegular: z.boolean(),
  workspaceName: z.string().nullable(),
  /** Vínculo con Giro, cuando el proyecto ya está apuntado allí (Bloque E). */
  giroProjectId: z.string().nullable(),
  budgetCount: z.number(),
  hourBucketCount: z.number(),
});

export const invoiceSchema = z.object({
  id: z.string(),
  holdedId: z.string().nullable(),
  number: z.string().nullable(),
  type: z.enum(["SALE", "PURCHASE"]),
  status: z.string(),
  date: z.string(),
  dueDate: z.string().nullable(),
  counterparty: z.string().nullable(),
  currency: z.string(),
  total: z.number(),
  totalEur: z.number(),
  marca: z.string().nullable(),
  companyId: z.string().nullable(),
  accountingMonth: z.string().nullable(),
  paymentsTotal: z.number(),
  paymentsPending: z.number(),
  lineCount: z.number(),
});

export const supplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPartner: z.boolean(),
  tipo: z.string().nullable(),
  hourlyRate: z.number().nullable(),
  defaultRoleName: z.string().nullable(),
  companyId: z.string().nullable(),
});

export const budgetSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  projectId: z.string().nullable(),
  projectKey: z.string().nullable(),
  companyId: z.string().nullable(),
  /** Cadena: es el importe de un contrato y no cabe en un número de JSON sin perderlo. */
  amount: z.string(),
  lineCount: z.number(),
});

export const syncLogSchema = z.object({
  id: z.string(),
  source: z.string(),
  result: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  companyId: z.string().nullable(),
  invoicesSynced: z.number(),
  projectsSynced: z.number(),
  errorMessage: z.string().nullable(),
});

export const employeeSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  companyId: z.string(),
  isExEmployee: z.boolean(),
  /**
   * El IBAN **no** forma parte del contrato. Está en la base, pero exponerlo por API
   * multiplicaría las copias de un dato bancario de una persona física sin que ningún
   * consumidor lo necesite. Quien lo necesite, a la pantalla.
   */
});

export type ApiPage = z.infer<typeof pageSchema>;
export type ApiProject = z.infer<typeof projectSchema>;
export type ApiInvoice = z.infer<typeof invoiceSchema>;
export type ApiSupplier = z.infer<typeof supplierSchema>;
export type ApiBudget = z.infer<typeof budgetSchema>;
export type ApiSyncLog = z.infer<typeof syncLogSchema>;
export type ApiEmployee = z.infer<typeof employeeSchema>;
