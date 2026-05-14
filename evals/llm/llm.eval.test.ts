import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyInvoiceLine,
  extractServicePeriod,
} from "@/lib/llm";

interface ClassificationCase {
  id: string;
  input: {
    lineName: string;
    lineDescription?: string;
    counterparty?: string;
  };
  expected: {
    projectId?: string;
    marca?: string;
  };
}

interface ServicePeriodCase {
  id: string;
  input: { invoiceDescription: string };
  expected: { serviceStart: string; serviceEnd: string };
}

const classificationCases = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/llm/invoice-classification.json"),
    "utf-8",
  ),
) as ClassificationCase[];

const servicePeriodCases = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/llm/service-period.json"),
    "utf-8",
  ),
) as ServicePeriodCase[];

describe.skip("LLM evals — enable when classifier is implemented", () => {
  for (const testCase of classificationCases) {
    it(`classify: ${testCase.id}`, async () => {
      const result = await classifyInvoiceLine(testCase.input);

      if (testCase.expected.projectId != null) {
        expect(result.projectId).toBe(testCase.expected.projectId);
      }
      if (testCase.expected.marca != null) {
        expect(result.marca).toBe(testCase.expected.marca);
      }
    });
  }

  for (const testCase of servicePeriodCases) {
    it(`service-period: ${testCase.id}`, async () => {
      const result = await extractServicePeriod(testCase.input);
      expect(result.serviceStart).toBe(testCase.expected.serviceStart);
      expect(result.serviceEnd).toBe(testCase.expected.serviceEnd);
    });
  }
});
