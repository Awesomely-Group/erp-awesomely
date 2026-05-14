import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { invoiceWhereMarca, MARCA_FILTER_UNASSIGNED } from "@/lib/org";
import { tagToBrand } from "@/lib/utils";

interface TagCase {
  id: string;
  input: { tags: string[] };
  expected: { brand: string | null };
}

interface WhereCase {
  id: string;
  input: { marca: string };
  expected: {
    hasOr?: boolean;
    includesUnassigned?: boolean;
    marcaValues?: string[];
  };
}

type OrgCase = TagCase | WhereCase;

const cases = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/org.json"), "utf-8"),
) as OrgCase[];

let passed = 0;

describe("eval: org / marca filters", () => {
  for (const testCase of cases) {
    it(testCase.id, () => {
      if ("tags" in testCase.input) {
        expect(tagToBrand(testCase.input.tags)).toBe(
          (testCase as TagCase).expected.brand,
        );
      } else {
        const where = invoiceWhereMarca(testCase.input.marca);
        const expected = (testCase as WhereCase).expected;

        expect(where).toBeDefined();
        expect(where!.OR).toBeDefined();

        if (expected.hasOr) {
          expect(Array.isArray(where!.OR)).toBe(true);
          expect(where!.OR!.length).toBeGreaterThan(0);
        }

        if (expected.includesUnassigned) {
          const hasNullMarca = where!.OR!.some(
            (c) => "marca" in c && c.marca === null,
          );
          expect(hasNullMarca).toBe(true);
        }

        if (expected.marcaValues) {
          for (const m of expected.marcaValues) {
            const found = where!.OR!.some(
              (c) =>
                "OR" in c &&
                Array.isArray(c.OR) &&
                c.OR.some((cond) => "marca" in cond && cond.marca === m),
            );
            expect(found).toBe(true);
          }
        }

        if (testCase.input.marca.includes(MARCA_FILTER_UNASSIGNED)) {
          expect(expected.includesUnassigned).toBe(true);
        }
      }

      passed++;
    });
  }

  afterAll(() => {
    console.log(`[eval:org] ${passed}/${cases.length} passed`);
  });
});
