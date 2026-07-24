import { getTesoreriaData } from "@/lib/tesoreria-data";
import { TesoreriaView } from "./tesoreria-view";

export default async function TesoreriaPage(): Promise<React.JSX.Element> {
  const data = await getTesoreriaData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tesorería 2026</h1>
        <p className="text-sm text-gray-500 mt-1">
          Caja con IVA · entidad legal SL / OÜ · ene–jun REAL · jul–dic PREVISIÓN
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <TesoreriaView data={data} />
      </div>
    </div>
  );
}
