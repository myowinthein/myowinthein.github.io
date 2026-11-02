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
const loadMore = document.getElementById('load-more');
const projectStatus = document.getElementById('project-status');
const PAGE_SIZE = 3;
const pendingProjects = [];
const seenProjects = new Set();
let nextPage = 1;
let hasMore = true;
let loading = false;
let displayedProjects = 0;

async function fetchNextProjects() {
  while (pendingProjects.length < PAGE_SIZE && hasMore) {
    const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/repos?type=owner&per_page=${PAGE_SIZE}&sort=updated&page=${nextPage}`);
    if (!res.ok) throw new Error(res.status);
    const batch = await res.json();
    const projects = batch.filter(r =>
      r.private === false &&
      !r.fork &&
      r.owner?.login?.toLowerCase() === GITHUB_USER &&
      r.name.toLowerCase() !== SELF_REPO
    ).filter(r => {
      const name = r.name.toLowerCase();
      if (seenProjects.has(name)) return false;
      seenProjects.add(name);
      return true;
    });
    pendingProjects.push(...projects);
    nextPage += 1;
    hasMore = batch.length === PAGE_SIZE;
  }

  return pendingProjects.splice(0, PAGE_SIZE);
}

function projectCards(projects) {
  return projects.map(r => {
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
}

async function loadMoreProjects() {
  if (loading || (!hasMore && pendingProjects.length === 0)) return;
  loading = true;
  loadMore.disabled = true;
  loadMore.textContent = 'Loading…';
  grid.setAttribute('aria-busy', 'true');
  projectStatus.textContent = displayedProjects ? 'Loading more projects…' : '';

  try {
    const projects = await fetchNextProjects();
    const cards = projectCards(projects);
    if (displayedProjects === 0) grid.innerHTML = '';
    grid.insertAdjacentHTML('beforeend', cards);
    displayedProjects += projects.length;
    if (displayedProjects === 0) {
      grid.innerHTML = '<p class="loading">No projects found.</p>';
    }
    projectStatus.textContent = displayedProjects && !hasMore && pendingProjects.length === 0
      ? 'All projects loaded.' : '';
    loadMore.textContent = 'Load more';
  } catch {
    if (displayedProjects === 0) grid.innerHTML = '';
    projectStatus.textContent = displayedProjects
      ? 'Could not load more projects. Try again.'
      : 'Could not load projects. Try again.';
    loadMore.textContent = 'Try again';
  } finally {
    loading = false;
    loadMore.disabled = false;
    loadMore.hidden = !hasMore && pendingProjects.length === 0;
    grid.setAttribute('aria-busy', 'false');
  }
}

loadMore.addEventListener('click', loadMoreProjects);
loadMoreProjects();
