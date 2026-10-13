# Carga de cuentas y contactos al CRM

`scripts/import-crm.ts` carga cuentas y contactos desde un JSON, de forma idempotente.

```bash
pnpm tsx scripts/import-crm.ts datos.json            # valida y enseña qué haría
pnpm tsx scripts/import-crm.ts datos.json --apply    # escribe
```

## Por qué un fichero y no una API

El ERP **no tiene** endpoint de escritura del CRM, y no conviene abrirlo para una carga
que se hace cuatro veces en la vida: sería una superficie de escritura permanente sobre
datos de cliente a cambio de un trabajo puntual. La acción `createAccount` de la UI
tampoco sirve — acepta `name`, `marca`, `domain` y `vatNumber`, y **no** `lifecycle`,
`companyId` ni `holdedContactId`, que son justo los tres campos sin los cuales el portal
de cliente no encuentra a nadie.

## Formato

```json
{
  "accounts": [
    {
      "name": "Quick Smile SL",
      "marca": "Gigson Solutions",
      "lifecycle": "CUSTOMER",
      "domain": "quicksmile.es",
      "vatNumber": "B12345678",
      "companyName": "Awesomely SL",
      "holdedContactId": "68fa13d6a007a2270a03c2cc",
      "contacts": [
        { "name": "Nombre Apellido", "email": "persona@cliente.example", "phone": "+34…", "role": "Director técnico" }
      ],
      "type": "CLIENT",
      "referredBy": "Z1 Gestión"
    }
  ],
  "relations": [
    { "from": "Sociedad A", "to": "Sociedad B", "type": "SIBLING_OF", "note": "mismo grupo" }
  ],
  "leads": [
    {
      "name": "Implantación Odoo",
      "marca": "Gigson Solutions",
      "lineOfBusiness": "GENERAL",
      "stage": "Propuesta enviada",
      "account": "Quick Smile SL",
      "externalRef": "inventario-2026-09:quicksmile-odoo",
      "dealType": "NEW_BUSINESS",
      "origin": "PARTNER",
      "market": "ES",
      "seats": 10,
      "amount": 12000,
      "notes": "…",
      "contacts": [{ "email": "persona@cliente.example", "role": "DECISOR" }]
    }
  ]
}
```

| Campo | Obligatorio | Notas |
|---|---|---|
| `name` | sí | |
| `marca` | no | `Gigson Solutions`, `Gigson`, `Awesomely` o `LaTroupe`. **Sin marca la cuenta no sale en ningún portal** |
| `lifecycle` | no (`LEAD`) | `LEAD` · `QUALIFIED` · `CUSTOMER` · `CHURNED` · `DISQUALIFIED`. El portal solo enseña `CUSTOMER` |
| `companyName` | no | Nombre de la entidad legal tal cual está en el ERP (`Awesomely SL`, `Awesomely OU`); se resuelve a `companyId` |
| `holdedContactId` | no | Id del contacto en Holded. Con `companyName`, es lo que cruza con facturas y proformas |
| `domain`, `vatNumber` | no | |
| `contacts[].name` | sí | |
| `contacts[].email` | no | **Es la llave del portal**: sin correo esa persona no puede entrar |
| `contacts[].phone`, `.role` | no | `.role` es el cargo ("Director técnico"), no el papel en una venta |
| `type` | no (`CLIENT`) | `PARTNER` para prescriptores. Los proveedores no van al CRM: el ERP tiene `Supplier` |
| `referredBy` | no | Nombre de la cuenta que la trajo. Debe estar en el fichero o ya en la base |

### `relations` — enlazar sociedades sin fusionarlas

| Campo | Obligatorio | Notas |
|---|---|---|
| `from`, `to` | sí | Nombres de cuenta. Deben existir en el fichero o en la base |
| `type` | sí | `HOLDING_OF` · `SUBSIDIARY_OF` · `SIBLING_OF` · `SUPPLIER_OF` · `ADVISOR_OF` |
| `note` | no | |

Se guarda **en un solo sentido**: la ficha de la otra cuenta la lee invertida ("es holding
de" ↔ "es filial de"). No hace falta declarar las dos.

### `leads` — oportunidades

| Campo | Obligatorio | Notas |
|---|---|---|
| `name`, `marca` | sí | |
| `stage` | sí | Nombre de la etapa **tal cual** está sembrada para esa marca y línea. Si no existe, el script dice cuáles hay y no escribe nada |
| `externalRef` | sí | Llave de idempotencia. Sin ella una segunda pasada duplicaría el lead |
| `lineOfBusiness` | no (`GENERAL`) | Debe coincidir con la línea de la etapa |
| `account` | no | Nombre de la cuenta a la que cuelga |
| `dealType` | no (`NEW_BUSINESS`) | `EXPANSION` para los frentes de un retainer, `RENEWAL` para renovaciones. Marcarlo evita inflar las conversiones |
| `origin` | no | `INSIDE_OUT` · `OUTSIDE_IN` · `REFERRAL` · `INBOUND` · `PARTNER` |
| `market`, `seats`, `amount` | no | |
| `contactName`, `email`, `phone`, `notes` | no | Datos sueltos del lead, independientes de `contacts` |
| `contacts[].email` | sí | Se busca en **todo** el CRM, no solo en la cuenta del lead: el asesor externo que decide trabaja en otra empresa. Si no existe, se avisa y se omite |
| `contacts[].role` | no (`USUARIO`) | `DECISOR` · `PRESCRIPTOR` · `ASESOR_EXTERNO` · `TECNICO` · `ADMINISTRATIVO` · `USUARIO` |

Las etapas **no se crean al vuelo**: el funnel se siembra aparte y a conciencia con
`scripts/seed-growth-crm.ts`.

## Idempotencia

- **Cuenta**: se busca por `(companyId, holdedContactId)` — la misma llave con la que el
  ERP cruza facturas y proformas. Sin ella, por `(name, marca)`.
- **Contacto**: por su correo dentro de la cuenta; sin correo, por el nombre.
- **Relación**: por `(from, to, type)`.
- **Oportunidad**: por `externalRef`.

Se puede ejecutar las veces que haga falta: la segunda pasada actualiza en vez de duplicar.

En las oportunidades, actualizar **no borra**: un campo que el fichero omite se deja como
está. Si alguien enlazó la cuenta o corrigió el importe desde la pantalla, una segunda
pasada no se lo lleva por delante.

## Datos reales fuera del repositorio

Este repositorio es **público**. El fichero de carga lleva nombres, correos y teléfonos de
personas de empresas clientes, así que no se commitea: se pasa al script desde fuera del
árbol de trabajo y se borra al terminar. Los ejemplos de este documento son ficticios.

## Validación

**Si hay un solo error no se escribe nada.** Media carga es peor que ninguna, porque deja
que adivinar qué entró. Se comprueban marca, `lifecycle`, que la entidad exista, que no se
repita un `holdedContactId`, y que los correos tengan forma de correo.

La comprobación que más vale la pena es **un mismo correo en dos cuentas**. El portal
resuelve al cliente por el correo de la persona, y si aparece en dos devuelve `409
AMBIGUOUS_EMAIL` a propósito — adivinar significaría enseñarle a alguien las facturas de
otro. El resultado es que esa persona **no puede entrar**, así que se caza al cargar y no
el día que lo intente. Es un caso real y frecuente: un asesor externo que asiste a dos
sociedades del mismo grupo.

Avisa además (sin bloquear) cuando una cuenta trae `holdedContactId` sin entidad o al
revés: le faltará una de las dos y no verá facturas.

## Después de cargar

```bash
pnpm tsx scripts/backfill-project-crm-account.ts --apply   # enlaza proyectos por proformas
```

Los que queden ambiguos o sin pistas se asignan a mano con el selector "Cliente" de la
ficha del proyecto.
