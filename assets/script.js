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

// Public GitHub data
const GITHUB_USER = 'myowinthein';
const SELF_REPO   = `${GITHUB_USER}.github.io`;
const USER_API = `https://api.github.com/users/${GITHUB_USER}`;
const GITHUB_PROFILE = `https://github.com/${GITHUB_USER}`;

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

function hasNextPage(response) {
  return /;\s*rel="next"/.test(response.headers.get('Link') || '');
}

let profileWebsite = '';
let socialAccounts = [];

function renderProfileLinks() {
  const links = [{ label: 'GitHub', url: GITHUB_PROFILE }];
  if (profileWebsite) links.unshift({ label: 'Website', url: profileWebsite });
  for (const account of socialAccounts) {
    if (!account || typeof account.url !== 'string') continue;
    const url = safeUrl(account.url, '');
    if (!url) continue;
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const provider = typeof account.provider === 'string' ? account.provider : '';
    const label = provider === 'linkedin' ? 'LinkedIn'
      : hostname === 'medium.com' || hostname.endsWith('.medium.com') ? 'Medium'
      : provider && provider !== 'generic' ? provider : hostname;
    links.push({ label, url });
  }
  const seen = new Set();
  document.getElementById('profile-links').innerHTML = links.filter(link => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  }).map(link => `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`).join('');
}

async function loadProfile() {
  try {
    const response = await fetch(USER_API);
    if (!response.ok) throw new Error(response.status);
    const profile = await response.json();
    if (!profile || Array.isArray(profile) || typeof profile !== 'object') throw new Error('Invalid profile');
    const name = typeof profile.name === 'string' && profile.name.trim() ? profile.name : GITHUB_USER;
    document.getElementById('profile-name').textContent = name;
    for (const field of ['bio', 'location']) {
      const element = document.getElementById(`profile-${field}`);
      const value = typeof profile[field] === 'string' ? profile[field].trim() : '';
      element.textContent = value;
      element.hidden = !value;
    }
    profileWebsite = typeof profile.blog === 'string' ? safeUrl(profile.blog, '') : '';
    renderProfileLinks();
    document.title = `${name} | Public projects`;
    const description = typeof profile.bio === 'string' && profile.bio.trim()
      ? profile.bio : `Public GitHub projects by ${name}.`;
    document.getElementById('page-description').setAttribute('content', description);
    document.getElementById('page-og-title').setAttribute('content', document.title);
    document.getElementById('page-og-description').setAttribute('content', description);
  } catch {
    // Keep the static identity and GitHub link when profile data is unavailable.
  }
}

async function loadSocialLinks() {
  try {
    const accounts = [];
    let page = 1;
    let more;
    do {
      const response = await fetch(`${USER_API}/social_accounts?per_page=100&page=${page}`);
      if (!response.ok) throw new Error(response.status);
      const batch = await response.json();
      if (!Array.isArray(batch)) throw new Error('Invalid social accounts');
      accounts.push(...batch);
      more = hasNextPage(response);
      page += 1;
    } while (more);
    socialAccounts = accounts;
    renderProfileLinks();
  } catch {
    // Profile and project requests remain independent of optional social links.
  }
}

// Projects
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
    const res = await fetch(`${USER_API}/repos?type=owner&per_page=${PAGE_SIZE}&sort=updated&page=${nextPage}`);
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
    hasMore = hasNextPage(res);
    // Skip fully excluded pages, but leave later nonempty pages for Load more.
  } while (projects.length === 0 && hasMore);

  return projects;
}

function projectCards(projects) {
  return projects.map(r => {
    const repoUrl = `https://github.com/${GITHUB_USER}/${encodeURIComponent(r.name)}`;
    const url  = safeUrl(r.homepage, repoUrl);
    const desc = escapeHtml(r.description || '');
    const name = escapeHtml(r.name);
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
      ? hasMore
        ? `Showing ${displayedProjects} ${displayedProjects === 1 ? 'project' : 'projects'}.`
        : `All ${displayedProjects} ${displayedProjects === 1 ? 'project' : 'projects'} loaded.`
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
Promise.allSettled([loadProfile(), loadSocialLinks(), loadMoreProjects()]);
