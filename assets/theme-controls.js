// The head script selects the initial theme; this script wires up the toggle.
const root = document.documentElement;
const btn  = document.getElementById('theme-toggle');
const THEME_STORAGE_KEY = 'myowinthein-landing-theme';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let themeMode = root.getAttribute('data-theme-mode');

function applyTheme(dark) {
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

function applyThemeMode(mode) {
  themeMode = mode === 'light' || mode === 'dark' ? mode : 'system';
  root.setAttribute('data-theme-mode', themeMode);
  applyTheme(themeMode === 'dark' || (themeMode === 'system' && systemTheme.matches));
}

applyThemeMode(themeMode);

systemTheme.addEventListener('change', () => {
  if (themeMode === 'system') applyThemeMode(themeMode);
});

window.addEventListener('storage', event => {
  if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
  applyThemeMode(event.newValue);
});

btn.addEventListener('click', () => {
  const isDark = root.getAttribute('data-theme') === 'dark';
  applyThemeMode(isDark ? 'light' : 'dark');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  } catch {
    // Keep the visible choice even when it cannot be saved.
  }
});
