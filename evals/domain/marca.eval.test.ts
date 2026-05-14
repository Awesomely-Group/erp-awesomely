import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  deriveMarcaFromClassifications,
  type ClassificationForMarca,
} from "@/lib/invoice-marca";

interface MarcaCase {
  id: string;
  input: { classifications: ClassificationForMarca[] };
  expected: { marca: string | null };
}

const cases = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/marca-derivation.json"),
    "utf-8",
  ),
) as MarcaCase[];

let passed = 0;

describe("eval: marca derivation", () => {
  for (const testCase of cases) {
    it(testCase.id, () => {
      const result = deriveMarcaFromClassifications(
        testCase.input.classifications,
      );
      expect(result).toBe(testCase.expected.marca);
      passed++;
    });
  }

  afterAll(() => {
    console.log(`[eval:marca] ${passed}/${cases.length} passed`);
  });
});
