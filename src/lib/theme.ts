// Preferencia de tema guardada en localStorage: "light" | "dark". Si no hay nada
// guardado se sigue el modo del sistema operativo.
export const THEME_STORAGE_KEY = "theme";

// Se ejecuta en <head> antes de pintar para que la página no parpadee en claro al
// cargar en modo oscuro. Va como texto porque se inyecta en un <script> inline.
export const THEME_INIT_SCRIPT = `(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();`;
