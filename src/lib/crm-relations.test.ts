import { describe, expect, it } from "vitest";
import {
  DEAL_TYPE_OPTIONS,
  DECISION_ROLE_OPTIONS,
  RELATION_TYPE_OPTIONS,
  dealTypeLabel,
  decisionRoleLabel,
  describeRelation,
} from "./crm-relations";

describe("describeRelation", () => {
  // El caso real: Boby Brands es el holding y ZZEN Labs la empresa de dentro. La
  // relación se guarda una vez y las dos fichas tienen que leerla bien.
  it("invierte holding y filial según el lado desde el que se mira", () => {
    expect(describeRelation("HOLDING_OF", "outgoing")).toBe("es holding de");
    expect(describeRelation("HOLDING_OF", "incoming")).toBe("es filial de");
    expect(describeRelation("SUBSIDIARY_OF", "outgoing")).toBe("es filial de");
    expect(describeRelation("SUBSIDIARY_OF", "incoming")).toBe("es holding de");
  });

  // Charming Concept y Only Charming: ninguna de las dos "manda" sobre la otra.
  it("lee igual la relación simétrica desde los dos lados", () => {
    expect(describeRelation("SIBLING_OF", "outgoing")).toBe(
      describeRelation("SIBLING_OF", "incoming"),
    );
  });

  // Iknoga es proveedor de Dream España, no su cliente.
  it("distingue proveedor de quien lo tiene contratado", () => {
    expect(describeRelation("SUPPLIER_OF", "outgoing")).toBe("es proveedor de");
    expect(describeRelation("SUPPLIER_OF", "incoming")).toBe("tiene como proveedor a");
  });

  it("cubre todos los tipos en ambas direcciones", () => {
    for (const { value } of RELATION_TYPE_OPTIONS) {
      expect(describeRelation(value, "outgoing")).toBeTruthy();
      expect(describeRelation(value, "incoming")).toBeTruthy();
    }
  });
});

describe("etiquetas de papel y tipo de operación", () => {
  it("traduce el papel en la decisión", () => {
    expect(decisionRoleLabel("ASESOR_EXTERNO")).toBe("Asesor externo");
  });

  it("traduce el tipo de operación", () => {
    expect(dealTypeLabel("NEW_BUSINESS")).toBe("Negocio nuevo");
    expect(dealTypeLabel("EXPANSION")).toBe("Ampliación");
  });

  it("expone una opción por valor del enum, sin huecos", () => {
    expect(DECISION_ROLE_OPTIONS).toHaveLength(6);
    expect(DEAL_TYPE_OPTIONS).toHaveLength(3);
    expect(RELATION_TYPE_OPTIONS).toHaveLength(5);
    for (const { label } of [...DECISION_ROLE_OPTIONS, ...DEAL_TYPE_OPTIONS]) {
      expect(label).toBeTruthy();
    }
  });
});
