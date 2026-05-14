import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  scoreProjectSuggestions,
  type ProjectForSuggestion,
} from "@/lib/suggestions";

interface SuggestionCase {
  id: string;
  input: {
    lineName: string;
    lineDescription?: string | null;
  };
  expected: {
    top1ProjectId?: string;
    minConfidence?: number;
    empty?: boolean;
  };
}

const catalog = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/projects-catalog.json"), "utf-8"),
) as ProjectForSuggestion[];

const cases = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/suggestions.json"), "utf-8"),
) as SuggestionCase[];

let passed = 0;

describe("eval: project suggestions (accuracy@1)", () => {
  for (const testCase of cases) {
    it(testCase.id, () => {
      const results = scoreProjectSuggestions(catalog, testCase.input);

      if (testCase.expected.empty) {
        expect(results).toHaveLength(0);
        passed++;
        return;
      }

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].projectId).toBe(testCase.expected.top1ProjectId);

      if (testCase.expected.minConfidence != null) {
        expect(results[0].confidence).toBeGreaterThanOrEqual(
          testCase.expected.minConfidence,
        );
      }

      passed++;
    });
  }

  afterAll(() => {
    console.log(
      `[eval:suggestions] accuracy@1: ${passed}/${cases.length} passed`,
    );
  });
});
