# Plan: Evolución del módulo de Previsiones (Forecasts) — 3 fuentes + recurrencia

## Contexto

El módulo de previsiones (`/forecasts`) ya combina, vía `src/lib/cashflow-data.ts`, tres
fuentes reales: facturas (`Invoice`), proformas pendientes de Holded (`Proforma`) y
previsiones manuales (`Forecast`). Este plan formaliza y amplía la fuente manual para que
exija una clasificación mínima (marca + cuenta contable, proveedor opcional) y soporte
recurrencia (diaria/semanal/mensual/anual, con fin por fecha o por número de ocurrencias),
generando de golpe todos los registros hijos reales y mostrándolos en la tabla bajo un
registro padre expandible/colapsable, con borrado en cascada y edición independiente de
cada hijo.

La tercera fuente (previsiones derivadas de presupuestos de proyecto) queda pospuesta a una
segunda iteración. El "centro de coste" queda como decisión de negocio abierta, sin
resolver todavía — no se implementa en este trabajo.

Puntos de partida confirmados en el código:
- Las proformas **ya** se sincronizan y clasifican por marca/proyecto
  (`src/lib/sync.ts`, `src/app/(dashboard)/proformas/actions.ts`) — este trabajo debe
  **consumir esa clasificación tal cual**, sin tocarla.
- La marca no es un enum ni tabla — es un `String?` libre, cuya fuente de verdad de
  valores válidos es `MARCA_OPTIONS` en `src/lib/org.ts` (`Gigson Solutions`, `Gigson`,
  `Awesomely`, `LaTroupe`).
- La jerarquía de cuenta contable ya existe como concepto en `AccountMapping.l1`
  (`prisma/schema.prisma:872-886`, valores `REVENUE|COGS|OPEX|CAPEX|AMORT`, gestionados en
  `src/app/(dashboard)/settings/account-mapping-table.tsx`), pero hoy no hay ningún FK
  desde `Forecast` hacia `AccountMapping`.
- El proveedor existe como modelo `Supplier` (`prisma/schema.prisma:439-464`) pero no tiene
  relación con `Forecast` todavía.
- No existe ningún mecanismo de recurrencia que genere filas nuevas en todo el código (lo
  más parecido, `InvoiceRecurrence`, es puramente descriptivo/inferido, nunca genera
  registros).
- La tabla actual (`forecasts-table.tsx`) agrupa por mes con una cabecera `<tr colSpan>`
  siempre expandida, sin toggle real. El patrón de toggle real (chevron +
  `isExpanded`/`onToggle` + subtotal) ya existe en `CollapsibleMonthGroup` dentro de
  `src/app/(dashboard)/payments/payments-view.tsx` (implementado con `div`/grid, no
  `<table>` — hay que adaptar la interacción, no copiar el layout).
- `cashflow-data.ts` suma `Forecast` con una query SQL cruda por mes/tipo — cualquier
  cambio de esquema debe mantener esa agregación intacta para las previsiones sueltas
  existentes.

## Decisiones de diseño

1. **Recurrencia con tabla separada `ForecastRecurrence`** (plantilla) +
   `Forecast.recurrenceId` opcional con `onDelete: Cascade`, en vez de una auto-relación
   `parentForecastId` sobre el propio `Forecast`. Motivo: el padre-plantilla no compite por
   los campos `Decimal` obligatorios de importe, no hay que excluirlo a mano en la query de
   `cashflow-data.ts`, y separa "plantilla de generación" de "fila de datos real". Los
   hijos son filas `Forecast` normales, así que la agregación no necesita tocarse para las
   previsiones sueltas.
2. **Reutilizar `AccountMapping`** con un nuevo FK opcional `Forecast.accountMappingId` (y
   el mismo campo en `ForecastRecurrence`) en vez de crear una tabla paralela. El primer
   nivel del selector (categoría) filtra `AccountMapping.l1` a **`COGS | OPEX | CAPEX`**
   (se excluyen `REVENUE` y `AMORT`). El segundo nivel es la cuenta específica
   (`description` + `accountNumSL`/`accountNumOU`) filtrada por la categoría elegida.
3. **Reutilizar `Supplier`** con un nuevo FK opcional `Forecast.supplierId` (e igual en
   `ForecastRecurrence`).
4. **"Pausar un mes" = flag `isPaused`** en la fila hija (no borrarla), excluyéndola de la
   suma en `cashflow-data.ts` pero conservando su histórico y permitiendo reactivarla.
5. **Borrado en cascada resuelto a nivel de base de datos** (`onDelete: Cascade` en la FK)
   — borrar la plantilla `ForecastRecurrence` borra automáticamente todos sus hijos
   `Forecast`.
6. **Presupuestos de proyecto (fuente 3): no se implementa ahora.** Punto de extensión
   identificado en `cashflow-data.ts` junto al bloque `withForecast` (usaría
   `PaymentTerm.dueDate`/`value` de `Budget`), preferiblemente sumado directamente en la
   query (como ya se hace con `Proforma`) en vez de materializar filas `Forecast`.
7. **Centro de coste: no se implementa.** No se añade ningún campo/placeholder todavía,
   para no comprometer el modelo de datos antes de decidir su fuente de verdad.

## Cambios de esquema (Prisma)

Archivo: `prisma/schema.prisma`.

```prisma
enum ForecastFrequency {
  DAILY
  WEEKLY
  MONTHLY
  YEARLY

  @@map("forecast_frequency")
}

model ForecastRecurrence {
  id          String            @id @default(cuid())
  frequency   ForecastFrequency
  startDate   DateTime
  endDate     DateTime?         // XOR con occurrences (validado en la action, no en BD)
  occurrences Int?

  type              ForecastType
  marca             String?
  projectId         String?
  project           JiraProject?    @relation(fields: [projectId], references: [id], onDelete: SetNull)
  accountMappingId  String?
  accountMapping    AccountMapping? @relation(fields: [accountMappingId], references: [id], onDelete: SetNull)
  supplierId        String?
  supplier          Supplier?       @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  description       String?
  amountOptimistic  Decimal
  amountPessimistic Decimal

  createdBy String?
  updatedBy String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  forecasts Forecast[]

  @@index([marca])
  @@map("forecast_recurrences")
}
```

En `model Forecast` (línea ~674): añadir `accountMappingId`/`accountMapping`,
`supplierId`/`supplier`, `recurrenceId`/`recurrence` (`onDelete: Cascade`),
`isPaused Boolean @default(false)`, más los índices correspondientes. Todos los FK nuevos
son **nullable** — no rompe las filas históricas (quedan `NULL`/`false`).

En `AccountMapping` y `Supplier`: solo añadir las relaciones inversas (`forecasts
Forecast[]`, `forecastRecurrences ForecastRecurrence[]`).

Dos migraciones separadas (patrón de carpetas `YYYYMMDDHHMMSS_descripcion/` ya usado en
`prisma/migrations/`):
1. `add_forecast_account_supplier` — columnas `accountMappingId`/`supplierId` + FKs +
   índices en `forecasts`.
2. `add_forecast_recurrence` — enum `forecast_frequency`, tabla `forecast_recurrences`,
   columnas `recurrenceId`/`isPaused` + FK `onDelete: Cascade` + índice en `forecasts`.

## Lógica de generación (server actions)

Nuevo archivo `src/app/(dashboard)/forecasts/recurrence-actions.ts`:

- `createForecastRecurrence(input)`:
  1. Valida XOR `endDate`/`occurrences`.
  2. Calcula las fechas con `date-fns` (`addDays`/`addWeeks`/`addMonths`/`addYears`, ya
     dependencia del proyecto) según `frequency`.
  3. Aplica un límite máximo de seguridad antes de crear nada (todo o nada): `DAILY` ≤ 366,
     `WEEKLY` ≤ 260, `MONTHLY` ≤ 60, `YEARLY` ≤ 20 ocurrencias.
  4. Dentro de `prisma.$transaction`: crea `ForecastRecurrence` + `createMany` en
     `Forecast` (una fila por fecha, copiando los campos de plantilla y `recurrenceId`).
  5. `revalidatePath("/forecasts")` y `revalidatePath("/cashflow")`.
- `deleteForecastRecurrence(id)`: `prisma.forecastRecurrence.delete(...)` — cascada
  automática vía FK.

`src/app/(dashboard)/forecasts/actions.ts`: `createForecast`/`updateForecast` amplían
`ForecastInput` con `accountMappingId`/`supplierId`/`isPaused` (siguen sirviendo para
previsiones sueltas y para editar un hijo individual sin tocar la recurrencia).

## Cambios de UI

- **`forecasts-table.tsx`**: sustituir `groupByMonth` por `groupForecasts`, que agrupa por
  `recurrenceId` (una cabecera de grupo por recurrencia, con chevron real
  `isExpanded`/`onToggle` inspirado en `CollapsibleMonthGroup` de `payments-view.tsx`,
  colapsado por defecto) dejando las filas sin `recurrenceId` como filas sueltas mezcladas
  por fecha. Fila hija con `isPaused` → estilo atenuado + badge "Pausado", excluida del
  subtotal mostrado. Botón "Eliminar recurrencia" en la cabecera de grupo (llama a
  `deleteForecastRecurrence`), distinto del "Eliminar" por fila.
- **`forecast-form.tsx`**: añade selects de cuenta contable (dos niveles: categoría
  `COGS | OPEX | CAPEX` → cuenta específica filtrada por `AccountMapping.l1`) y proveedor
  (opcional). Toggle "¿Es recurrente?" que delega en el nuevo formulario.
- **`forecast-recurrence-form.tsx`** (nuevo): frecuencia, fecha inicio, fin por fecha o por
  nº de ocurrencias (XOR), importe único, contador en vivo de cuántas filas se van a
  generar.
- **`page.tsx`**: añade `accountMapping`/`supplier` a las consultas iniciales y al `select`
  de `forecast.findMany`.
- **`src/app/api/forecasts/route.ts`**: extiende `GET`/`POST` con los nuevos campos, sin
  romper consumidores externos.

## Filtros y dashboard existentes en `/forecasts` — análisis y cambios

Análisis del código real (`forecasts-chart-filters.tsx`, `cashflow-chart.tsx`,
`cashflow-data.ts`, `page.tsx`; la página en vivo exige login corporativo y no es
accesible por fetch anónimo).

**Qué hay hoy:** filtros de Periodo, Marca, Categoría (`l1`), Entidad legal, Cuenta
contable y Escenario; gráfico de barras apiladas (reales + previsión) con líneas de
tendencia y drill-down por mes; 3 KPIs de flujo real + 2 de previsión agregada + 4 de
"Estimaciones manuales" + la tabla de `Forecast`.

**Gaps encontrados** (independientes de la recurrencia, pero más visibles con este cambio
porque ahora marca/cuenta serán obligatorias):
1. Las previsiones manuales **nunca se filtran** por marca/empresa/categoría/cuenta: la
   query de `forecasts` en `cashflow-data.ts` (líneas 183-198) solo aplica el rango de
   fechas, y `prisma.forecast.findMany(...)` en `page.tsx` (líneas 47-60) no tiene ningún
   `where` — la tabla y sus 4 KPIs siempre muestran el 100% de las previsiones sin importar
   los filtros seleccionados arriba.
2. El selector "Categoría" (`L1_OPTIONS` en `forecasts-chart-filters.tsx`) solo tiene
   `REVENUE | COGS | CAPEX` — **falta `OPEX`** (y `AMORT`), aunque `AccountMapping.l1` sí
   los soporta.
3. El selector "Cuenta contable" solo lista cuentas que ya aparecen en `InvoiceLine`
   histórico (`getCashflowAccounts()`) — una cuenta pensada solo para previsión futura sin
   facturas todavía no aparecería en el desplegable.
4. No hay filtro ni columna de Proveedor en el dashboard (coherente, hoy `Forecast` no
   tiene ese campo).

**Decisión:** mantener la estructura de filtros y del gráfico tal cual (la UX de
multiselects + gráfico de barras + drill-down por mes funciona bien y es coherente con
`/cashflow`), pero cerrar los gaps de filtrado como parte de este trabajo:
1. Añadir `marca` y cuentas resueltas por `accountMappingId`/`l1`/`account` a la query de
   `forecasts` en `cashflow-data.ts`, igual que ya se hace para `invoices`.
2. Aplicar los mismos filtros al `prisma.forecast.findMany` de `page.tsx`, para que la
   tabla "Estimaciones manuales" y sus 4 KPIs respeten los filtros seleccionados, no solo
   el gráfico superior.
3. Añadir `OPEX` (y `AMORT` si aplica) a `L1_OPTIONS` en `forecasts-chart-filters.tsx`.
4. Extender `getCashflowAccounts()` (o crear una variante) para incluir también las cuentas
   de `AccountMapping` con categoría `COGS|OPEX|CAPEX` aunque no tengan facturas históricas
   todavía.
5. No añadir filtro de Proveedor al dashboard agregado por ahora (sí como columna en la
   tabla de previsiones) — se puede añadir después si se pide.
6. El gráfico (`CashflowChart`) no necesita cambios estructurales: las previsiones
   recurrentes se suman igual que las sueltas al ser todas filas `Forecast` reales
   agrupadas por mes; solo se añade la exclusión de `isPaused`.

Nota: `Forecast` no tiene `companyId` hoy ni se propone añadirlo — el filtro "Entidad
legal" seguirá sin afectar a las previsiones manuales, fuera de alcance salvo que se pida
explícitamente.

## Agregación (`src/lib/cashflow-data.ts`)

- Añadir `AND "isPaused" = false` a la query cruda de `forecasts` para excluir hijos
  pausados del cashflow.
- Añadir filtro por `marca` y por cuentas resueltas (`accountMappingId`/`l1`/`account`) a
  esa misma query, igual que ya existe para `invoices` (ver sección de filtros arriba).

## Verificación end-to-end

1. Migraciones aplican limpio contra copia de la BD actual; filas `Forecast` existentes
   intactas con los nuevos campos en `NULL`/`false`.
2. `npx prisma generate` + build TypeScript limpio.
3. Crear recurrencia mensual de prueba (`occurrences = 12`) → 1 fila en
   `forecast_recurrences`, 12 en `forecasts` con `recurrenceId` común.
4. Tabla: la recurrencia aparece colapsada por defecto; el chevron expande/colapsa las 12
   filas sin recargar.
5. Borrar la recurrencia desde la cabecera de grupo → las 12 filas hijas desaparecen de BD
   y de la tabla.
6. Editar el importe de un hijo concreto → solo esa fila cambia, las otras 11 quedan igual.
7. Pausar un hijo → se marca visualmente y desaparece de los totales de `/forecasts` y
   `/cashflow`, pero sigue existiendo en BD y se puede reactivar.
8. Crear una recurrencia que supere el límite máximo → la action rechaza sin crear filas
   parciales.
9. Comparar totales de forecast antes/después con datos sin recurrencias — deben coincidir
   exactamente.
10. Filtrar por marca/categoría/cuenta en `/forecasts` → el gráfico, los 4 KPIs y la tabla
    de "Estimaciones manuales" cambian en consonancia (cierre del gap de filtrado).
11. `POST`/`GET` en `/api/forecasts` con los nuevos campos — no rompe el contrato existente
    de la API pública.

## Archivos a crear/modificar

- `prisma/schema.prisma`
- `prisma/migrations/<ts>_add_forecast_account_supplier/migration.sql` (nuevo)
- `prisma/migrations/<ts>_add_forecast_recurrence/migration.sql` (nuevo)
- `src/app/(dashboard)/forecasts/actions.ts`
- `src/app/(dashboard)/forecasts/recurrence-actions.ts` (nuevo)
- `src/app/(dashboard)/forecasts/forecasts-table.tsx`
- `src/app/(dashboard)/forecasts/forecast-form.tsx`
- `src/app/(dashboard)/forecasts/forecast-recurrence-form.tsx` (nuevo)
- `src/app/(dashboard)/forecasts/forecasts-client.tsx`
- `src/app/(dashboard)/forecasts/page.tsx`
- `src/app/(dashboard)/forecasts/forecasts-chart-filters.tsx`
- `src/app/api/forecasts/route.ts`
- `src/lib/cashflow-data.ts`
- `src/lib/org.ts` (nuevo helper `forecastWhereMarca`, análogo a `invoiceWhereMarca`/
  `proformaWhereMarca`, si se filtra vía Prisma en vez de SQL crudo)

## Decisiones confirmadas

1. **Marca**: "Osomly" era un error de transcripción de "Awesomely" — ya está en
   `MARCA_OPTIONS`, sin cambios en `src/lib/org.ts`.
2. **Importe único vs optimista/pesimista**: opción mínima — el formulario de recurrencia
   pide un único importe y se guarda igual en `amountOptimistic` y `amountPessimistic`
   para cada hijo generado; cada hijo se puede diferenciar después editándolo
   individualmente.
3. **"Pausar un mes"**: flag `isPaused` en la fila hija.
4. **Límite máximo de ocurrencias**: `DAILY` ≤ 366, `WEEKLY` ≤ 260, `MONTHLY` ≤ 60,
   `YEARLY` ≤ 20.
5. **Categorías de cuenta contable**: `COGS | OPEX | CAPEX`, aplicables tanto a `EXPENSE`
   como a `INCOME`.
6. **Retroactividad**: no se migran filas históricas; solo se exige en previsiones nuevas.
7. **Filtros y dashboard**: se mantiene la estructura actual, cerrando los gaps de
   filtrado de `Forecast` por marca/categoría/cuenta y añadiendo `OPEX` a `L1_OPTIONS`
   (ver sección dedicada arriba).
