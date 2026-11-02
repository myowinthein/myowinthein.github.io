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

async function fetchRepos() {
  const repos = [];
  let page = 1;
  let batch;

  do {
    const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/repos?type=owner&per_page=100&sort=updated&page=${page}`);
    if (!res.ok) throw new Error(res.status);
    batch = await res.json();
    repos.push(...batch);
    page += 1;
  } while (batch.length === 100);

  return repos;
}

fetchRepos()
  .then(repos => {
    const projects = repos.filter(r =>
      r.private === false &&
      !r.fork &&
      r.owner?.login?.toLowerCase() === GITHUB_USER &&
      r.name.toLowerCase() !== SELF_REPO
    );

    if (projects.length === 0) {
      grid.innerHTML = '<p class="loading">No projects found.</p>';
      return;
    }

    grid.innerHTML = projects.map(r => {
      const repoUrl = `https://github.com/${GITHUB_USER}/${encodeURIComponent(r.name)}`;
      const url  = safeUrl(r.homepage, repoUrl);
      const desc = escapeHtml(r.description || '');
      const name = escapeHtml(r.name);
      return `
        <a class="card" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
          <div class="card-name">${name}</div>
          <div class="card-desc">${desc}</div>
          <div class="card-link">${url === repoUrl ? 'View repository' : 'View site'} →</div>
        </a>`;
    }).join('');
  })
  .catch(() => {
    grid.innerHTML = '<p class="loading">Could not load projects.</p>';
  });
