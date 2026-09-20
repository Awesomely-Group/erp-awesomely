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
        { "name": "Rufino Cid", "email": "rufino@quicksmile.es", "phone": "+34…", "role": "Director técnico" }
      ]
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
| `contacts[].phone`, `.role` | no | |

## Idempotencia

- **Cuenta**: se busca por `(companyId, holdedContactId)` — la misma llave con la que el
  ERP cruza facturas y proformas. Sin ella, por `(name, marca)`.
- **Contacto**: por su correo dentro de la cuenta; sin correo, por el nombre.

Se puede ejecutar las veces que haga falta: la segunda pasada actualiza en vez de duplicar.

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
