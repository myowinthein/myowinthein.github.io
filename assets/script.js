// Theme — auto-detect system preference, allow manual override
const root = document.documentElement;
const btn  = document.getElementById('theme-toggle');

function applyTheme(dark) {
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  btn.textContent = dark ? '☀︎' : '☾';
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

let saved = null;
try {
  saved = localStorage.getItem('theme');
} catch {
  // Theme persistence is optional when browser storage is unavailable.
}
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(saved === 'dark' || (saved !== 'light' && prefersDark));

btn.addEventListener('click', () => {
  const isDark = root.getAttribute('data-theme') === 'dark';
  applyTheme(!isDark);
  try {
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
  } catch {
    // Keep the visible choice even when it cannot be saved.
  }
});

// Projects
const GITHUB_USER = 'myowinthein';
const SELF_REPO   = `${GITHUB_USER}.github.io`;
const PROJECT_DETAILS = {
  'job-buddy': { name: 'Job Buddy', description: 'Fill supported job application forms from one saved profile.' },
  'agent-helm': { name: 'Agent Helm', description: 'Reusable development workflows for Claude and Codex.' },
  'agent-compass': { name: 'Agent Compass', description: 'Career research tools for tech job seekers.' },
  'my-portfolio': { name: 'myowin.dev', description: 'My background, experience, and contact details.' },
  '24edu-demo': { name: '24edu Demo', description: 'An admissions chatbot with live human takeover.' },
};

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
const fallbackProjects = grid.innerHTML;
const PAGE_SIZE = 6;
const seenProjects = new Set();
let nextPage = 1;
let hasMore = true;
let loading = false;
let displayedProjects = 0;

async function fetchNextProjects() {
  let projects = [];
  do {
    const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/repos?type=owner&per_page=${PAGE_SIZE}&sort=updated&page=${nextPage}`);
    if (!res.ok) throw new Error(res.status);
    const batch = await res.json();
    projects = batch.filter(r =>
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
    nextPage += 1;
    hasMore = /;\s*rel="next"/.test(res.headers.get('Link') || '');
    // Skip fully excluded pages, but leave later nonempty pages for Load more.
  } while (projects.length === 0 && hasMore);

  return projects;
}

function projectCards(projects) {
  return projects.map(r => {
    const details = Object.hasOwn(PROJECT_DETAILS, r.name.toLowerCase())
      ? PROJECT_DETAILS[r.name.toLowerCase()] : r;
    const repoUrl = `https://github.com/${GITHUB_USER}/${encodeURIComponent(r.name)}`;
    const url  = safeUrl(r.homepage, repoUrl);
    const desc = escapeHtml(details.description || '');
    const name = escapeHtml(details.name);
    const projectLink = url === repoUrl ? '' : `
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Project page for ${name}">Project page →</a>`;
    return `
      <article class="card">
        <h3 class="card-name">${name}</h3>
        <p class="card-desc">${desc}</p>
        <div class="card-links">${projectLink}
          <a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Source for ${name}">Source →</a>
        </div>
      </article>`;
  }).join('');
}

async function loadMoreProjects() {
  if (loading || !hasMore) return;
  loading = true;
  loadMore.disabled = true;
  loadMore.textContent = 'Loading…';
  grid.setAttribute('aria-busy', 'true');
  if (displayedProjects === 0) grid.innerHTML = '<p class="loading">Loading projects…</p>';
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
    projectStatus.textContent = displayedProjects
      ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} loaded. ${displayedProjects} shown.${hasMore ? '' : ' All projects loaded.'}`
      : '';
    loadMore.textContent = 'Load more';
  } catch {
    if (displayedProjects === 0) grid.innerHTML = fallbackProjects;
    projectStatus.textContent = displayedProjects
      ? 'Could not load more projects. Try again.'
      : 'Could not load projects. Try again.';
    loadMore.textContent = 'Try again';
  } finally {
    loading = false;
    loadMore.disabled = false;
    loadMore.hidden = !hasMore;
    grid.setAttribute('aria-busy', 'false');
  }
}

loadMore.addEventListener('click', loadMoreProjects);
loadMoreProjects();
