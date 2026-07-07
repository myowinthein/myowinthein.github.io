// Theme — auto-detect system preference, allow manual override
const root = document.documentElement;
const btn  = document.getElementById('theme-toggle');

function applyTheme(dark) {
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  btn.textContent = dark ? '☀︎' : '☾';
}

const saved = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(saved ? saved === 'dark' : prefersDark);

btn.addEventListener('click', () => {
  const isDark = root.getAttribute('data-theme') === 'dark';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  applyTheme(!isDark);
});

// Projects
const GITHUB_USER = 'myowinthein';
const SELF_REPO   = `${GITHUB_USER}.github.io`;

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeUrl(raw, fallback) {
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : fallback;
  } catch {
    return fallback;
  }
}

const grid = document.getElementById('grid');

fetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`)
  .then(res => res.json())
  .then(repos => {
    const paged = repos.filter(r => r.has_pages && !r.fork && r.name !== SELF_REPO && r.homepage);

    if (paged.length === 0) {
      grid.innerHTML = '<p class="loading">No projects found.</p>';
      return;
    }

    grid.innerHTML = paged.map(r => {
      const url  = safeUrl(r.homepage, `https://${SELF_REPO}/${r.name}`);
      const desc = escapeHtml(r.description || '');
      const name = escapeHtml(r.name);
      return `
        <a class="card" href="${url}" target="_blank">
          <div class="card-name">${name}</div>
          <div class="card-desc">${desc}</div>
          <div class="card-link">View site →</div>
        </a>`;
    }).join('');
  })
  .catch(() => {
    grid.innerHTML = '<p class="loading">Could not load projects.</p>';
  });
