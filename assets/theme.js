// Apply the initial theme before the stylesheet and body are rendered.
(() => {
  const storageKey = 'myowinthein-landing-theme';
  let saved = null;
  try {
    saved = localStorage.getItem(storageKey);
    if (saved === null) {
      const legacy = localStorage.getItem('theme');
      if (legacy === 'light' || legacy === 'dark') {
        saved = legacy;
        localStorage.setItem(storageKey, legacy);
        localStorage.removeItem('theme');
      }
    }
  } catch {
    // A denied migration still keeps an already-read choice for this page.
  }
  const mode = saved === 'light' || saved === 'dark' ? saved : 'system';
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme-mode', mode);
  document.documentElement.setAttribute('data-theme', mode === 'dark' || (mode === 'system' && prefersDark) ? 'dark' : 'light');
})();
