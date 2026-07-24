import { getPptoRealData } from "@/lib/ppto-real-data";
import { PptoRealView } from "./ppto-real-view";

export default async function PptoVsRealPage(): Promise<React.JSX.Element> {
  const data = await getPptoRealData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Presupuesto vs Real 2026</h1>
        <p className="text-sm text-gray-500 mt-1">
          P&amp;L H1 · base imponible neto · real = clasificación ERP · ppto = presupuesto 2026
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <PptoRealView data={data} />
      </div>
    </div>
  );
}
