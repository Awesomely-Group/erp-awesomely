import { describe, expect, it } from "vitest";
import { MARCA_FILTER_UNASSIGNED, cashflowScopeConditions, groupAccountsByL1 } from "./org";

/**
 * Regresión de F1 (plan 28-ago): la consulta de proformas del gráfico de cashflow se
 * quedó sin filtro de `companyId` porque estaba escrita a mano aparte de la de
 * facturas, y una proforma de otra entidad legal (el caso real: Modus Operandi
 * apareciendo en la cuenta de la SL) se colaba en cualquier filtro. Esta prueba no
 * toca la base de datos — comprueba la función pura que arma las condiciones SQL,
 * que es lo que hace que la consulta las use — pero es la garantía de que la próxima
 * vez que se toque esta lógica, "dos entidades legales con documentos el mismo mes"
 * no vuelve a mezclarse sin que un test lo note.
 */
describe("cashflowScopeConditions", () => {
  it("sin marca ni company no añade ninguna condición", () => {
    expect(cashflowScopeConditions({})).toEqual([]);
  });

  it("filtra por entidad legal (companyId) cuando se pasa `company`", () => {
    const conditions = cashflowScopeConditions({ company: "company-sl" });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].sql).toBe('"companyId" = ?');
    expect(conditions[0].values).toEqual(["company-sl"]);
  });

  it("dos entidades legales distintas producen condiciones de companyId distintas — nunca se mezclan", () => {
    const sl = cashflowScopeConditions({ company: "company-sl" });
    const modusOperandi = cashflowScopeConditions({ company: "company-modus-operandi" });
    expect(sl[0].values).toEqual(["company-sl"]);
    expect(modusOperandi[0].values).toEqual(["company-modus-operandi"]);
    expect(sl[0].values).not.toEqual(modusOperandi[0].values);
  });

  it("acepta una columna con alias de tabla (p.ej. las facturas usan `i.\"companyId\"`)", () => {
    const conditions = cashflowScopeConditions({ company: "company-sl", companyColumn: 'i."companyId"' });
    expect(conditions[0].sql).toBe('i."companyId" = ?');
  });

  it("filtra por una sola marca", () => {
    const conditions = cashflowScopeConditions({ marca: "Gigson Solutions" });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].sql).toBe("marca IN (?)");
    expect(conditions[0].values).toEqual(["Gigson Solutions"]);
  });

  it("filtra por varias marcas con OR", () => {
    const conditions = cashflowScopeConditions({ marca: "Gigson Solutions,LaTroupe" });
    expect(conditions[0].sql).toBe("marca IN (?,?)");
    expect(conditions[0].values).toEqual(["Gigson Solutions", "LaTroupe"]);
  });

  it("combina 'sin marca asignada' con marcas nombradas", () => {
    const conditions = cashflowScopeConditions({ marca: `${MARCA_FILTER_UNASSIGNED},Gigson Solutions` });
    expect(conditions).toHaveLength(1);
    expect(conditions[0].sql).toBe("(marca IS NULL OR marca IN (?))");
    expect(conditions[0].values).toEqual(["Gigson Solutions"]);
  });

  it("combina marca y entidad legal a la vez, como una proforma con ambos filtros activos", () => {
    const conditions = cashflowScopeConditions({ marca: "Gigson Solutions", company: "company-sl" });
    expect(conditions).toHaveLength(2);
    expect(conditions[1].sql).toBe('"companyId" = ?');
    expect(conditions[1].values).toEqual(["company-sl"]);
  });
});

/**
 * F2 (plan 28-ago, redefinido): el selector de cuenta contable de cashflow/forecasts
 * se agrupa en OPEX/CAPEX/COGS, en ese orden, con el resto de categorías (REVENUE,
 * AMORT, sin categoría…) después — nunca se pierde una cuenta por no encajar en las
 * tres.
 */
describe("groupAccountsByL1", () => {
  it("agrupa en OPEX, CAPEX, COGS en ese orden, aunque las cuentas lleguen desordenadas", () => {
    const groups = groupAccountsByL1([
      { num: "1", name: "Cuenta COGS", l1: "COGS" },
      { num: "2", name: "Cuenta CAPEX", l1: "CAPEX" },
      { num: "3", name: "Cuenta OPEX", l1: "OPEX" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["OPEX", "CAPEX", "COGS"]);
  });

  it("agrupa varias cuentas bajo la misma categoría", () => {
    const groups = groupAccountsByL1([
      { num: "1", name: "SaaS", l1: "OPEX" },
      { num: "2", name: "Oficina", l1: "OPEX" },
    ]);
    expect(groups).toEqual([
      {
        label: "OPEX",
        items: [
          { num: "1", name: "SaaS", l1: "OPEX" },
          { num: "2", name: "Oficina", l1: "OPEX" },
        ],
      },
    ]);
  });

  it("no omite categorías fuera de OPEX/CAPEX/COGS ni cuentas sin categoría — van después", () => {
    const groups = groupAccountsByL1([
      { num: "1", name: "Ventas", l1: "REVENUE" },
      { num: "2", name: "Sin mapear", l1: null },
      { num: "3", name: "SaaS", l1: "OPEX" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["OPEX", "REVENUE", "Otras cuentas"]);
  });

  it("no genera cabecera para una categoría sin cuentas", () => {
    const groups = groupAccountsByL1([{ num: "1", name: "SaaS", l1: "OPEX" }]);
    expect(groups.map((g) => g.label)).toEqual(["OPEX"]);
  });

  it("con la lista vacía no devuelve grupos", () => {
    expect(groupAccountsByL1([])).toEqual([]);
  });
});
