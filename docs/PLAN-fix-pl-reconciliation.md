# Fix conciliación PyG ERP vs Holded (Awesomely SL + OU)

## Contexto

El PyG del ERP no cuadra con el de Holded por causas estructurales identificadas y cuantificadas al céntimo:

**SL 2026** (ERP −4.116,74 € vs Holded −4.816,12 €, Δ −699,38 €):
1. Compras `holdedStatus = 1` excluidas del PyG pero contabilizadas en Holded: −11.148,93 €
2. Rectificativas de compra (`purchaserefund`) no se importan por ninguna vía (endpoint `/api/v2/purchaserefunds` **no existe**, 404; y están excluidas del journal sync): +10.670,96 €
3. Asientos con fecha futura no se bajan (`getJournalEntries` trunca en hoy): −557,67 €
4. FX: ERP usa BCE, Holded su propio tipo: +946,87 €
5. Asientos `collect` en cuentas 6xx excluidos del journal sync: +101,30 €
6. Corte de ejercicio (tickets 2025 contabilizados 01/01/2026): −110,09 € → **residual documentado, no se toca**
7. Bug latente: `getJournalEntries` ignora `cursor`/`has_more` (pérdida silenciosa si una semana >200 líneas)

**OU 2026** (ERP +122.698,79 € vs Holded ≈ −3.000/−4.000 €): el plan contable estonio (422xx ingresos, 5xx gastos) no pasa por `prefixToDataKey` (solo entiende PGC 6xx/7xx) → casi todo el gasto se descarta. La tabla `account_mappings` (33 filas) ya contiene el mapeo OU↔SL pero `pl-data.ts` y `sync.ts` no la usan. Faltan 5 cuentas por mapear.

**Decisiones del usuario:**
- Incluir compras status 1 en el PyG
- Sincronizar **todo el histórico** de asientos de SL y OU (sin truncar en hoy)
- FX: usar el tipo de Holded del documento (`currencyChange`), fallback BCE

## Rama

`fix/pl-holded-reconciliation` desde `main` (Conventional Commits, **sin Co-Authored-By ni atribuciones de IA**).

## Cambios

### 1. `src/lib/sync.ts` — doc types excluidos del journal sync
- Quitar `"purchaserefund"` y `"collect"` de `HOLDED_INVOICE_DOC_TYPES` (líneas 947-954). Sus líneas 6xx/7xx (o equivalentes OU mapeadas) entrarán como asientos. Sin doble conteo: `getAllInvoicesPaginated` solo trae `invoice` y `purchase`, nunca estos tipos.

### 2. `src/lib/sync.ts` — `isPlAccount` consciente del plan OU
- `isPlAccount` (líneas 959-962) hoy solo acepta prefijo 6/7. Ampliar: aceptar también cuentas cuyo número exacto exista en `account_mappings.accountNumOU` (o `accountNumSL`). Cargar el set de cuentas mapeadas una vez por sync y pasarlo a `syncJournalEntries`.

### 3. `src/lib/pl-data.ts` — resolución de cuentas vía `account_mappings`
- Cargar `account_mappings` y construir `Map<accountNumOU, accountNumSL>` (patrón existente en `cashflow-data.ts:534-545`).
- En `resolveExpenseKey`, `journalAccountToPlKey` y filas de ingresos: si la cuenta coincide **exactamente** con un `accountNumOU`, traducir a `accountNumSL` y aplicar `prefixToDataKey`; si no, fallback actual por prefijo. La coincidencia exacta tiene prioridad.
- Cambiar filtro de compras `holdedStatus >= 2` → `>= 1` (líneas 316-335) y corregir el comentario erróneo (312-315).

### 4. `src/lib/holded.ts` — `getJournalEntries`
- Eliminar el truncado en hoy (líneas 984-989): sincronizar el ejercicio completo 01/01–31/12.
- Implementar paginación `cursor`/`has_more` en `/ledger-entries` (hoy `limit: "200"` sin seguir cursor).
- Asegurar que el sync recorre **todos los ejercicios históricos** de cada empresa (no solo el año en curso); revisar desde qué año itera el caller en `sync.ts` y extenderlo al primer ejercicio con datos.

### 5. FX — tipo de Holded con fallback BCE
- En el sync de facturas (`sync.ts`), al calcular `amountEur` de documentos en divisa: usar el tipo del documento de Holded (campo `currencyChange`/equivalente en el payload de `/invoices` y `/purchases` — **verificar nombre exacto del campo en la respuesta real antes de implementar**); si no viene, fallback al flujo BCE actual.
- Un resync completo debe recalcular `amountEur` de líneas existentes (verificar que el upsert actualiza ese campo).

### 6. Plan de cuentas — filas que faltan en `account_mappings`
Añadir vía seed/script (o UI Settings) las cuentas OU sin mapear:
- `42200000` → REVENUE (equivale a 705xx SL) — factura I260025, −9.748,66 €
- `63100000` → OPEX (FX/gastos bancarios → 669/626 SL), −306,97 €
- `62100000` → OPEX, 75 €
- `34800000` y `17500001`: investigar en el mayor OU; con toda probabilidad son de balance (anticipos/IVA/prepagos) → **no mapear** si no son PyG.

## Archivos críticos

| Archivo | Cambio |
|---|---|
| `src/lib/sync.ts` (947-954, 959-962, 984, sync facturas) | doc types, isPlAccount, FX Holded |
| `src/lib/pl-data.ts` (84-183, 312-335) | mapping OU→SL, filtro status >= 1 |
| `src/lib/holded.ts` (967-1078) | sin truncado, paginación cursor, histórico completo |
| `account_mappings` (datos) | 3 filas nuevas (+2 a investigar) |

## Verificación

1. `pnpm typecheck && pnpm lint` (no hay tests de proyecto).
2. Resync completo de SL y OU contra la BD (Neon, `.env`).
3. **SL**: PyG 2026 del ERP debe quedar a Holded (−4.816,12 €) ± residuales aceptados: corte de ejercicio −110,09 € y reclasificaciones 623/629 (neto cero).
4. **OU**: PyG 2026 debe pasar de +122.698,79 € a ≈ resultado real de Holded (ingresos ≈ 114.971,75 €, gasto 523xx ≈ 99.434 €, etc.).
5. Comprobar con SQL que las líneas de `purchaserefund`/`collect` aparecen como `journal_entry_lines` y que no hay duplicados con `invoice_lines`.
6. Commit(s) `fix: ...` en la rama; no pushear ni abrir PR sin confirmación del usuario.

---

## Estado tras verificación real (2026-09-02/03)

La PR (7 commits, `fix/pl-holded-reconciliation` → PR #13) se mergeó y desplegó. Los puntos 1-4 y 6 de "Cambios" están implementados y confirmados en el código (`HOLDED_INVOICE_DOC_TYPES` sin `purchaserefund`/`collect`, `isPlAccount` con `account_mappings`, traducción OU→SL en `pl-data.ts`, filtro compras `>= 1`, paginación cursor en `getJournalEntries` sin truncar en hoy). **El punto 5 (FX con `currencyChange` de Holded) nunca se implementó** — ninguno de los 7 commits lo toca.

Se hizo un resync completo real contra producción (`HOLDED_API_VERSION=v2` forzado — ver nota de entorno más abajo) y se comparó contra los PyG reales exportados de Holded (PDF, 03/09/2026) para 2026 completo:

### SL — prácticamente resuelto

| Línea | ERP | Holded | Δ |
|---|---|---|---|
| Gastos de personal | −5.493,85 € | −5.493,85 € | **0 €** (exacto) |
| Resultado financiero | −196,58 € | −196,58 € | **0 €** (exacto) |
| Resultado del ejercicio | −5.699,94 € | −3.132,18 € | ≈ −2.568 € |

El residual viene sobre todo del lado de ventas (~3.750 €). Se comprobó vía API que las 3 notas de crédito de venta (`creditnote`, MODA RE/LUVI 2000/BOBY BRANDS) tienen estructura contable idéntica en Holded y se procesan de forma correcta y uniforme — **no es un bug de las rectificativas**. Se detectó (sin confirmar) que MODA RE tiene 2 facturas de 3.750 € dentro de abril 2026 (F260025 del 9/04 y F260026 del 28/04) — podría ser una factura duplicada o dos conceptos distintos legítimos; no investigado más a fondo.

### OU — causa raíz identificada: tipo de cambio

OU factura casi todo en GBP/USD (solo 2 de 27 facturas de 2026 son EUR). El punto 5 del plan (nunca implementado) es la causa: **`subtotal × fxRateToEur` (nuestro tipo BCE) no coincide con el importe EUR que Holded contabilizó realmente**.

Comprobación definitiva: se comparó, factura a factura, el importe EUR de nuestro cálculo contra el importe EUR real que aparece en el **asiento contable que el propio Holded genera automáticamente por cada factura** (`documentType: "invoice"` en `/ledger-entries`, línea de cuenta `4220xxxx` — asientos que hoy excluimos del sync porque asumíamos que ya estaban cubiertos por la factura):

```
Suma de nuestros cálculo (subtotal × fxRateToEur BCE), 2026:  122.900,82 €   (Δ vs Holded: +7.929,07 €)
Suma de las líneas 4220xxxx en los asientos "Factura" de Holded, 2026: 114.521,75 €   (Δ vs Holded: −450,00 €)
PyG real de Holded (ventas OU), 2026:                          114.971,75 €
```

Usar el importe EUR que ya viene en el asiento automático de Holded (en vez de recalcular con `fxRateToEur` BCE) reduce el hueco de 7.929 € a solo 450 € (0,4%).

**Fix recomendado (no implementado todavía, alcance mayor que un cambio de una línea):**
- En vez de intentar deducir la fórmula de `currencyChange` (probado dividir y multiplicar — ninguno reproduce el número exacto, probablemente porque `currencyChange` vía API es el tipo *actual/en vivo*, no el histórico que se aplicó al contabilizar), usar directamente el importe EUR de la línea de ingreso/gasto del asiento `documentType: "invoice"`/`"purchase"` que Holded genera por cada factura.
- Esto implica **dejar de excluir** `"invoice"`/`"purchase"` de `HOLDED_INVOICE_DOC_TYPES` en `syncJournalEntries` — pero habría que **sustituir**, no sumar, el cálculo actual basado en `invoice_lines`/`subtotal*fxRateToEur` por este importe, para no duplicar. Requiere rediseñar cómo `pl-data.ts` obtiene el importe EUR de una factura en divisa (posiblemente cachear el importe del asiento en `Invoice.totalEur` en vez de calcularlo con `fxRateToEur`).
- Aplica solo a documentos en divisa distinta de EUR (SL, con todo en EUR, no le afecta — de ahí que su Resultado financiero/personal cuadren exactos).

### Nota de entorno

`HOLDED_API_VERSION` en `.env` local aparece sustituido por el placeholder `"[SENSITIVE]"` (sanitización del entorno sandbox — mismo problema ya documentado en [[forecasts-followups]] para otras variables). Hay que forzarlo explícitamente por línea de comandos (`HOLDED_API_VERSION=v2 npx tsx ...`) para que el cliente de Holded use v2 en vez de caer en v1 silenciosamente (v1 no tiene `/ledger-entries`, `getJournalEntries` hace no-op sin avisar — ver `if (!IS_V2) return [];` en `src/lib/holded.ts`).
