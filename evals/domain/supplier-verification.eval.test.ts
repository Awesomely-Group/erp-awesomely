import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  computeExpectedAmount,
  computePeriodMismatch,
  resolveVerificationStatus,
} from "@/lib/supplier-verification";

interface PeriodCase {
  id: string;
  input: {
    serviceStart: string;
    serviceEnd: string;
    periodStart: string;
    periodEnd: string;
  };
  expected: { periodMismatch: boolean };
}

interface AmountCase {
  id: string;
  input: { hours: number; rate: number | null };
  expected: { expectedAmount: number | null };
}

interface StatusCase {
  id: string;
  input: {
    periodMismatch: boolean;
    invoicedAmount: number;
    expectedAmount: number;
  };
  expected: { status: string };
}

const allCases = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/supplier-verification.json"),
    "utf-8",
  ),
) as Array<PeriodCase | AmountCase | StatusCase>;

let passed = 0;

describe("eval: supplier verification", () => {
  for (const testCase of allCases) {
    it(testCase.id, () => {
      if ("serviceStart" in testCase.input) {
        const result = computePeriodMismatch(
          new Date(testCase.input.serviceStart),
          new Date(testCase.input.serviceEnd),
          new Date(testCase.input.periodStart),
          new Date(testCase.input.periodEnd),
        );
        expect(result).toBe(
          (testCase as PeriodCase).expected.periodMismatch,
        );
      } else if ("hours" in testCase.input) {
        const result = computeExpectedAmount(
          testCase.input.hours,
          testCase.input.rate,
        );
        expect(result).toBe(
          (testCase as AmountCase).expected.expectedAmount,
        );
      } else {
        const result = resolveVerificationStatus(testCase.input);
        expect(result).toBe((testCase as StatusCase).expected.status);
      }

      passed++;
    });
  }

  afterAll(() => {
    console.log(
      `[eval:supplier-verification] ${passed}/${allCases.length} passed`,
    );
  });
});
