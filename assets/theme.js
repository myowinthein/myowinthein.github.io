// Apply the initial theme before the stylesheet and body are rendered.
(() => {
  let saved = null;
  try {
    saved = localStorage.getItem('theme');
  } catch {
    // A denied preference falls back to the system theme.
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = saved === 'dark' || (saved !== 'light' && prefersDark);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
