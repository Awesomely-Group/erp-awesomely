"use client";

import React, { useEffect, useState } from "react";
import { ProjectFixedPriceSection } from "./project-fixed-price-section";
import { ProjectRegularFeeSection } from "./project-regular-fee-section";
import { ProjectHourBucketsSection } from "./project-hour-buckets-section";
import type { TempoWorklogsMonthCostResponse } from "@/app/api/tempo/worklogs/route";

interface RegularFeeEntry {
  id: string;
  label: string;
  monthlyFee: number;
  maxHoursPerMonth: number;
}

interface ProjectTypesConfig {
  isPrecioCerrado: boolean;
  isBolsasHoras: boolean;
  isFeeRegular: boolean;
  fixedPrice: number | null;
  budgetedHours: number | null;
  regularFeeEntries: RegularFeeEntry[];
}

interface Props {
  projectId: string;
  from: string;
  to: string;
  hasTempoToken: boolean;
  config: ProjectTypesConfig;
}

export function ProjectTypesDashboard({ projectId, from, to, hasTempoToken, config }: Props): React.JSX.Element | null {
  const { isPrecioCerrado, isBolsasHoras, isFeeRegular } = config;
  const hasAnyType = isPrecioCerrado || isBolsasHoras || isFeeRegular;

  const [tempoData, setTempoData] = useState<TempoWorklogsMonthCostResponse | null>(null);

  const needsTempoData = (isPrecioCerrado || (isFeeRegular && config.regularFeeEntries.length > 0)) && hasTempoToken;

  useEffect(() => {
    if (!needsTempoData) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTempoData(null);
    fetch(`/api/tempo/worklogs?projectId=${projectId}&from=${from}&to=${to}&groupBy=month-cost`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Error");
        return res.json() as Promise<TempoWorklogsMonthCostResponse>;
      })
      .then(setTempoData)
      .catch(() => setTempoData(null));
  }, [projectId, from, to, needsTempoData]);

  if (!hasAnyType) return null;

  return (
    <div className="space-y-4">
      {isPrecioCerrado && (
        <ProjectFixedPriceSection
          fixedPrice={config.fixedPrice}
          budgetedHours={config.budgetedHours}
          totalCost={tempoData?.totalCost ?? 0}
          totalHours={tempoData?.totalHours ?? 0}
        />
      )}

      {isBolsasHoras && (
        <ProjectHourBucketsSection
          projectId={projectId}
          from={from}
          to={to}
          hasTempoToken={hasTempoToken}
        />
      )}

      {isFeeRegular && (
        <ProjectRegularFeeSection
          entries={config.regularFeeEntries}
          months={tempoData?.months ?? []}
          totalHours={tempoData?.totalHours ?? 0}
        />
      )}
    </div>
  );
}
