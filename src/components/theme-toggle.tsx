"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

// El tema vive en la clase `dark` de <html> (la pone el script de layout.tsx antes de
// pintar). Este componente solo la lee y la cambia; no guarda estado propio.
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle(): React.JSX.Element {
  // En el servidor no sabemos el tema; se pinta como claro y se corrige al hidratar.
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle(): void {
    const next = dark ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Sin localStorage (modo privado estricto) el cambio dura hasta recargar.
    }
  }

  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
    >
      <Icon className="h-5 w-5 shrink-0" />
      {dark ? "Modo claro" : "Modo oscuro"}
    </button>
  );
}
