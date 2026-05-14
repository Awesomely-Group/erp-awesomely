export type VerificationResolveStatus =
  | "PERIOD_MISMATCH"
  | "VERIFIED_MISMATCH"
  | "VERIFIED_OK";

export function computePeriodMismatch(
  serviceStart: Date,
  serviceEnd: Date,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  return serviceEnd < periodStart || serviceStart > periodEnd;
}

export function computeExpectedAmount(
  hours: number,
  rate: number | null,
): number | null {
  if (rate == null) return null;
  return Math.round(hours * rate * 100) / 100;
}

export function resolveVerificationStatus(params: {
  periodMismatch: boolean | null;
  invoicedAmount: number | null;
  expectedAmount: number | null;
}): VerificationResolveStatus {
  if (params.periodMismatch === true) return "PERIOD_MISMATCH";

  if (
    params.invoicedAmount != null &&
    params.expectedAmount != null &&
    Math.abs(params.invoicedAmount - params.expectedAmount) > 0.01
  ) {
    return "VERIFIED_MISMATCH";
  }

  return "VERIFIED_OK";
}
