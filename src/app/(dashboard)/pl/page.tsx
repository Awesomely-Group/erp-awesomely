import { Suspense } from "react";
import { getPlData, getPlYears } from "@/lib/pl-data";
import type { PlParams } from "@/lib/pl-data";
import { PlClient } from "./pl-client";

export default async function PlPage({
  searchParams,
}: {
  searchParams: Promise<PlParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const [plData, years] = await Promise.all([getPlData(params), getPlYears()]);

  const displayYears = years.length > 0 ? years : [new Date().getFullYear()];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">P&L</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cuenta de resultados · {plData.year} · en EUR (base imponible)
        </p>
      </div>

      <Suspense>
        <PlClient plData={plData} years={displayYears} />
      </Suspense>
    </div>
  );
}
