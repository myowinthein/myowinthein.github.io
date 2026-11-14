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

// Public GitHub data
const GITHUB_USER = 'myowinthein';
const SELF_REPO   = `${GITHUB_USER}.github.io`;
const USER_API = `https://api.github.com/users/${GITHUB_USER}`;
const GITHUB_PROFILE = `https://github.com/${GITHUB_USER}`;
const CACHE_PREFIX = `github-directory:v1:${GITHUB_USER}:`;
const CACHE_TTL = 5 * 60 * 1000;
const RATE_LIMIT_KEY = `${CACHE_PREFIX}retry-after`;
let rateLimitUntil = 0;
const githubRetries = new Map();
let githubRetryTimer;
let retryingGitHub = false;

function scheduleGitHubRetries() {
  if (githubRetryTimer) clearTimeout(githubRetryTimer);
  if (retryingGitHub) return;
  const blockedUntil = githubRetryAt();
  const deadlines = [...githubRetries.values()].map(job => Math.max(job.retryAt, blockedUntil));
  if (blockedUntil) deadlines.push(blockedUntil);
  if (!deadlines.length) return;
  githubRetryTimer = setTimeout(retryGitHubRequests,
    Math.min(Math.max(0, Math.min(...deadlines) - Date.now()), 2_147_483_647));
}

function queueGitHubRetry(url, validate, onRefresh, error, attempts = 0) {
  // Missing/forbidden resources are not transient failures. Retry temporary
  // failures at most three times, respecting a shared rate-limit deadline.
  if (attempts >= 3 || (error.status >= 400 && error.status < 500 && !(error instanceof GitHubRateLimitError))) return;
  githubRetries.set(url, {
    validate, onRefresh, attempts,
    retryAt: Math.max(error.retryAt || Date.now() + 60_000, attempts ? Date.now() + 60_000 * 2 ** attempts : 0),
  });
  scheduleGitHubRetries();
}

async function retryGitHubRequests() {
  retryingGitHub = true;
  for (const [url, job] of [...githubRetries]) {
    if (job.retryAt > Date.now() || githubRetryAt()) continue;
    githubRetries.delete(url);
    try {
      const cached = readGitHubCache(url, job.validate);
      const result = cached && Date.now() - cached.savedAt < CACHE_TTL
        ? cached : await requestGitHub(url, job.validate);
      await job.onRefresh(result);
    } catch (error) {
      queueGitHubRetry(url, job.validate, job.onRefresh, error, job.attempts + 1);
    }
  }
  retryingGitHub = false;
  updateProjectControls();
  scheduleGitHubRetries();
}

class GitHubRateLimitError extends Error {
  constructor(retryAt) {
    super('GitHub request limit reached');
    this.retryAt = retryAt;
  }
}

function githubRetryAt() {
  try {
    const saved = Number(localStorage.getItem(RATE_LIMIT_KEY));
    if (Number.isFinite(saved) && saved > Date.now() && saved <= Date.now() + 24 * 60 * 60 * 1000) {
      rateLimitUntil = Math.max(rateLimitUntil, saved);
    }
  } catch {
    // The current page still respects the limit when storage is unavailable.
  }
  return rateLimitUntil > Date.now() ? rateLimitUntil : 0;
}

function rememberGitHubLimit(retryAt) {
  rateLimitUntil = Math.max(githubRetryAt(), retryAt);
  try {
    // Store only a retry deadline, never an error response or a fresh cache timestamp.
    localStorage.setItem(RATE_LIMIT_KEY, String(rateLimitUntil));
  } catch {
    // In-memory backoff remains available.
  }
  return rateLimitUntil;
}

function responseRetryAt(response) {
  const get = name => response.headers?.get(name);
  const exhausted = get('X-RateLimit-Remaining') === '0';
  const limited = response.status === 403 || response.status === 429;
  const retryAfter = get('Retry-After');
  const delay = retryAfter && (/^\d+$/.test(retryAfter)
    ? Date.now() + Number(retryAfter) * 1000 : Date.parse(retryAfter));
  const reset = exhausted ? Number(get('X-RateLimit-Reset')) * 1000 : 0;
  if (!exhausted && !(limited && (response.status === 429 || Number.isFinite(delay)))) return 0;
  const deadlines = [delay, reset].filter(value => Number.isFinite(value) && value > Date.now());
  return deadlines.length ? Math.max(...deadlines) + 1000 : Date.now() + 60 * 1000;
}

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

function isReleaseData(data) {
  return isProfileData(data) && typeof data.tag_name === 'string' && Boolean(data.tag_name.trim()) &&
    typeof data.html_url === 'string' && Boolean(safeUrl(data.html_url, '')) &&
    data.draft === false && data.prerelease === false;
}

function isLicenseData(data) {
  return isProfileData(data) && typeof data.html_url === 'string' && Boolean(safeUrl(data.html_url, '')) &&
    isProfileData(data.license) && typeof data.license.spdx_id === 'string' && Boolean(data.license.spdx_id.trim());
}

function readGitHubCache(url, validate) {
  try {
    const entry = JSON.parse(localStorage.getItem(CACHE_PREFIX + url));
    if (entry && Number.isFinite(entry.savedAt) && entry.savedAt >= 0 && entry.savedAt <= Date.now() &&
        typeof entry.link === 'string' && validate(entry.data)) return entry;
  } catch {
    // Corrupt or inaccessible storage must not prevent a live request.
  }
}

async function cachedGitHub(url, validate, onStale = () => {}, onRefresh = onStale) {
  const cached = readGitHubCache(url, validate);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached;
  if (cached) onStale(cached);
  try {
    return await requestGitHub(url, validate);
  } catch (error) {
    queueGitHubRetry(url, validate, onRefresh, error);
    if (cached) return { ...cached, stale: true };
    throw error;
  }
}

async function requestGitHub(url, validate) {
  const blockedUntil = githubRetryAt();
  if (blockedUntil) throw new GitHubRateLimitError(blockedUntil);

  const response = await fetch(url);
  let retryAt = responseRetryAt(response);
  if (!response.ok) {
    if (response.status === 403 && !retryAt) {
      try {
        const error = await response.json();
        if (typeof error?.message === 'string' && /rate limit/i.test(error.message)) {
          retryAt = Date.now() + 60 * 1000;
        }
      } catch {
        // An ordinary HTTP error does not establish a rate limit.
      }
    }
    if (retryAt) throw new GitHubRateLimitError(rememberGitHubLimit(retryAt));
    const error = new Error(response.status);
    error.status = response.status;
    throw error;
  }
  if (retryAt) rememberGitHubLimit(retryAt);
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
const profileAvatar = document.getElementById('profile-avatar');
profileAvatar.addEventListener('error', () => { profileAvatar.hidden = true; });
const favicon = document.getElementById('page-favicon');
const fallbackFaviconUrl = favicon.getAttribute('href');
const FAVICON_SIZE = 64;
let faviconImage;

function updateFavicon(avatarUrl) {
  if (faviconImage?.src === avatarUrl) return;
  favicon.setAttribute('href', fallbackFaviconUrl);
  faviconImage = null;
  if (!avatarUrl) return;

  const image = new Image();
  faviconImage = image;
  image.crossOrigin = 'anonymous';
  image.referrerPolicy = 'no-referrer';
  image.onload = () => {
    if (faviconImage !== image) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = FAVICON_SIZE;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.beginPath();
      context.arc(FAVICON_SIZE / 2, FAVICON_SIZE / 2, FAVICON_SIZE / 2, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
      favicon.setAttribute('href', canvas.toDataURL('image/png'));
    } catch {
      // Keep the direct GitHub icon if the image cannot be processed.
    }
  };
  image.src = avatarUrl;
}

function renderProfileLinks() {
  const links = [{ label: 'GitHub', url: GITHUB_PROFILE }];
  if (profileWebsite) links.unshift({ label: 'Website', url: profileWebsite });
  for (const account of socialAccounts) {
    if (!account || typeof account.url !== 'string') continue;
    const url = safeUrl(account.url, '');
    if (!url) continue;
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const provider = typeof account.provider === 'string' ? account.provider.trim() : '';
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
  }).map(link => `<a class="external-link" href="${escapeHtml(link.url)}"><span class="link-label">${escapeHtml(link.label)}</span></a>`).join('');
}

function renderProfile(profile) {
  let avatarUrl = typeof profile.avatar_url === 'string' ? safeUrl(profile.avatar_url, '') : '';
  if (avatarUrl) {
    const image = new URL(avatarUrl);
    // Request twice the 72px display size; the favicon can use the same image.
    if (image.hostname === 'avatars.githubusercontent.com') image.searchParams.set('s', '144');
    avatarUrl = image.href;
    profileAvatar.setAttribute('src', avatarUrl);
  }
  profileAvatar.hidden = !avatarUrl;
  updateFavicon(avatarUrl);
  const name = typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : GITHUB_USER;
  document.getElementById('profile-name').textContent = name;
  const detailFields = ['bio', 'company', 'location'];
  for (const field of detailFields) {
    const element = document.getElementById(`profile-${field}`);
    const value = typeof profile[field] === 'string' ? profile[field].trim() : '';
    element.textContent = value;
    element.hidden = !value;
  }
  document.getElementById('profile-details').hidden = detailFields.every(
    field => document.getElementById(`profile-${field}`).hidden);
  profileWebsite = typeof profile.blog === 'string' ? safeUrl(profile.blog, '') : '';
  renderProfileLinks();
  document.title = `${name} | Public projects`;
  const description = typeof profile.bio === 'string' && profile.bio.trim()
    ? profile.bio : `Public GitHub projects by ${name}.`;
  document.getElementById('page-description').setAttribute('content', description);
  document.getElementById('page-og-title').setAttribute('content', document.title);
  document.getElementById('page-og-description').setAttribute('content', description);
  document.getElementById('page-twitter-title').setAttribute('content', document.title);
  document.getElementById('page-twitter-description').setAttribute('content', description);
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
      }, loadSocialLinks);
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
let projectsBlocked = false;

function projectPageUrl(page) {
  return `${USER_API}/repos?type=owner&per_page=${PAGE_SIZE}&sort=updated&page=${page}`;
}

function updateProjectControls() {
  const canUseCache = Boolean(readGitHubCache(projectPageUrl(nextPage), isRepositoryPage));
  const unavailable = (projectsBlocked || githubRetryAt()) && !canUseCache;
  loadMore.setAttribute('aria-disabled', String(loading));
  loadMore.hidden = !hasMore || Boolean(unavailable);
}

async function refreshedProjectPage(page, response) {
  if (nextPage === page && !loading) {
    projectsBlocked = false;
    await loadMoreProjects();
  } else {
    // Refresh stored pages without replacing the cards a visitor is browsing.
    const visible = eligibleProjects(response.data).filter(project =>
      displayedProjects.some(shown => shown.name.toLowerCase() === project.name.toLowerCase()));
    await Promise.allSettled(visible.flatMap(project => [loadProjectRelease(project), loadProjectLicense(project)]));
  }
  updateProjectControls();
}

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
  let stale = false;
  do {
    const page = nextPage;
    const res = await cachedGitHub(projectPageUrl(page), isRepositoryPage, onStale,
      response => refreshedProjectPage(page, response));
    stale = Boolean(res.stale);
    projects = newProjects(res.data, seenProjects);
    nextPage += 1;
    hasMore = hasNextPage(res);
    // Skip fully excluded pages, but leave later nonempty pages for Load more.
  } while (projects.length === 0 && hasMore);

  return { projects, stale };
}

function releaseElementId(name) {
  return `project-release-${encodeURIComponent(name)}`;
}

function licenseElementId(name) {
  return `project-license-${encodeURIComponent(name)}`;
}

function renderProjectLink(id, text, url, accessibleLabel) {
  const slot = document.getElementById(id);
  if (!slot) return;
  let link = slot.firstElementChild;
  if (!link) {
    link = document.createElement('a');
    link.setAttribute('class', 'external-link');
    link.setAttribute('rel', 'noopener noreferrer');
    const label = document.createElement('span');
    label.setAttribute('class', 'link-label');
    link.append(label);
    slot.append(link);
  }
  link.setAttribute('href', safeUrl(url, ''));
  link.setAttribute('aria-label', accessibleLabel);
  link.firstElementChild.textContent = text;
  slot.hidden = false;
}

function projectApi(project) {
  return `https://api.github.com/repos/${GITHUB_USER}/${encodeURIComponent(project.name)}`;
}

function renderProjectRelease(project, release) {
  renderProjectLink(releaseElementId(project.name), release.tag_name.trim(),
    release.html_url, `Release ${release.tag_name.trim()} for ${project.name}`);
}

function renderProjectLicense(project, data) {
  const label = data.license.spdx_id.trim() === 'NOASSERTION' ? 'License' : data.license.spdx_id.trim();
  const accessibleLabel = label === 'License' ? `License for ${project.name}` : `${label} license for ${project.name}`;
  renderProjectLink(licenseElementId(project.name), label, data.html_url, accessibleLabel);
}

function renderCachedProjectDetails(projects) {
  for (const project of projects) {
    const release = readGitHubCache(`${projectApi(project)}/releases/latest`, isReleaseData);
    if (release) renderProjectRelease(project, release.data);
    const license = isProfileData(project.license) && readGitHubCache(`${projectApi(project)}/license`, isLicenseData);
    if (license) renderProjectLicense(project, license.data);
  }
}

async function loadProjectDetail(url, validate, render) {
  try {
    const response = await cachedGitHub(url, validate, cached => render(cached.data));
    render(response.data);
  } catch {
    // A missing detail or failed request must not interrupt project browsing.
  }
}

async function loadProjectRelease(project) {
  await loadProjectDetail(`${projectApi(project)}/releases/latest`, isReleaseData,
    release => renderProjectRelease(project, release));
}

async function loadProjectLicense(project) {
  if (!isProfileData(project.license)) return;
  await loadProjectDetail(`${projectApi(project)}/license`, isLicenseData,
    data => renderProjectLicense(project, data));
}

function projectCards(projects) {
  return projects.map(r => {
    const repoUrl = `https://github.com/${GITHUB_USER}/${encodeURIComponent(r.name)}`;
    const url  = safeUrl(r.homepage, repoUrl);
    const desc = escapeHtml(typeof r.description === 'string' ? r.description.trim() : '');
    const name = escapeHtml(r.name);
    const projectLink = url === repoUrl ? '' : `
          <a class="external-link" href="${escapeHtml(url)}" rel="noopener noreferrer" aria-label="Website for ${name}"><span class="link-label">Website</span></a>`;
    return `
      <article class="card">
        <div class="card-heading">
          <h3 class="card-name">${name}</h3>
          <span class="card-release" id="${releaseElementId(r.name)}" hidden></span>
          ${r.archived === true ? '<span class="card-status">Archived</span>' : ''}
        </div>
        ${desc ? `<p class="card-desc">${desc}</p>` : ''}
        <div class="card-links">${projectLink}
          <a class="external-link" href="${escapeHtml(repoUrl)}" rel="noopener noreferrer" aria-label="Source for ${name}"><span class="link-label">Source</span></a>
          <span class="card-license" id="${licenseElementId(r.name)}" hidden></span>
        </div>
      </article>`;
  }).join('');
}

function showProjectBatch(projects) {
  // Remove only unconfirmed previews; keep loaded cards and their focus intact.
  if (displayedProjects.length === 0) {
    grid.innerHTML = '';
  } else {
    while (grid.children.length > displayedProjects.length) grid.lastElementChild.remove();
  }
  if (projects.length) grid.insertAdjacentHTML('beforeend', projectCards(projects));
}

function focusAfterLoad(firstNewCard) {
  let target = firstNewCard?.querySelector('.card-name');
  if (!target && loadMore.hidden) {
    // Load more is gone, so keep focus on the final count or the last card.
    target = !hasMore ? projectStatus
      : grid.children[displayedProjects.length - 1]?.querySelector('.card-name') || grid;
  }
  if (!target) return;
  target.setAttribute('tabindex', '-1');
  target.focus();
}

async function loadMoreProjects() {
  if (loading || !hasMore || (loadMore.hidden && projectsBlocked)) return;
  loading = true;
  loadMore.setAttribute('aria-disabled', 'true');
  loadMore.setAttribute('aria-busy', 'true');
  loadMore.setAttribute('aria-label', 'Loading more projects');
  grid.setAttribute('aria-busy', 'true');
  if (displayedProjects.length === 0) grid.innerHTML = '<p class="loading">Loading projects…</p>';
  let previewProjects = [];
  let detailRequests = [];
  let firstNewCard;

  try {
    const { projects, stale } = await fetchNextProjects(cached => {
      previewProjects = newProjects(cached.data, new Set(seenProjects));
      if (previewProjects.length) {
        showProjectBatch(previewProjects);
        renderCachedProjectDetails(previewProjects);
      }
    });
    showProjectBatch(projects);
    if (projects.length) firstNewCard = grid.children[displayedProjects.length];
    displayedProjects.push(...projects);
    projectsBlocked = false;
    // A cached snapshot can be browsed without spending requests on its details.
    if (stale) renderCachedProjectDetails(projects);
    else detailRequests = projects.flatMap(project => [loadProjectRelease(project), loadProjectLicense(project)]);
    const count = displayedProjects.length;
    if (count === 0) {
      grid.innerHTML = '<p class="loading">No projects found.</p>';
    }
    projectStatus.textContent = count && !hasMore
      ? `All ${count} ${count === 1 ? 'project' : 'projects'} loaded.`
      : '';
    loadMore.textContent = 'Load more';
  } catch {
    if (displayedProjects.length) showProjectBatch([]);
    else grid.innerHTML = fallbackProjects;
    projectStatus.textContent = '';
    projectsBlocked = true;
  } finally {
    loading = false;
    const hadButtonFocus = document.activeElement === loadMore;
    loadMore.textContent = 'Load more';
    loadMore.setAttribute('aria-disabled', 'false');
    loadMore.setAttribute('aria-busy', 'false');
    loadMore.setAttribute('aria-label', loadMore.textContent);
    grid.setAttribute('aria-busy', 'false');
    updateProjectControls();
    // Continue into new content without stealing focus if the user moved away.
    if (hadButtonFocus) focusAfterLoad(firstNewCard);
    scheduleGitHubRetries();
  }
  await Promise.allSettled(detailRequests);
}

loadMore.addEventListener('click', loadMoreProjects);
Promise.allSettled([loadProfile(), loadSocialLinks(), loadMoreProjects()]);
