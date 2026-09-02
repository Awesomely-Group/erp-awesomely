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
