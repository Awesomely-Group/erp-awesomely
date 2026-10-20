/**
 * Semáforo de metas (Growth). Verde/Ámbar/Rojo sobre el % de cumplimiento, como la
 * rutina mensual comercial de /crm — pero con dirección: hasta las campañas de pago
 * (2026-10-16) todas las métricas eran "más es mejor" (leads, win rate, pipeline). CPC y
 * CPL son "menos es mejor": gastar 35 € por lead con una meta de 40 € es verde, no rojo.
 *
 * Umbrales simétricos en el ratio meta/valor: 100 % verde, 70-99 % ámbar, < 70 % rojo.
 * Para "lower" el ratio es meta/valor, así un CPL de 57 € con meta 40 € (70 %) sigue en
 * ámbar y uno de 60 € ya cae a rojo.
 */
export type SemaforoDirection = "higher" | "lower";
export type SemaforoLevel = "green" | "amber" | "red";

export function semaforoLevel(value: number, target: number, direction: SemaforoDirection): SemaforoLevel | null {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0 || value < 0) return null;
  let pct: number;
  if (direction === "higher") {
    pct = (value / target) * 100;
  } else {
    // value 0 con dirección "lower" es el mejor caso posible (coste cero).
    pct = value === 0 ? Infinity : (target / value) * 100;
  }
  if (pct >= 100) return "green";
  if (pct >= 70) return "amber";
  return "red";
}

export const SEMAFORO_CLASSES: Record<SemaforoLevel, string> = {
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
};
