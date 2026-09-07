# Revisión reunión "AW ERP review" (2026-09-03) — cambios propuestos vs. implementados

Fuente: transcripción Read.ai `01M1K7GVQQTFCSTRW2BCBZFJ7J` (Jaume, Emmelin, Irene).

## Contexto
Reunión de revisión del ERP (erp-awesomely) y Giro con Emmelin e Irene. Se propusieron cambios de previsiones, configuración contable y usabilidad de Giro. Parte ya está implementada (commits del 2026-09-03, 12:53–13:21 en ambos repos). Este documento recoge el estado de cada punto y qué queda por implementar.

## Estado por item

### ERP (erp-awesomely)

| # | Item | Estado | Evidencia |
|---|------|--------|-----------|
| E1 | Bug filtros: proformas de otra marca/entidad colándose y periodos no respetados | ✅ Hecho (validar) | `src/lib/cashflow-data.ts:226-252` — proformas ahora con `cashflowScopeConditions` + rango de fechas; comentario cita "el bug que vio Irene" |
| E2 | Checkbox de grupo OPEX/CAPEX en filtro de cuenta de /forecasts (selector desactualizado) | ✅ Hecho | commit `200f9aa` (2026-09-03 12:53) |
| E3 | Equivalencias cuentas SL↔OU / P&L no cuadra al céntimo | ✅ En marcha | PR #13 `fix/pl-holded-reconciliation` + `a7fca66` account_mappings |
| E4 | Botón "Nueva previsión" arriba a la derecha | ✅ Ya estaba | `forecasts/page.tsx:107` |
| E5 | Rediseño vista principal de previsiones: quitar gráfico mensual + documentos → vista secundaria; listado de cuentas contables con estimado/real/pendiente por cuenta | ❌ Pendiente | `forecasts/page.tsx` sigue mostrando gráfico (l.162) y documentos del mes (l.170) en la principal |
| E6 | Campo **entidad legal** en nueva previsión (one-shot y recurrente) | ❌ Pendiente | `forecast-form.tsx` sin campo entidad; modelo `Forecast` sin `companyId` (comentario en cashflow-data.ts:256) |
| E7 | Listados de cuentas separados SL / OU (no lista única) en previsiones | ❌ Pendiente | decisión de reunión hasta resolver mapeo |
| E8 | Tooltips/ayudas en KPIs — **con textos verificados contra el cálculo real, no los de la reunión** | ❌ Pendiente | KPI cards sin tooltip; ver sección "Textos verificados de tooltips" |
| E9 | Revisar terminología previsiones vs estimaciones vs proyecciones (subtítulo "Estimaciones ERP", sección Proyecciones=escenarios/runway) | ❌ Pendiente | `forecasts/page.tsx:100`, `/proyecciones` existe con escenarios |
| E10 | Tres estados de previsión: estimado / comprometido (proformas-POs firmadas) / real | ❌ Pendiente | solo escenarios optimista/pesimista |
| E11 | Rehacer Presupuestos como generador de propuestas (La Troupe + Gigson Solutions) | ❌ Pendiente | `/budgets` tabla actual "para hacer nueva" según reunión |
| E12 | Sidebar agrupado por bloques (ventas, CRM, facturación, contabilidad) | ❌ Pendiente | `src/components/sidebar.tsx:27-40` lista plana |
| E13 | Config cuentas: nombres "español (equivalente entre paréntesis)" en listados | ❌ Pendiente | account-mapping-table con columnas separadas SL/OU |
| E14 | Limpiar cuentas duplicadas/incorrectas (p.ej. "Finish Goods") | 👤 Irene (datos, no código) | — |
| E15 | Mapear conceptos del Excel de gastos → cuentas contables ERP | 👤 Emmelin (manual) | — |

### Giro

| # | Item | Estado | Evidencia |
|---|------|--------|-----------|
| G1 | Columnas duplicadas en tablero ("Por hacer"/"To Do", "Done"/"Hecho") | ✅ Hecho (código) | `37ffeb3` — resolveStatus en cascada + script `fix-duplicate-workflow-statuses.ts` |
| G2 | Numeración desplazada (FIN-74/73, FIM-152/155, worklogs en tarea errónea) | ✅ Hecho (código) | `37ffeb3` — explicitNumber paridad con Jira + `rename-issues-to-jira-keys.ts` + redirect por sourceKey (`03dfe64`) |
| G3 | Click en tarjeta del tablero abre el detalle | ✅ Hecho | `d48b6a9` |
| G4 | Gantt abre en junio del año pasado → mes actual | ✅ Hecho | `ead8d8b` |
| G5 | Ocultar completadas antiguas (Irene pedía 14 días) | ✅ Hecho | `03dfe64` — filtro `?hechas=7\|15\|30\|todas`, 15 por defecto |
| G6 | Crear tareas desde cualquier vista (no solo backlog) | ✅ Hecho | `03dfe64` — botón "Nuevo issue" persistente en barra de pestañas |
| G7 | Sync Jira/Tempo + entrada manual en paralelo | ✅ Hecho | F8 en producción, cron incremental |
| G8 | "Mis horas" vacía | ✅ Resuelto | confirmado en la propia reunión |
| G9 | ⚠️ Ejecutar scripts de reparación en producción | ⏳ Pendiente operar | orden obligatorio: deploy → `fix:duplicate-statuses --apply` → `rename-issues-to-jira-keys --apply` (CLAUDE.md de giro) |
| G10 | Buscador de texto en listado de proyectos | ❌ Pendiente | `/[org]/projects/page.tsx` solo filtra por cliente/estado/responsable |
| G11 | Temporizador: buscar también por proyecto (no solo key/summary de tarea) | ❌ Pendiente | `lib/issues.ts:searchIssues` no busca en nombre de proyecto |
| G12 | Filtros por defecto que ocultan tareas (caso FIN-120) | ⚠️ Parcial | filtro "Hecho" y redirect ayudan; revisar filtros por defecto de backlog/Mis horas |
| G13 | Acceso rápido a "últimas tareas usadas" en el resumen | ⚠️ Parcial | existe en temporizador flotante (`recentIssuesForTimer`), no en resumen |
| G14 | Scroll horizontal incómodo (hay que bajar para desplazarse) | ❌ Pendiente | sin evidencia de fix |
| G15 | Crear las 4 tareas habituales desde Giro para validar | 👤 Irene | — |

### Otros
- Factura a UDU por la comisión (contra su pedido de compra) → Irene (operativo, no código).

## Textos verificados de tooltips (E8)

Verificado contra `src/lib/cashflow-data.ts` (getCashflowData, l.286-401). Las definiciones dichas en la reunión NO cuadran del todo con lo que calculan las métricas:

- **Entradas totales** (`kpis.totalInflows`): facturas de VENTA (total con IVA, `totalEur`) del periodo filtrado + pagos manuales sueltos ya cobrados (sin factura asociada). Tooltip: "Facturas de venta emitidas + cobros manuales sueltos, en el periodo filtrado (IVA incluido)".
- **Salidas totales**: facturas de COMPRA + pagos manuales sueltos ya pagados. Tooltip análogo.
- **Flujo neto**: entradas − salidas del periodo.
- **Previsión entradas** (`totalForecastInflows`): proformas activas (holdedStatus 0,1,4) **+ previsiones manuales tipo ingreso** del escenario elegido (pesimista/optimista). En la reunión se dijo "solo proformas" — era cierto solo porque no había previsiones registradas. Tooltip: "Proformas pendientes + previsiones manuales de ingreso (escenario X)".
- **Previsión salidas**: SOLO previsiones manuales de gasto (las proformas nunca suman aquí). Tooltip: "Previsiones manuales de gasto (escenario X). Las proformas no cuentan como salida".
- **⚠️ Matiz clave (origen de la confusión de los 104.000 €)**: `resolveDateRange` (l.65-77) para "last_X_months" pone solo `gte`, sin `lte` → los KPIs de previsión incluyen proformas/previsiones de **meses futuros** aunque el filtro diga "últimos 12 meses". Decidir: (a) explicitarlo en el tooltip, o (b) separar el KPI en pasado/futuro, o (c) añadir `lte` y que el futuro solo se vea al ampliar el rango.

## Trabajo propuesto (si se decide implementar los pendientes)

**ERP — prioridad reunión:**
1. E5: rediseñar `/forecasts` — mover gráfico+documentos a vista secundaria (botón), vista principal = tabla de cuentas contables (nombre descriptivo) con estimado/real/pendiente, desglose por entidad/marca; abajo, registros de previsiones (reutilizar `/forecasts/manuales`).
2. E6: añadir `companyId` (entidad legal) al modelo `Forecast` (migración Prisma) + campo obligatorio en `forecast-form.tsx` + filtros.
3. E8: tooltips en KPIs de `/forecasts` explicando cada indicador (textos verificados arriba).
4. E9: repaso de textos (quitar "Estimaciones ERP", aclarar Previsiones/Proyecciones).
5. E12: agrupar sidebar en secciones.
6. E7/E13: separar listados SL/OU y nomenclatura en selectores.
7. E11: generador de propuestas (alcance mayor, definir aparte — ver docs/proposals-plan-v2.md).

**Giro:**
1. G9: desplegar y ejecutar los 2 scripts de reparación contra producción (orden obligatorio).
2. G10: input de búsqueda por nombre en `/[org]/projects`.
3. G11: extender `searchIssues` para matchear también `project.name`/`project.key`.
4. G12: revisar defaults de filtros que ocultan tareas activas.
5. G13: bloque "últimas tareas" en el resumen del proyecto.
6. G14: revisar overflow/scroll horizontal en tablero.

## Verificación
- ERP: `pnpm typecheck && pnpm lint && pnpm test` en erp-awesomely; revisar `/forecasts` con filtros de periodo/marca/entidad y comprobar que los KPIs cuadran.
- Giro: `typecheck && lint && test && build`; tras los scripts en prod, comprobar en el tablero de "AW - Finance" que FIN-74/FIN-120 aparecen con la key correcta y sin columnas duplicadas.
