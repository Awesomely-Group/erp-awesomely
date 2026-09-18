import { Megaphone } from "lucide-react";

/**
 * Placeholder a propósito (Fase G, plan Growth/CRM revisión 2026-09-18): la
 * integración real con plataformas de ads vive pausada en otra rama (Cursor). Esta
 * página deliberadamente no llama a ninguna API externa ni modela nada — solo reserva
 * el hueco en el sidebar hasta que se decida retomar esa integración.
 */
export default function CampanasPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Campañas</h1>
        <p className="text-sm text-gray-500">
          Estado de las campañas de ads (Google, Meta…)
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
        <Megaphone className="h-10 w-10 text-gray-300" />
        <p className="mt-4 text-sm font-medium text-gray-600">
          En construcción
        </p>
        <p className="mt-1 max-w-md text-sm text-gray-400">
          La integración con plataformas de ads está pausada. Esta sección se activará
          cuando se retome ese trabajo.
        </p>
      </div>
    </div>
  );
}
