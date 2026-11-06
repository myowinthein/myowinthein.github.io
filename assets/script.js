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
const CACHE_PREFIX = `github-directory:v1:${GITHUB_USER}:`;
const CACHE_TTL = 5 * 60 * 1000;

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
  return /;\s*rel="next"/.test(response.link);
}

function isProfileData(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data);
}

function isRepositoryPage(data) {
  return Array.isArray(data) && data.every(repo => repo &&
    typeof repo.name === 'string' && typeof repo.private === 'boolean' &&
    typeof repo.fork === 'boolean' && typeof repo.owner?.login === 'string' &&
    (repo.description == null || typeof repo.description === 'string'));
}

async function cachedGitHub(url, validate, onStale = () => {}) {
  let cached;
  try {
    const entry = JSON.parse(localStorage.getItem(CACHE_PREFIX + url));
    if (entry && Number.isFinite(entry.savedAt) && entry.savedAt >= 0 && entry.savedAt <= Date.now() &&
        typeof entry.link === 'string' && validate(entry.data)) cached = entry;
  } catch {
    // Corrupt or inaccessible storage must not prevent a live request.
  }
  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached;
  if (cached) onStale(cached);

  const response = await fetch(url);
  if (!response.ok) throw new Error(response.status);
  const data = await response.json();
  if (!validate(data)) throw new Error('Invalid GitHub response');
  const entry = { data, link: response.headers.get('Link') || '', savedAt: Date.now() };
  try {
    localStorage.setItem(CACHE_PREFIX + url, JSON.stringify(entry));
  } catch {
    // Fresh data remains usable when storage is blocked or full.
  }
  return entry;
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
  }).map(link => `<a class="external-link" href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`).join('');
}

function renderProfile(profile) {
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
}

async function loadProfile() {
  try {
    const response = await cachedGitHub(USER_API, isProfileData, cached => renderProfile(cached.data));
    renderProfile(response.data);
  } catch {
    // Keep cached or static profile content when a refresh fails.
  }
}

async function loadSocialLinks() {
  try {
    const accounts = [];
    let page = 1;
    let more;
    do {
      const response = await cachedGitHub(`${USER_API}/social_accounts?per_page=100&page=${page}`, Array.isArray, cached => {
        socialAccounts = [...accounts, ...cached.data];
        renderProfileLinks();
      });
      accounts.push(...response.data);
      socialAccounts = [...accounts];
      renderProfileLinks();
      more = hasNextPage(response);
      page += 1;
    } while (more);
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
const displayedProjects = [];

function eligibleProjects(repos) {
  return repos.filter(r =>
    r.private === false && !r.fork &&
    r.owner.login.toLowerCase() === GITHUB_USER && r.name.toLowerCase() !== SELF_REPO);
}

function newProjects(repos, seen) {
  return eligibleProjects(repos).filter(r => {
    const name = r.name.toLowerCase();
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

async function fetchNextProjects(onStale) {
  let projects = [];
  do {
    const res = await cachedGitHub(`${USER_API}/repos?type=owner&per_page=${PAGE_SIZE}&sort=updated&page=${nextPage}`, isRepositoryPage, onStale);
    projects = newProjects(res.data, seenProjects);
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
          <a class="external-link" href="${escapeHtml(url)}" rel="noopener noreferrer" aria-label="Project page for ${name}">Project page</a>`;
    return `
      <article class="card">
        <h3 class="card-name">${name}</h3>
        <p class="card-desc">${desc}</p>
        <div class="card-links">${projectLink}
          <a class="external-link" href="${escapeHtml(repoUrl)}" rel="noopener noreferrer" aria-label="Source for ${name}">Source</a>
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
  if (displayedProjects.length === 0) grid.innerHTML = '<p class="loading">Loading projects…</p>';
  projectStatus.textContent = displayedProjects.length ? 'Loading more projects…' : '';
  let previewProjects = [];

  try {
    const projects = await fetchNextProjects(cached => {
      previewProjects = newProjects(cached.data, new Set(seenProjects));
      if (previewProjects.length) {
        grid.innerHTML = projectCards([...displayedProjects, ...previewProjects]);
        projectStatus.textContent = 'Showing cached projects…';
      }
    });
    displayedProjects.push(...projects);
    grid.innerHTML = projectCards(displayedProjects);
    const count = displayedProjects.length;
    if (count === 0) {
      grid.innerHTML = '<p class="loading">No projects found.</p>';
    }
    projectStatus.textContent = count
      ? hasMore
        ? `Showing ${count} ${count === 1 ? 'project' : 'projects'}.`
        : `All ${count} ${count === 1 ? 'project' : 'projects'} loaded.`
      : '';
    loadMore.textContent = 'Load more';
  } catch {
    if (previewProjects.length) {
      projectStatus.textContent = 'Showing cached projects. Could not refresh. Try again.';
    } else {
      grid.innerHTML = displayedProjects.length ? projectCards(displayedProjects) : fallbackProjects;
      projectStatus.textContent = displayedProjects.length
        ? 'Could not load more projects. Try again.'
        : 'Could not load projects. Try again.';
    }
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
