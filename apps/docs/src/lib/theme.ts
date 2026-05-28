// Theme persistence — `data-theme="dark|light"` on <html> driven by CSS
// custom properties in global.css. Read at first paint via the inline
// script in `BaseHead.astro`; toggled at runtime by the Nav component.

export const THEME_KEY = 'storagesdk-theme';

export type Theme = 'light' | 'dark';

/**
 * Inline `<script>` body to drop into `<head>` before any visible
 * content. Reads the persisted theme synchronously on first paint and
 * re-applies it on every Astro view-transition swap (the incoming
 * document comes back with the source default each time).
 */
export const inlineThemeScript = `
(function () {
  var KEY = ${JSON.stringify(THEME_KEY)};
  function apply(doc) {
    try {
      var stored = localStorage.getItem(KEY);
      if (stored === "light" || stored === "dark") {
        doc.documentElement.setAttribute("data-theme", stored);
      }
    } catch (e) {}
  }
  apply(document);
  document.addEventListener("astro:before-swap", function (e) {
    apply(e.newDocument);
  });
})();
`.trim();

export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

export function writeTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage blocked */
  }
}
