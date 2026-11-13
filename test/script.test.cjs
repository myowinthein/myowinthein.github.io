const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Loads the real theme and application scripts in a sandboxed context, stubbing the DOM
// APIs its top-level theme/fetch code touches on load. Top-level function
// declarations (escapeHtml, safeUrl, applyTheme) become properties of the
// sandbox, so we can test the actual shipped code with no source changes
// and no npm/jsdom dependency.
const THEME_STORAGE_KEY = 'myowinthein-landing-theme';
const ELEMENT_IDS = [
  'grid', 'theme-toggle', 'load-more', 'project-status', 'profile-name', 'profile-bio',
  'profile-location', 'profile-company', 'profile-details', 'profile-links', 'profile-avatar', 'page-description', 'page-og-title', 'page-og-description',
  'page-twitter-title', 'page-twitter-description', 'page-favicon',
];

function element(tagName, focusState) {
  const attributes = new Map();
  const handlers = new Map();
  let html = '';
  let text = '';
  const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const children = [];
  function appendCards(markup) {
    for (const match of markup.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)) {
      const heading = element('h3', focusState);
      const child = {
        querySelector(selector) { return selector === '.card-name' ? heading : null; },
        remove() {
          html = html.replace(match[0], '');
          children.splice(children.indexOf(child), 1);
        },
      };
      children.push(child);
    }
  }
  return {
    get innerHTML() { return html || children.map(child => child.outerHTML).join('') || (tagName ? escape(text) : ''); },
    set innerHTML(value) {
      html = value;
      children.length = 0;
      appendCards(value);
    },
    children,
    get firstElementChild() { return children[0] ?? null; },
    get lastElementChild() { return children.at(-1); },
    get outerHTML() {
      const attrs = [...attributes].map(([name, value]) => ` ${name}="${escape(value)}"`).join('');
      return `<${tagName}${attrs}>${this.innerHTML}</${tagName}>`;
    },
    append(child) { children.push(child); },
    insertAdjacentHTML(position, markup) {
      assert.equal(position, 'beforeend');
      html += markup;
      appendCards(markup);
    },
    get textContent() { return text; },
    set textContent(value) { text = value; html = ''; children.length = 0; },
    hidden: false, disabled: false,
    focus() { if (focusState) focusState.activeElement = this; },
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    addEventListener(type, handler) { handlers.set(type, handler); },
    dispatchEvent(event) { return handlers.get(event.type)?.(event); },
    click() { if (!this.disabled) return handlers.get('click')?.(); },
  };
}

function loadScript(
  fetchImpl = () => Promise.resolve({ ok: false, status: 404 }),
  {
    savedTheme = null, prefersDark = false, storage = new Map(), storageApi,
    now = Date.now(),
    profileFetch = async () => ({ ok: false, status: 404 }),
    socialFetch = async () => ({ ok: false, status: 404 }),
    releaseFetch = async () => ({ ok: false, status: 404 }),
    licenseFetch = async () => ({ ok: false, status: 404 }),
  } = {},
) {
  const code = fs.readFileSync(path.join(__dirname, '../assets/script.js'), 'utf8');
  const attributes = new Map();
  const focusState = { activeElement: null };
  const timers = new Map();
  const images = [];
  let nextTimer = 1;
  let elapsed = 0;
  const mediaHandlers = new Map();
  const windowHandlers = new Map();
  const media = {
    matches: prefersDark,
    addEventListener(type, handler) { mediaHandlers.set(type, handler); },
    change(dark) { this.matches = dark; mediaHandlers.get('change')?.(); },
  };
  if (savedTheme !== null) storage.set(THEME_STORAGE_KEY, savedTheme);
  const elements = Object.fromEntries(ELEMENT_IDS.map(id => [id, element(undefined, focusState)]));
  elements['profile-name'].textContent = 'myowinthein';
  elements['profile-bio'].hidden = true;
  elements['profile-location'].hidden = true;
  elements['profile-company'].hidden = true;
  elements['profile-details'].hidden = true;
  elements['profile-avatar'].hidden = true;
  elements['page-favicon'].setAttribute('href', 'https://github.com/myowinthein.png?size=64');
  elements['profile-links'].innerHTML = '<a class="external-link" href="https://github.com/myowinthein"><span class="link-label">GitHub</span></a>';
  elements.grid.innerHTML = '<p><a class="external-link" href="https://github.com/myowinthein?tab=repositories"><span class="link-label">Browse public repositories</span></a></p>';
  const sandbox = {
    document: {
      get activeElement() { return focusState.activeElement; },
      title: 'myowinthein | Public projects',
      documentElement: {
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name) ?? null; },
      },
      getElementById(id) {
        if (id.startsWith('project-release-') || id.startsWith('project-license-')) {
          if (!elements.grid.innerHTML.includes(`id="${id}"`)) return null;
          if (!elements[id]) {
            elements[id] = element();
            elements[id].hidden = true;
          }
        }
        return elements[id];
      },
      createElement: tag => tag === 'canvas' ? {
        getContext() {
          if (sandbox.canvasMode === 'no-context') return null;
          return {
            beginPath() { sandbox.canvasCalls.push('beginPath'); },
            arc(...args) { sandbox.canvasCalls.push(['arc', ...args]); },
            clip() { sandbox.canvasCalls.push('clip'); },
            drawImage() { sandbox.canvasCalls.push('drawImage'); },
          };
        },
        toDataURL(type) {
          if (sandbox.canvasMode === 'tainted') throw new Error('Tainted canvas');
          return `data:${type};circle-${sandbox.canvasCalls.length}`;
        },
      } : element(tag, focusState),
    },
    canvasCalls: [],
    canvasMode: 'ok',
    images,
    window: {
      matchMedia() { return media; },
      addEventListener(type, handler) { windowHandlers.set(type, handler); },
      dispatchEvent(event) { windowHandlers.get(event.type)?.(event); },
    },
    media,
    localStorage: storageApi || {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); },
    },
    fetch(url) {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/social_accounts')) return socialFetch(url);
      if (pathname.endsWith('/repos')) return fetchImpl(url);
      if (pathname.endsWith('/releases/latest')) return releaseFetch(url);
      if (pathname.endsWith('/license')) return licenseFetch(url);
      return profileFetch(url);
    },
    URL,
    Image: class { constructor() { images.push(this); } },
    Date: class extends Date { static now() { return (typeof now === 'function' ? now() : now) + elapsed; } },
    timers,
    async runNextRetry() {
      const next = [...timers].sort((a, b) => a[1].delay - b[1].delay)[0];
      assert.ok(next, 'Expected a scheduled background retry');
      timers.delete(next[0]);
      elapsed += next[1].delay;
      await next[1].callback();
    },
    setTimeout(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/theme.js'), 'utf8'), sandbox);
  sandbox.ready = vm.runInContext(code, sandbox);
  return sandbox;
}

for (const scenario of [
  { name: 'uses the system light theme without a saved choice', prefersDark: false, expected: 'light' },
  { name: 'uses the system dark theme without a saved choice', prefersDark: true, expected: 'dark' },
  { name: 'keeps a saved light theme over a dark system preference', savedTheme: 'light', prefersDark: true, expected: 'light' },
  { name: 'keeps a saved dark theme over a light system preference', savedTheme: 'dark', prefersDark: false, expected: 'dark' },
]) {
  test(scenario.name, async () => {
    const sandbox = loadScript(undefined, scenario);
    await sandbox.ready;
    assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), scenario.expected);
  });
}

for (const scenario of [
  { name: 'system light', saved: null, dark: false, expected: 'light' },
  { name: 'system dark', saved: null, dark: true, expected: 'dark' },
  { name: 'saved light over system dark', saved: 'light', dark: true, expected: 'light' },
  { name: 'saved dark over system light', saved: 'dark', dark: false, expected: 'dark' },
  { name: 'invalid saved choice', saved: 'invalid', dark: true, expected: 'dark' },
  { name: 'blocked storage with system dark', denied: true, dark: true, expected: 'dark' },
  { name: 'blocked storage with system light', denied: true, dark: false, expected: 'light' },
]) {
  test(`selects ${scenario.name} before the body or application exists`, () => {
    let theme;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/theme.js'), 'utf8'), {
      // No body, buttons, fetch, or timers exist during this early execution.
      document: { documentElement: { setAttribute(name, value) { if (name === 'data-theme') theme = value; } } },
      window: { matchMedia() { return { matches: scenario.dark }; } },
      localStorage: {
        getItem() { if (scenario.denied) throw new Error('Denied'); return scenario.saved; },
        setItem() { assert.fail('Initialization must not persist a manual preference'); },
      },
    });
    assert.equal(theme, scenario.expected);
  });
}

const CACHE_TEST_TIME = 1_000_000;

async function seedCache(storage) {
  const sandbox = loadScript(paginatedFetch([repo('cached-project')]), {
    storage, now: CACHE_TEST_TIME,
    profileFetch: async () => response({ name: 'Cached Name', bio: 'Cached bio.', blog: 'https://cached.example/' }),
    socialFetch: async () => response([{ provider: 'generic', url: 'https://cached.medium.com/' }]),
  });
  await sandbox.ready;
  return sandbox;
}

test('reuses fresh profile, social, and repository caches without API requests', async () => {
  const storage = new Map();
  await seedCache(storage);
  let requests = 0;
  const unexpected = async () => { requests += 1; throw new Error('Unexpected API request'); };
  const sandbox = loadScript(unexpected, {
    storage, now: CACHE_TEST_TIME + 5 * 60 * 1000 - 1,
    profileFetch: unexpected, socialFetch: unexpected,
  });
  await sandbox.ready;
  assert.equal(requests, 0);
  assert.equal(sandbox.document.getElementById('profile-name').textContent, 'Cached Name');
  assert.match(sandbox.document.getElementById('profile-links').innerHTML, /Medium/);
  assert.match(sandbox.document.getElementById('grid').innerHTML, /cached-project/);
});

test('caches all displayed fields together and refreshes them through the existing five-minute cache', async () => {
  const storage = new Map();
  const requests = [];
  const visit = (now, updated = false) => {
    const record = data => async url => { requests.push(url); return response(data); };
    return loadScript(record([repo('sample', {
      description: updated ? 'Updated description' : 'Cached description',
      homepage: updated ? 'https://updated.example/' : 'https://cached.example/',
      archived: !updated, license: { spdx_id: updated ? 'Apache-2.0' : 'MIT' },
    })]), {
      storage, now,
      profileFetch: record({
        name: 'Current name', bio: 'Current bio', location: 'Current location',
        company: updated ? 'Updated company' : 'Cached company',
        avatar_url: `https://avatars.githubusercontent.com/u/${updated ? '5678' : '1234'}`,
        blog: 'https://profile.example/',
      }),
      socialFetch: record([{ provider: 'linkedin', url: 'https://linkedin.com/in/sample/' }]),
      releaseFetch: record(release({ tag_name: updated ? 'v2.0.0' : 'v1.2.3' })),
      licenseFetch: record(license({ license: { spdx_id: updated ? 'Apache-2.0' : 'MIT' } })),
    });
  };
  await visit(CACHE_TEST_TIME).ready;
  assert.equal(requests.length, 5);
  assert.equal(new Set(requests).size, 5);
  assert.equal(storage.size, 5);
  for (const [key, raw] of storage) {
    assert.ok(key.startsWith('github-directory:v1:myowinthein:https://api.github.com/'));
    assert.equal(JSON.parse(raw).savedAt, CACHE_TEST_TIME);
  }
  let replayRequests = 0;
  const unexpected = async () => { replayRequests += 1; throw new Error('Fresh cached fields must not request the API'); };
  const cached = loadScript(unexpected, {
    storage, now: CACHE_TEST_TIME + 299_999,
    profileFetch: unexpected, socialFetch: unexpected, releaseFetch: unexpected, licenseFetch: unexpected,
  });
  await cached.ready;
  assert.equal(replayRequests, 0);
  const get = id => cached.document.getElementById(id);
  assert.equal(get('profile-company').textContent, 'Cached company');
  assert.equal(get('profile-avatar').getAttribute('src'), 'https://avatars.githubusercontent.com/u/1234?s=144');
  assert.match(get('profile-links').innerHTML, /profile.example/);
  assert.match(get('profile-links').innerHTML, /LinkedIn/);
  assert.match(get('grid').innerHTML, /Cached description/);
  assert.match(get('grid').innerHTML, /href="https:\/\/cached.example\/"/);
  assert.match(get('grid').innerHTML, /class="card-status">Archived/);
  assert.match(get(cached.releaseElementId('sample')).innerHTML, /v1.2.3/);
  assert.match(get(cached.licenseElementId('sample')).innerHTML, />MIT<\/span>/);
  const refreshed = visit(CACHE_TEST_TIME + 300_000, true);
  await refreshed.ready;
  assert.equal(requests.length, 10);
  const fresh = id => refreshed.document.getElementById(id);
  assert.equal(fresh('profile-company').textContent, 'Updated company');
  assert.equal(fresh('profile-avatar').getAttribute('src'), 'https://avatars.githubusercontent.com/u/5678?s=144');
  assert.match(fresh('grid').innerHTML, /Updated description/);
  assert.match(fresh('grid').innerHTML, /href="https:\/\/updated.example\/"/);
  assert.doesNotMatch(fresh('grid').innerHTML, /card-status|Cached description/);
  assert.match(fresh(refreshed.releaseElementId('sample')).innerHTML, /v2.0.0/);
  assert.match(fresh(refreshed.licenseElementId('sample')).innerHTML, /Apache-2.0/);
  for (const raw of storage.values()) assert.equal(JSON.parse(raw).savedAt, CACHE_TEST_TIME + 300_000);
});

test('shows expired data immediately, then replaces it and renews the cache after five minutes', async () => {
  const storage = new Map();
  await seedCache(storage);
  let finishProfile, finishSocial, finishProjects;
  const sandbox = loadScript(() => new Promise(resolve => { finishProjects = resolve; }), {
    storage, now: CACHE_TEST_TIME + 5 * 60 * 1000,
    profileFetch: () => new Promise(resolve => { finishProfile = resolve; }),
    socialFetch: () => new Promise(resolve => { finishSocial = resolve; }),
  });
  const get = id => sandbox.document.getElementById(id);
  assert.equal(get('profile-name').textContent, 'Cached Name');
  assert.match(get('profile-links').innerHTML, /Medium/);
  assert.match(get('grid').innerHTML, /cached-project/);
  assert.equal(get('project-status').textContent, '');
  finishProfile(response({ name: 'Fresh Name', blog: 'https://fresh.example/' }));
  finishSocial(response([{ provider: 'linkedin', url: 'https://www.linkedin.com/in/fresh/' }]));
  finishProjects(response([repo('fresh-project')]));
  await sandbox.ready;
  assert.equal(get('profile-name').textContent, 'Fresh Name');
  assert.match(get('profile-links').innerHTML, /LinkedIn/);
  assert.doesNotMatch(get('profile-links').innerHTML, /Medium/);
  assert.match(get('grid').innerHTML, /fresh-project/);
  assert.doesNotMatch(get('grid').innerHTML, /cached-project/);
  let requests = 0;
  const unexpected = async () => { requests += 1; throw new Error('Unexpected API request'); };
  const nextVisit = loadScript(unexpected, {
    storage, now: CACHE_TEST_TIME + 5 * 60 * 1000 + 1,
    profileFetch: unexpected, socialFetch: unexpected,
  });
  await nextVisit.ready;
  assert.equal(requests, 0);
  assert.equal(nextVisit.document.getElementById('profile-name').textContent, 'Fresh Name');
});

test('retains expired data quietly and refreshes its cache in the background', async () => {
  const storage = new Map();
  await seedCache(storage);
  const pages = [];
  let recover = false;
  const sandbox = loadScript(async url => {
    pages.push(new URL(url).searchParams.get('page'));
    return recover ? response([repo('recovered-project')]) : { ok: false, status: 503 };
  }, { storage, now: CACHE_TEST_TIME + 300_000 });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  const initialNodes = [...get('grid').children];
  assert.equal(get('profile-name').textContent, 'Cached Name');
  assert.match(get('profile-links').innerHTML, /Medium/);
  assert.match(get('grid').innerHTML, /cached-project/);
  assert.equal(get('project-status').textContent, 'All 1 project loaded.');
  assert.equal(get('load-more').hidden, true);
  recover = true;
  await sandbox.runNextRetry();
  assert.deepEqual(pages, ['1', '1']);
  assert.deepEqual(get('grid').children, initialNodes);
  const entry = JSON.parse(storage.get('github-directory:v1:myowinthein:' + sandbox.projectPageUrl(1)));
  assert.equal(entry.data[0].name, 'recovered-project');
  assert.equal(entry.savedAt, CACHE_TEST_TIME + 360_000);
  assert.equal(cardCount(get('grid').innerHTML), 1);
});

test('preserves pagination when repository pages are served from cache', async () => {
  const storage = new Map();
  const repositories = Array.from({ length: 13 }, (_, i) => repo(`cached-${i}`));
  const firstVisit = loadScript(paginatedFetch(repositories), { storage, now: CACHE_TEST_TIME });
  await firstVisit.ready;
  await firstVisit.document.getElementById('load-more').click();
  await firstVisit.document.getElementById('load-more').click();
  let requests = 0;
  const secondVisit = loadScript(async () => { requests += 1; throw new Error('Unexpected fetch'); }, {
    storage, now: CACHE_TEST_TIME + 1000,
  });
  await secondVisit.ready;
  const get = id => secondVisit.document.getElementById(id);
  assert.equal(cardCount(get('grid').innerHTML), 6);
  assert.equal(get('load-more').hidden, false);
  await get('load-more').click();
  await get('load-more').click();
  assert.equal(cardCount(get('grid').innerHTML), 13);
  assert.equal(get('load-more').hidden, true);
  assert.equal(requests, 0);
});

function apiResponse(status, data, headers = {}) {
  return {
    ok: status >= 200 && status < 300, status, json: async () => data,
    headers: { get(name) {
      return Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null;
    } },
  };
}

test('backs off silently across reloads without renewing stale data, then retries automatically', async () => {
  const storage = new Map();
  await seedCache(storage);
  const originalEntries = new Map(storage);
  const now = CACHE_TEST_TIME + 300_000;
  const reset = now + 120_000;
  let requests = 0;
  let recover = false;
  const sandbox = loadScript(async () => {
    requests += 1;
    return recover ? response([repo('recovered')]) : apiResponse(403, {}, {
      'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(reset / 1000),
    });
  }, { storage, now });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  assert.equal(requests, 1);
  assert.match(get('grid').innerHTML, /cached-project/);
  assert.equal(get('project-status').textContent, 'All 1 project loaded.');
  assert.equal(get('load-more').hidden, true);
  assert.equal(sandbox.githubRetryAt(), reset + 1000);
  assert.equal(storage.size, originalEntries.size + 1);
  for (const [key, value] of originalEntries) assert.equal(storage.get(key), value);
  await get('load-more').click();
  assert.equal(requests, 1);

  let blockedRequests = 0;
  const unexpected = async () => { blockedRequests += 1; throw new Error('Request during cooldown'); };
  const reload = loadScript(unexpected, {
    storage, now: reset + 999, profileFetch: unexpected, socialFetch: unexpected,
    releaseFetch: unexpected, licenseFetch: unexpected,
  });
  await reload.ready;
  assert.equal(blockedRequests, 0);
  assert.equal(reload.document.getElementById('profile-name').textContent, 'Cached Name');
  assert.match(reload.document.getElementById('grid').innerHTML, /cached-project/);
  assert.equal(reload.document.getElementById('load-more').hidden, true);

  recover = true;
  await sandbox.runNextRetry();
  assert.equal(requests, 2);
  assert.equal(get('load-more').hidden, true);
  const entry = JSON.parse(storage.get('github-directory:v1:myowinthein:' + sandbox.projectPageUrl(1)));
  assert.equal(entry.data[0].name, 'recovered');
  assert.equal(entry.savedAt, reset + 1000);
});

for (const status of [403, 503]) {
  test(`keeps all cached project details when repository refresh fails with ${status}`, async () => {
    const storage = new Map();
    const original = loadScript(paginatedFetch([repo('cached-details', { license: { spdx_id: 'MIT' } })]), {
      storage, now: CACHE_TEST_TIME,
      releaseFetch: async () => response(release()),
      licenseFetch: async () => response(license()),
    });
    await original.ready;
    let detailRequests = 0;
    const unexpected = async () => { detailRequests += 1; throw new Error('Unconfirmed detail request'); };
    const sandbox = loadScript(async () => apiResponse(status, {}, status === 403 ? {
      'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String((CACHE_TEST_TIME + 600_000) / 1000),
    } : {}), {
      storage, now: CACHE_TEST_TIME + 300_000, releaseFetch: unexpected, licenseFetch: unexpected,
    });
    await sandbox.ready;
    const get = id => sandbox.document.getElementById(id);
    assert.equal(detailRequests, 0);
    assert.match(get(sandbox.releaseElementId('cached-details')).innerHTML, /v1.2.3/);
    assert.match(get(sandbox.licenseElementId('cached-details')).innerHTML, />MIT<\/span>/);
    assert.equal(get(sandbox.releaseElementId('cached-details')).hidden, false);
    assert.equal(get(sandbox.licenseElementId('cached-details')).hidden, false);
  });
}

for (const scenario of [
  { name: 'Retry-After seconds', status: 429, headers: { 'Retry-After': '120' }, delay: 121_000 },
  { name: 'Retry-After date', status: 403, headers: { 'Retry-After': new Date(CACHE_TEST_TIME + 120_000).toUTCString() }, delay: 121_000 },
  { name: 'both reset and longer Retry-After', status: 403, headers: {
    'Retry-After': '120', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String((CACHE_TEST_TIME + 60_000) / 1000),
  }, delay: 121_000 },
  { name: 'missing 429 headers', status: 429, headers: {}, delay: 60_000 },
  { name: 'malformed reset headers', status: 403, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': 'invalid' }, delay: 60_000 },
  { name: 'secondary limit message', status: 403, headers: {}, message: 'You have exceeded a secondary rate limit.', delay: 60_000 },
]) {
  test(`honors GitHub backoff for ${scenario.name}`, async () => {
    const sandbox = loadScript(async () => apiResponse(scenario.status,
      { message: scenario.message || 'Request limited' }, scenario.headers), { now: CACHE_TEST_TIME });
    await sandbox.ready;
    assert.equal(sandbox.githubRetryAt(), CACHE_TEST_TIME + scenario.delay);
    assert.equal(sandbox.document.getElementById('project-status').textContent, '');
    assert.equal(sandbox.document.getElementById('load-more').hidden, true);
  });
}

test('does not mistake an ordinary forbidden response for a rate limit', async () => {
  const storage = new Map();
  const sandbox = loadScript(async () => apiResponse(403, { message: 'Forbidden' }), { storage });
  await sandbox.ready;
  assert.equal(sandbox.githubRetryAt(), 0);
  assert.equal(storage.size, 0);
  assert.equal(sandbox.document.getElementById('load-more').getAttribute('aria-disabled'), 'false');
  assert.equal(sandbox.document.getElementById('project-status').textContent, '');
});

test('uses fresh cached content even while a persisted rate limit blocks the API', async () => {
  const storage = new Map();
  await seedCache(storage);
  storage.set('github-directory:v1:myowinthein:retry-after', String(CACHE_TEST_TIME + 600_000));
  let requests = 0;
  const unexpected = async () => { requests += 1; throw new Error('Cached data requested the API'); };
  const sandbox = loadScript(unexpected, {
    storage, now: CACHE_TEST_TIME + 1000, profileFetch: unexpected, socialFetch: unexpected,
    releaseFetch: unexpected, licenseFetch: unexpected,
  });
  await sandbox.ready;
  assert.equal(requests, 0);
  assert.match(sandbox.document.getElementById('grid').innerHTML, /cached-project/);
  assert.equal(sandbox.document.getElementById('project-status').textContent, 'All 1 project loaded.');
});

test('Load more browses every expired cached batch during a rate limit without API requests', async () => {
  const storage = new Map();
  const repositories = Array.from({ length: 13 }, (_, i) => repo(`saved-${i}`));
  const seed = loadScript(paginatedFetch(repositories), { storage, now: CACHE_TEST_TIME });
  await seed.ready;
  await seed.document.getElementById('load-more').click();
  await seed.document.getElementById('load-more').click();
  storage.set('github-directory:v1:myowinthein:retry-after', String(CACHE_TEST_TIME + 600_000));
  const before = new Map(storage);
  let requests = 0;
  const unexpected = async () => { requests += 1; throw new Error('Request before reset'); };
  const sandbox = loadScript(unexpected, {
    storage, now: CACHE_TEST_TIME + 300_000, profileFetch: unexpected, socialFetch: unexpected,
    releaseFetch: unexpected, licenseFetch: unexpected,
  });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  const firstBatch = [...get('grid').children];
  assert.equal(get('load-more').hidden, false);
  assert.equal(get('load-more').getAttribute('aria-disabled'), 'false');
  assert.equal(get('project-status').textContent, '');
  get('load-more').focus();
  await get('load-more').click();
  assert.equal(get('grid').children.length, 12);
  assert.deepEqual(get('grid').children.slice(0, 6), firstBatch);
  assert.equal(sandbox.document.activeElement, get('grid').children[6].querySelector('.card-name'));
  assert.equal(get('load-more').hidden, false);
  await get('load-more').click();
  assert.deepEqual(cardNames(get('grid').innerHTML), repositories.map(project => project.name));
  assert.equal(get('project-status').textContent, 'All 13 projects loaded.');
  assert.equal(get('load-more').hidden, true);
  assert.equal(requests, 0);
  assert.deepEqual(storage, before);
});

test('hides an uncached next batch during a limit and restores Load more after background recovery', async () => {
  const storage = new Map();
  const repositories = Array.from({ length: 7 }, (_, i) => repo(`saved-${i}`));
  const seed = loadScript(paginatedFetch(repositories), { storage, now: CACHE_TEST_TIME });
  await seed.ready;
  storage.set('github-directory:v1:myowinthein:retry-after', String(CACHE_TEST_TIME + 600_000));
  const requests = [];
  const sandbox = loadScript(paginatedFetch(repositories, requests), { storage, now: CACHE_TEST_TIME + 300_000 });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  const initialNodes = [...get('grid').children];
  assert.equal(get('grid').children.length, 6);
  assert.equal(get('load-more').hidden, true);
  assert.equal(get('project-status').textContent, '');
  assert.equal(requests.length, 0);
  await sandbox.runNextRetry();
  assert.deepEqual(requests.map(url => url.searchParams.get('page')), ['1']);
  assert.deepEqual(get('grid').children, initialNodes);
  assert.equal(get('load-more').hidden, false);
  await get('load-more').click();
  assert.deepEqual(requests.map(url => url.searchParams.get('page')), ['1', '2']);
  assert.equal(get('grid').children.length, 7);
  assert.equal(get('project-status').textContent, 'All 7 projects loaded.');
});

test('recovers an initially uncached listing automatically after a rate-limit deadline', async () => {
  let requests = 0;
  const sandbox = loadScript(async () => ++requests === 1
    ? apiResponse(429, {}, { 'Retry-After': '60' }) : response([repo('recovered')]), { now: CACHE_TEST_TIME });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  get('theme-toggle').focus();
  assert.equal(get('load-more').hidden, true);
  assert.equal(get('project-status').textContent, '');
  assert.match(get('grid').innerHTML, /Browse public repositories/);
  await sandbox.runNextRetry();
  assert.equal(requests, 2);
  assert.deepEqual(cardNames(get('grid').innerHTML), ['recovered']);
  assert.equal(get('project-status').textContent, 'All 1 project loaded.');
  assert.equal(sandbox.document.activeElement, get('theme-toggle'));
  assert.equal(sandbox.timers.size, 0);
});

test('bounds temporary background retries with increasing delays and no visible error', async () => {
  let requests = 0;
  const sandbox = loadScript(async () => { requests += 1; return apiResponse(503, {}); }, { now: CACHE_TEST_TIME });
  await sandbox.ready;
  for (const delay of [60_000, 120_000, 240_000]) {
    assert.equal([...sandbox.timers.values()][0].delay, delay);
    await sandbox.runNextRetry();
  }
  assert.equal(requests, 4);
  assert.equal(sandbox.timers.size, 0);
  assert.equal(sandbox.document.getElementById('project-status').textContent, '');
  assert.equal(sandbox.document.getElementById('load-more').hidden, true);
});

test('restores optional details through background retries without replacing cards or focus', async () => {
  let recover = false;
  const sandbox = loadScript(paginatedFetch([repo('sample', { license: {} })]), {
    now: CACHE_TEST_TIME,
    releaseFetch: async () => recover ? response(release()) : apiResponse(503, {}),
    licenseFetch: async () => recover ? response(license()) : apiResponse(503, {}),
  });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  const initialCards = [...get('grid').children];
  get('theme-toggle').focus();
  recover = true;
  await sandbox.runNextRetry();
  assert.deepEqual(get('grid').children, initialCards);
  assert.equal(sandbox.document.activeElement, get('theme-toggle'));
  assert.match(get(sandbox.releaseElementId('sample')).innerHTML, /v1.2.3/);
  assert.match(get(sandbox.licenseElementId('sample')).innerHTML, />MIT<\/span>/);
  assert.equal(sandbox.timers.size, 0);
});

test('background profile and social recovery replaces saved values without duplicating old links', async () => {
  const storage = new Map();
  await seedCache(storage);
  let recover = false;
  const sandbox = loadScript(paginatedFetch([repo('cached-project')]), {
    storage, now: CACHE_TEST_TIME + 300_000,
    profileFetch: async () => recover ? response({ name: 'Updated name', blog: 'https://updated.example/' }) : apiResponse(503, {}),
    socialFetch: async () => recover ? response([{ provider: 'linkedin', url: 'https://linkedin.com/in/updated/' }]) : apiResponse(503, {}),
  });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  assert.equal(get('profile-name').textContent, 'Cached Name');
  assert.match(get('profile-links').innerHTML, /Medium/);
  recover = true;
  await sandbox.runNextRetry();
  assert.equal(get('profile-name').textContent, 'Updated name');
  assert.match(get('profile-links').innerHTML, /https:\/\/updated.example\//);
  assert.match(get('profile-links').innerHTML, /LinkedIn/);
  assert.doesNotMatch(get('profile-links').innerHTML, /Medium|cached.example/);
  assert.equal(sandbox.timers.size, 0);
});

test('respects limits in memory when browser storage is blocked', async () => {
  let requests = 0;
  const sandbox = loadScript(async () => {
    requests += 1;
    return apiResponse(429, {}, { 'Retry-After': '60' });
  }, {
    now: CACHE_TEST_TIME,
    storageApi: { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); } },
  });
  await sandbox.ready;
  await sandbox.document.getElementById('load-more').click();
  assert.equal(requests, 1);
  assert.equal(sandbox.githubRetryAt(), CACHE_TEST_TIME + 61_000);
});

test('preserves a successful last-budget response and suppresses optional API requests', async () => {
  let detailRequests = 0;
  const unexpected = async () => { detailRequests += 1; throw new Error('Request after budget exhausted'); };
  const sandbox = loadScript(async () => apiResponse(200, [repo('last-budget', { license: {} })], {
    'Link': '<https://api.github.com/users/myowinthein/repos?page=2>; rel="next"',
    'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String((CACHE_TEST_TIME + 60_000) / 1000),
  }), { now: CACHE_TEST_TIME, releaseFetch: unexpected, licenseFetch: unexpected });
  await sandbox.ready;
  assert.match(sandbox.document.getElementById('grid').innerHTML, /last-budget/);
  assert.equal(detailRequests, 0);
  assert.equal(sandbox.document.getElementById('load-more').hidden, true);
  assert.equal(sandbox.document.getElementById('project-status').textContent, '');
});

for (const saved of ['invalid', 'Infinity', '-1', String(CACHE_TEST_TIME - 1), String(CACHE_TEST_TIME + 172_800_000)]) {
  test(`ignores an invalid or expired saved retry deadline: ${saved}`, async () => {
    const storage = new Map([['github-directory:v1:myowinthein:retry-after', saved]]);
    let requests = 0;
    const sandbox = loadScript(async () => { requests += 1; return response([repo('available')]); }, {
      storage, now: CACHE_TEST_TIME,
    });
    await sandbox.ready;
    assert.equal(requests, 1);
    assert.equal(sandbox.githubRetryAt(), 0);
    assert.match(sandbox.document.getElementById('grid').innerHTML, /available/);
  });
}

for (const corruption of ['invalid JSON', 'missing timestamp', 'future timestamp', 'wrong data shape']) {
  test(`ignores cache with ${corruption} and fetches valid replacement data`, async () => {
    const storage = new Map();
    await seedCache(storage);
    for (const [key, raw] of storage) {
      const entry = JSON.parse(raw);
      if (corruption === 'missing timestamp') delete entry.savedAt;
      if (corruption === 'future timestamp') entry.savedAt = CACHE_TEST_TIME + 10_000;
      if (corruption === 'wrong data shape') entry.data = null;
      storage.set(key, corruption === 'invalid JSON' ? '{broken' : JSON.stringify(entry));
    }
    let requests = 0;
    const sandbox = loadScript(async () => { requests += 1; return response([repo('replacement-project')]); }, {
      storage, now: CACHE_TEST_TIME + 1000,
      profileFetch: async () => { requests += 1; return response({ name: 'Replacement Name' }); },
      socialFetch: async () => { requests += 1; return response([]); },
    });
    await sandbox.ready;
    assert.equal(requests, 3);
    assert.equal(sandbox.document.getElementById('profile-name').textContent, 'Replacement Name');
    assert.match(sandbox.document.getElementById('grid').innerHTML, /replacement-project/);
  });
}

test('does not cache failed requests or change unrelated browser storage', async () => {
  const storage = new Map([[THEME_STORAGE_KEY, 'dark'], ['other-app-key', 'keep']]);
  const sandbox = loadScript(undefined, { storage });
  await sandbox.ready;
  assert.deepEqual(Array.from(storage), [[THEME_STORAGE_KEY, 'dark'], ['other-app-key', 'keep']]);
});

test('continues displaying fresh data when the cache cannot be written', async () => {
  const sandbox = loadScript(paginatedFetch([repo('available-project')]), {
    storageApi: { getItem() { return null; }, setItem() { throw new Error('Storage quota exceeded'); } },
    profileFetch: async () => response({ name: 'Available Name' }),
    socialFetch: async () => response([{ provider: 'generic', url: 'https://example.medium.com/' }]),
  });
  await sandbox.ready;
  assert.equal(sandbox.document.getElementById('profile-name').textContent, 'Available Name');
  assert.match(sandbox.document.getElementById('profile-links').innerHTML, /Medium/);
  assert.match(sandbox.document.getElementById('grid').innerHTML, /available-project/);
});

test('caches successful empty results without turning them into API errors', async () => {
  const storage = new Map();
  const firstVisit = loadScript(async () => response([]), { storage, now: CACHE_TEST_TIME });
  await firstVisit.ready;
  let requests = 0;
  const nextVisit = loadScript(async () => { requests += 1; throw new Error('Unexpected fetch'); }, {
    storage, now: CACHE_TEST_TIME + 1000,
  });
  await nextVisit.ready;
  assert.equal(requests, 0);
  assert.match(nextVisit.document.getElementById('grid').innerHTML, /No projects found/);
});

test('rejects malformed individual cached repository records before rendering', async () => {
  const storage = new Map();
  await seedCache(storage);
  for (const [key, raw] of storage) {
    if (!key.includes('/repos?')) continue;
    const entry = JSON.parse(raw);
    entry.data = [null];
    storage.set(key, JSON.stringify(entry));
  }
  let requests = 0;
  const sandbox = loadScript(async () => { requests += 1; return response([repo('valid-project')]); }, {
    storage, now: CACHE_TEST_TIME + 1000,
  });
  await sandbox.ready;
  assert.equal(requests, 1);
  assert.match(sandbox.document.getElementById('grid').innerHTML, /valid-project/);
});

test('applies text escaping and URL validation again when replaying cached data', async () => {
  const storage = new Map();
  const firstVisit = loadScript(paginatedFetch([
    repo('<script>', { description: '<img src=x>', homepage: 'javascript:alert(1)' }),
  ]), {
    storage, now: CACHE_TEST_TIME,
    profileFetch: async () => response({ name: '<img src=x>', blog: 'javascript:alert(1)' }),
    socialFetch: async () => response([{ provider: '<img src=x>', url: 'https://example.com/' }]),
  });
  await firstVisit.ready;
  let requests = 0;
  const unexpected = async () => { requests += 1; throw new Error('Unexpected API request'); };
  const nextVisit = loadScript(unexpected, {
    storage, now: CACHE_TEST_TIME + 1000, profileFetch: unexpected, socialFetch: unexpected,
  });
  await nextVisit.ready;
  assert.equal(requests, 0);
  const get = id => nextVisit.document.getElementById(id);
  assert.equal(get('profile-name').textContent, '<img src=x>');
  assert.match(get('profile-links').innerHTML, /&lt;img src=x&gt;/);
  assert.match(get('grid').innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(get('profile-links').innerHTML + get('grid').innerHTML, /<img|<script>|javascript:/);
});

test('continues browsing stale cached pages while a background refresh preserves existing cards', async () => {
  const storage = new Map();
  const repositories = Array.from({ length: 13 }, (_, i) => repo(`cached-${i}`));
  const firstVisit = loadScript(paginatedFetch(repositories), { storage, now: CACHE_TEST_TIME });
  await firstVisit.ready;
  await firstVisit.document.getElementById('load-more').click();
  await firstVisit.document.getElementById('load-more').click();
  const pages = [];
  let recover = false;
  const nextVisit = loadScript(async url => {
    const page = new URL(url).searchParams.get('page');
    pages.push(page);
    if (page === '1') return response(repositories.slice(0, 6), true);
    return recover ? response([repo('updated-6'), repo('updated-7')]) : { ok: false, status: 503 };
  }, { storage, now: CACHE_TEST_TIME + 300_000 });
  await nextVisit.ready;
  const get = id => nextVisit.document.getElementById(id);
  const initialCards = [...get('grid').children];
  await get('load-more').click();
  assert.equal(cardCount(get('grid').innerHTML), 12);
  assert.deepEqual(get('grid').children.slice(0, 6), initialCards);
  assert.equal(get('project-status').textContent, '');
  recover = true;
  await nextVisit.runNextRetry();
  assert.deepEqual(pages, ['1', '2', '2']);
  assert.equal(cardCount(get('grid').innerHTML), 12);
  assert.deepEqual(get('grid').children.slice(0, 6), initialCards);
  const entry = JSON.parse(storage.get('github-directory:v1:myowinthein:' + nextVisit.projectPageUrl(2)));
  assert.equal(entry.data[0].name, 'updated-6');
  assert.equal(entry.savedAt, CACHE_TEST_TIME + 360_000);
});

test('persists theme toggles and restores the choice on reload', async () => {
  const storage = new Map();
  const sandbox = loadScript(undefined, { storage });
  await sandbox.ready;
  const root = sandbox.document.documentElement;
  const button = sandbox.document.getElementById('theme-toggle');

  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(button.getAttribute('aria-label'), 'Switch to dark theme');
  button.click();
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(button.getAttribute('aria-label'), 'Switch to light theme');
  assert.equal(storage.get(THEME_STORAGE_KEY), 'dark');
  button.click();
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(storage.get(THEME_STORAGE_KEY), 'light');

  const reloaded = loadScript(undefined, { storage, prefersDark: true });
  await reloaded.ready;
  assert.equal(reloaded.document.documentElement.getAttribute('data-theme'), 'light');
});

test('loads projects and uses the system theme when storage reads are blocked', async () => {
  const requests = [];
  const sandbox = loadScript(paginatedFetch([repo('available-project')], requests), {
    prefersDark: true,
    storageApi: { getItem() { throw new Error('Storage denied'); }, setItem() {} },
  });
  await sandbox.ready;
  assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(requests.length, 1);
  assert.match(sandbox.document.getElementById('grid').innerHTML, /available-project/);
});

test('changes the visible theme even when its preference cannot be saved', async () => {
  const sandbox = loadScript(undefined, {
    storageApi: { getItem() { return null; }, setItem() { throw new Error('Storage denied'); } },
  });
  await sandbox.ready;
  const button = sandbox.document.getElementById('theme-toggle');
  assert.doesNotThrow(() => button.click());
  assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(button.getAttribute('aria-label'), 'Switch to light theme');
  assert.doesNotThrow(() => button.click());
  assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), 'light');
});

test('ignores an invalid saved theme in favor of the system preference', async () => {
  const sandbox = loadScript(undefined, { savedTheme: 'invalid', prefersDark: true });
  await sandbox.ready;
  assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), 'dark');
});

test('automatic theme follows system changes without storing an override', async () => {
  const storage = new Map();
  const sandbox = loadScript(undefined, { storage });
  await sandbox.ready;
  sandbox.media.change(true);
  assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), 'dark');
  sandbox.media.change(false);
  assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(storage.has(THEME_STORAGE_KEY), false);
});

for (const savedTheme of ['light', 'dark']) {
  test(`explicit ${savedTheme} stays selected when the system changes`, async () => {
    const sandbox = loadScript(undefined, { savedTheme, prefersDark: savedTheme === 'dark' });
    await sandbox.ready;
    sandbox.media.change(savedTheme !== 'dark');
    assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), savedTheme);
  });
}

test('storage events synchronize tabs, ignore sibling projects and restore automatic mode', async () => {
  const sandbox = loadScript();
  await sandbox.ready;
  const root = sandbox.document.documentElement;
  const changed = (key, newValue) => sandbox.window.dispatchEvent({ type: 'storage', key, newValue });
  changed(THEME_STORAGE_KEY, 'dark');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(sandbox.document.getElementById('theme-toggle').getAttribute('aria-label'), 'Switch to light theme');
  changed('agent-helm-theme', 'light');
  changed('agent-compass-theme', 'light');
  changed('theme', 'light');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  changed(THEME_STORAGE_KEY, null);
  assert.equal(root.getAttribute('data-theme-mode'), 'system');
  assert.equal(root.getAttribute('data-theme'), 'light');
  sandbox.media.change(true);
  assert.equal(root.getAttribute('data-theme'), 'dark');
  changed(THEME_STORAGE_KEY, 'light');
  changed(THEME_STORAGE_KEY, 'invalid');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  changed(THEME_STORAGE_KEY, 'light');
  changed(null, null);
  assert.equal(root.getAttribute('data-theme'), 'dark');
});

test('a manual choice remains in memory when storage is blocked and the system changes', async () => {
  const sandbox = loadScript(undefined, {
    storageApi: { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); } },
  });
  await sandbox.ready;
  sandbox.media.change(true);
  sandbox.document.getElementById('theme-toggle').click();
  sandbox.media.change(false);
  sandbox.media.change(true);
  assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), 'light');
});

for (const legacy of ['light', 'dark']) {
  test(`migrates the old ${legacy} preference without losing it or changing sibling preferences`, async () => {
    const storage = new Map([['theme', legacy], ['agent-helm-theme', 'dark'], ['agent-compass-theme', 'light']]);
    const sandbox = loadScript(undefined, { storage, prefersDark: legacy !== 'dark' });
    await sandbox.ready;
    assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), legacy);
    assert.equal(storage.get(THEME_STORAGE_KEY), legacy);
    assert.equal(storage.has('theme'), false);
    assert.equal(storage.get('agent-helm-theme'), 'dark');
    assert.equal(storage.get('agent-compass-theme'), 'light');
    storage.delete(THEME_STORAGE_KEY);
    const reloaded = loadScript(undefined, { storage, prefersDark: true });
    await reloaded.ready;
    assert.equal(reloaded.document.documentElement.getAttribute('data-theme-mode'), 'system');
  });
}

for (const savedTheme of ['dark', 'invalid']) {
  test(`new ${savedTheme} preference takes precedence over the legacy value`, async () => {
    const sandbox = loadScript(undefined, { savedTheme, storage: new Map([['theme', 'light']]), prefersDark: true });
    await sandbox.ready;
    assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(sandbox.document.documentElement.getAttribute('data-theme-mode'), savedTheme === 'dark' ? 'dark' : 'system');
  });
}

test('a failed migration keeps the legacy preference available in memory and storage', async () => {
  const storage = new Map([['theme', 'light']]);
  const sandbox = loadScript(undefined, {
    prefersDark: true,
    storageApi: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem() { throw new Error('Quota exceeded'); },
      removeItem() { assert.fail('Do not remove the legacy choice before it is saved'); },
    },
  });
  await sandbox.ready;
  assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), 'light');
  sandbox.media.change(false);
  sandbox.media.change(true);
  assert.equal(sandbox.document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(storage.get('theme'), 'light');
});

test('index.html provides every element the script reads and keeps scripts and styles external', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const id of ELEMENT_IDS) assert.match(html, new RegExp(`\\sid="${id}"`), `missing id ${id}`);
  assert.match(html, /<script src="assets\/script\.js"><\/script>/);
  assert.match(html, /<script src="assets\/theme\.js"><\/script>/);
  assert.ok(html.indexOf('src="assets/theme.js"') < html.indexOf('href="assets/style.css"'));
  assert.ok(html.indexOf('src="assets/theme.js"') < html.indexOf('<body>'));
  assert.match(html, /<link rel="stylesheet" href="assets\/style\.css">/);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)|<style/i);
});

test('escapeHtml escapes &, <, >, and "', () => {
  const { escapeHtml } = loadScript();
  assert.equal(escapeHtml('<script>&"</script>'), '&lt;script&gt;&amp;&quot;&lt;/script&gt;');
});

test('escapeHtml leaves plain text untouched', () => {
  const { escapeHtml } = loadScript();
  assert.equal(escapeHtml('hello world'), 'hello world');
});

test('safeUrl accepts http and https URLs', () => {
  const { safeUrl } = loadScript();
  assert.equal(safeUrl('https://example.com', 'https://fallback.example'), 'https://example.com/');
  assert.equal(safeUrl('http://example.com', 'https://fallback.example'), 'http://example.com/');
});

test('safeUrl rejects non-http(s) protocols and returns the fallback', () => {
  const { safeUrl } = loadScript();
  assert.equal(safeUrl('javascript:alert(1)', 'https://fallback.example'), 'https://fallback.example');
  assert.equal(safeUrl('ftp://example.com', 'https://fallback.example'), 'https://fallback.example');
});

test('safeUrl returns the fallback for unparseable URL strings', () => {
  const { safeUrl } = loadScript();
  assert.equal(safeUrl('not a url', 'https://fallback.example'), 'https://fallback.example');
});

function repo(name, overrides = {}) {
  return {
    name, private: false, fork: false, owner: { login: 'myowinthein' },
    has_pages: false, homepage: null, description: '', ...overrides,
  };
}

function cardCount(html) {
  return (html.match(/class="card"/g) || []).length;
}

function cardNames(html) {
  return Array.from(html.matchAll(/class="card-name">([^<]+)</g), m => m[1]);
}

function response(repos, hasNextPage = false) {
  return {
    ok: true, json: async () => repos,
    headers: { get() { return hasNextPage ? '<https://api.github.com/users/myowinthein/repos?page=2>; rel="next"' : null; } },
  };
}

function paginatedFetch(repositories, requests = []) {
  return async url => {
    const request = new URL(url);
    requests.push(request);
    if (requests.length > repositories.length + 1) throw new Error('Pagination did not finish');
    const page = Number(request.searchParams.get('page'));
    const perPage = Number(request.searchParams.get('per_page'));
    return response(repositories.slice((page - 1) * perPage, page * perPage), page * perPage < repositories.length);
  };
}

test('loads the introduction, metadata, website, and social links from public GitHub data', async () => {
  const urls = [];
  const sandbox = loadScript(paginatedFetch([repo('live-project')]), {
    profileFetch: async url => {
      urls.push(url);
      return response({ name: 'Current GitHub Name', bio: 'Current GitHub bio.', company: 'Current company', location: 'Current location', blog: 'https://example.com/', avatar_url: 'https://avatars.githubusercontent.com/u/1234' });
    },
    socialFetch: async url => {
      urls.push(url);
      return response([
        { provider: 'linkedin', url: 'https://www.linkedin.com/in/example/' },
        { provider: 'generic', url: 'https://example.medium.com/' },
      ]);
    },
  });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  assert.equal(get('profile-avatar').getAttribute('src'), 'https://avatars.githubusercontent.com/u/1234?s=144');
  assert.equal(get('profile-avatar').hidden, false);
  assert.equal(get('profile-name').textContent, 'Current GitHub Name');
  assert.equal(get('profile-bio').textContent, 'Current GitHub bio.');
  assert.equal(get('profile-company').textContent, 'Current company');
  assert.equal(get('profile-company').hidden, false);
  assert.equal(get('profile-details').hidden, false);
  assert.equal(get('profile-location').textContent, 'Current location');
  assert.equal(get('profile-bio').hidden, false);
  assert.equal(get('profile-location').hidden, false);
  assert.equal(sandbox.document.title, 'Current GitHub Name | Public projects');
  assert.equal(get('page-description').getAttribute('content'), 'Current GitHub bio.');
  assert.equal(get('page-og-title').getAttribute('content'), sandbox.document.title);
  assert.equal(get('page-og-description').getAttribute('content'), 'Current GitHub bio.');
  assert.equal(get('page-twitter-title').getAttribute('content'), sandbox.document.title);
  assert.equal(get('page-twitter-description').getAttribute('content'), 'Current GitHub bio.');
  const links = get('profile-links').innerHTML;
  assert.match(links, /href="https:\/\/example.com\/"><span class="link-label">Website/);
  assert.match(links, /href="https:\/\/github.com\/myowinthein"><span class="link-label">GitHub/);
  assert.match(links, /href="https:\/\/www.linkedin.com\/in\/example\/"><span class="link-label">LinkedIn/);
  assert.match(links, /href="https:\/\/example.medium.com\/"><span class="link-label">Medium/);
  assert.ok(urls.includes('https://api.github.com/users/myowinthein'));
  assert.ok(urls.includes('https://api.github.com/users/myowinthein/social_accounts?per_page=100&page=1'));
});

test('treats profile text as plain text and validates and escapes social URLs and labels', async () => {
  const name = '<img src=x onerror=alert(1)>';
  const bio = '<script>alert(1)</script>';
  const sandbox = loadScript(undefined, {
    profileFetch: async () => response({ name, bio, company: '<img src=x>', blog: 'javascript:alert(1)', avatar_url: 'javascript:alert(1)' }),
    socialFetch: async () => response([
      { provider: 'generic', url: 'data:text/html,unsafe' },
      { provider: '<img src=x>', url: 'https://example.com/?a=1&b=2' },
      { provider: 'generic', url: 'not a URL' },
      null,
    ]),
  });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  assert.equal(get('profile-name').textContent, name);
  assert.equal(get('profile-bio').textContent, bio);
  assert.equal(get('profile-name').innerHTML, '');
  assert.equal(get('profile-bio').innerHTML, '');
  assert.equal(get('profile-company').textContent, '<img src=x>');
  assert.equal(get('profile-company').innerHTML, '');
  assert.equal(get('profile-avatar').hidden, true);
  assert.equal(get('profile-avatar').getAttribute('src'), null);
  const links = get('profile-links').innerHTML;
  assert.match(links, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.match(links, /&lt;img src=x&gt;/);
  assert.doesNotMatch(links, /javascript:|data:|<img|Website/);
});

for (const [source, expected] of [
  ['https://avatars.githubusercontent.com/u/1234?v=4&s=460', 'https://avatars.githubusercontent.com/u/1234?v=4&s=144'],
  ['https://images.example/avatar.png?size=460', 'https://images.example/avatar.png?size=460'],
  ['https://avatars.githubusercontent.com.example/avatar.png', 'https://avatars.githubusercontent.com.example/avatar.png'],
]) {
  test(`sizes only GitHub avatar images and preserves their other parameters: ${source}`, async () => {
    const sandbox = loadScript(undefined, { profileFetch: async () => response({ avatar_url: source }) });
    await sandbox.ready;
    assert.equal(sandbox.document.getElementById('profile-avatar').getAttribute('src'), expected);
  });
}

test('hides a failed avatar image without changing the profile', async () => {
  const sandbox = loadScript(undefined, {
    profileFetch: async () => response({ name: 'Current GitHub Name', avatar_url: 'https://avatars.githubusercontent.com/u/1234' }),
  });
  await sandbox.ready;
  const avatar = sandbox.document.getElementById('profile-avatar');
  avatar.dispatchEvent({ type: 'error' });
  assert.equal(avatar.hidden, true);
  assert.equal(sandbox.document.getElementById('profile-name').textContent, 'Current GitHub Name');
});

const DIRECT_FAVICON = 'https://github.com/myowinthein.png?size=64';
const AVATAR = 'https://avatars.githubusercontent.com/u/1234';

test('replaces the favicon with a circular copy of the avatar once it loads', async () => {
  const sandbox = loadScript(undefined, { profileFetch: async () => response({ avatar_url: AVATAR }) });
  await sandbox.ready;
  const favicon = sandbox.document.getElementById('page-favicon');
  const [image] = sandbox.images;
  assert.equal(image.src, `${AVATAR}?s=144`);
  assert.equal(image.crossOrigin, 'anonymous');
  assert.equal(image.referrerPolicy, 'no-referrer');
  assert.equal(favicon.getAttribute('href'), DIRECT_FAVICON);
  image.onload();
  assert.deepEqual(sandbox.canvasCalls, ['beginPath', ['arc', 32, 32, 32, 0, Math.PI * 2], 'clip', 'drawImage']);
  assert.equal(favicon.getAttribute('href'), 'data:image/png;circle-4');
});

for (const canvasMode of ['no-context', 'tainted']) {
  test(`keeps the direct favicon when the canvas is ${canvasMode}`, async () => {
    const sandbox = loadScript(undefined, { profileFetch: async () => response({ avatar_url: AVATAR }) });
    await sandbox.ready;
    sandbox.canvasMode = canvasMode;
    sandbox.images[0].onload();
    assert.equal(sandbox.document.getElementById('page-favicon').getAttribute('href'), DIRECT_FAVICON);
  });
}

test('ignores a stale avatar load after a newer profile replaces it', async () => {
  const sandbox = loadScript(undefined, { profileFetch: async () => response({ avatar_url: AVATAR }) });
  await sandbox.ready;
  sandbox.renderProfile({ avatar_url: 'https://avatars.githubusercontent.com/u/5678' });
  const [stale, current] = sandbox.images;
  const favicon = sandbox.document.getElementById('page-favicon');
  current.onload();
  stale.onload();
  assert.equal(favicon.getAttribute('href'), 'data:image/png;circle-4');
  assert.equal(sandbox.canvasCalls.length, 4);
});

test('does not reload an unchanged avatar or discard its converted favicon', async () => {
  const sandbox = loadScript(undefined, { profileFetch: async () => response({ avatar_url: AVATAR }) });
  await sandbox.ready;
  sandbox.images[0].onload();
  sandbox.renderProfile({ avatar_url: AVATAR });
  assert.equal(sandbox.images.length, 1);
  assert.equal(sandbox.document.getElementById('page-favicon').getAttribute('href'), 'data:image/png;circle-4');
});

test('restores the direct favicon when the profile no longer has an avatar', async () => {
  const sandbox = loadScript(undefined, { profileFetch: async () => response({ avatar_url: AVATAR }) });
  await sandbox.ready;
  sandbox.images[0].onload();
  sandbox.renderProfile({});
  assert.equal(sandbox.document.getElementById('page-favicon').getAttribute('href'), DIRECT_FAVICON);
});

test('hides missing profile fields and avoids duplicate website and social links', async () => {
  const sandbox = loadScript(undefined, {
    profileFetch: async () => response({ name: ' ', bio: null, company: ' ', location: ' ', blog: 'https://example.com' }),
    socialFetch: async () => response([
      { provider: 'generic', url: 'https://example.com/' },
      { provider: 'generic', url: 'https://github.com/myowinthein' },
      { provider: 'generic', url: 'https://example.com/' },
    ]),
  });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  assert.equal(get('profile-name').textContent, 'myowinthein');
  assert.equal(get('profile-bio').hidden, true);
  assert.equal(get('profile-location').hidden, true);
  assert.equal(get('profile-company').hidden, true);
  assert.equal(get('profile-details').hidden, true);
  assert.equal(get('profile-avatar').hidden, true);
  assert.equal((get('profile-links').innerHTML.match(/<a /g) || []).length, 2);
  assert.equal(get('page-description').getAttribute('content'), 'Public GitHub projects by myowinthein.');
});

test('handles all 64 combinations of optional profile details and links', async () => {
  for (let mask = 0; mask < 64; mask += 1) {
    const profile = { name: 'Current name' };
    if (mask & 1) profile.avatar_url = 'https://avatars.githubusercontent.com/u/1234';
    if (mask & 2) profile.bio = 'Current bio';
    if (mask & 4) profile.company = 'Current company';
    if (mask & 8) profile.location = 'Current location';
    if (mask & 16) profile.blog = 'https://example.com/';
    const sandbox = loadScript(undefined, {
      profileFetch: async () => response(profile),
      socialFetch: async () => response(mask & 32
        ? [{ provider: 'generic', url: 'https://social.example/' }] : []),
    });
    await sandbox.ready;
    const get = id => sandbox.document.getElementById(id);
    for (const [field, flag] of [['avatar', 1], ['bio', 2], ['company', 4], ['location', 8]]) {
      assert.equal(get(`profile-${field}`).hidden, !(mask & flag), `mask ${mask}: ${field}`);
    }
    assert.equal(get('profile-details').hidden, !(mask & 14), `mask ${mask}: details group`);
    assert.equal(get('profile-name').textContent, 'Current name');
    const links = get('profile-links').innerHTML;
    assert.match(links, /GitHub/);
    assert.equal(links.includes('Website'), Boolean(mask & 16));
    assert.equal(links.includes('social.example'), Boolean(mask & 32));
  }
});

test('removes previously displayed optional details when profile values are cleared', async () => {
  const sandbox = loadScript(undefined, {
    profileFetch: async () => response({
      name: 'Current name', company: 'Current company', bio: 'Current bio',
      location: 'Current location', blog: 'https://example.com/',
      avatar_url: 'https://avatars.githubusercontent.com/u/1234',
    }),
    socialFetch: async () => response([]),
  });
  await sandbox.ready;
  sandbox.renderProfile({});
  for (const field of ['avatar', 'bio', 'company', 'location', 'details']) {
    assert.equal(sandbox.document.getElementById(`profile-${field}`).hidden, true);
  }
  assert.equal(sandbox.document.getElementById('profile-name').textContent, 'myowinthein');
  assert.doesNotMatch(sandbox.document.getElementById('profile-links').innerHTML, /Website/);
});

test('keeps project and social loading independent of a failed profile request', async () => {
  const sandbox = loadScript(paginatedFetch([repo('working-project')]), {
    profileFetch: async () => { throw new TypeError('Profile unavailable'); },
    socialFetch: async () => response([{ provider: 'generic', url: 'https://example.medium.com/' }]),
  });
  await sandbox.ready;
  assert.equal(sandbox.document.getElementById('profile-name').textContent, 'myowinthein');
  assert.match(sandbox.document.getElementById('profile-links').innerHTML, /Medium/);
  assert.match(sandbox.document.getElementById('grid').innerHTML, /working-project/);
});

test('keeps profile loading independent of failed project and social requests', async () => {
  const sandbox = loadScript(undefined, {
    profileFetch: async () => response({ name: 'Updated name', blog: 'https://example.com/' }),
    socialFetch: async () => ({ ok: false, status: 403 }),
  });
  await sandbox.ready;
  assert.equal(sandbox.document.getElementById('profile-name').textContent, 'Updated name');
  assert.match(sandbox.document.getElementById('profile-links').innerHTML, /Website/);
  assert.match(sandbox.document.getElementById('grid').innerHTML, /Browse public repositories/);
});

for (const first of ['profile', 'social']) {
  test(`retains all profile links when ${first} data arrives first`, async () => {
    let finishProfile, finishSocial;
    const sandbox = loadScript(paginatedFetch([repo('independent-project')]), {
      profileFetch: () => new Promise(resolve => { finishProfile = resolve; }),
      socialFetch: () => new Promise(resolve => { finishSocial = resolve; }),
    });
    const profile = response({ name: 'Current name', blog: 'https://example.com/' });
    const socials = response([{ provider: 'generic', url: 'https://example.medium.com/' }]);
    if (first === 'profile') finishProfile(profile);
    else finishSocial(socials);
    await new Promise(resolve => setImmediate(resolve));
    const links = sandbox.document.getElementById('profile-links');
    assert.match(links.innerHTML, first === 'profile' ? /Website/ : /Medium/);
    assert.match(sandbox.document.getElementById('grid').innerHTML, /independent-project/);
    if (first === 'profile') finishSocial(socials);
    else finishProfile(profile);
    await sandbox.ready;
    assert.match(links.innerHTML, /Website/);
    assert.match(links.innerHTML, /Medium/);
    assert.match(links.innerHTML, /GitHub/);
  });
}

test('follows social-account pagination without dropping earlier links', async () => {
  const pages = [];
  const sandbox = loadScript(undefined, {
    socialFetch: async url => {
      const request = new URL(url);
      pages.push(request.searchParams.get('page'));
      assert.equal(request.searchParams.get('per_page'), '100');
      return response([{ provider: 'generic', url: `https://example.com/${pages.length}` }], pages.length === 1);
    },
  });
  await sandbox.ready;
  assert.deepEqual(pages, ['1', '2']);
  const links = sandbox.document.getElementById('profile-links').innerHTML;
  assert.match(links, /https:\/\/example.com\/1/);
  assert.match(links, /https:\/\/example.com\/2/);
});

test('labels social links by provider, Medium domain, or hostname without www', async () => {
  const sandbox = loadScript(undefined, {
    socialFetch: async () => response([
      { provider: 'mastodon', url: 'https://mastodon.example/@me' },
      { provider: 'generic', url: 'https://www.example.org/me' },
      { provider: 'generic', url: 'https://medium.com/@me' },
      { provider: 'generic', url: 'https://notmedium.com/me' },
      { url: 'https://www.no-provider.example/' },
      { provider: ' ', url: 'https://www.empty-provider.example/' },
    ]),
  });
  await sandbox.ready;
  const labels = Array.from(
    sandbox.document.getElementById('profile-links').innerHTML.matchAll(/<span class="link-label">([^<]+)<\/span><\/a>/g), m => m[1]);
  assert.deepEqual(labels, ['GitHub', 'mastodon', 'example.org', 'Medium', 'notmedium.com', 'no-provider.example', 'empty-provider.example']);
});

test('retains safe fallbacks when profile and social endpoints return invalid data', async () => {
  const sandbox = loadScript(paginatedFetch([repo('working-project')]), {
    profileFetch: async () => response(null),
    socialFetch: async () => response({ unexpected: 'object' }),
  });
  await sandbox.ready;
  assert.equal(sandbox.document.getElementById('profile-name').textContent, 'myowinthein');
  assert.match(sandbox.document.getElementById('profile-links').innerHTML, /GitHub/);
  assert.match(sandbox.document.getElementById('grid').innerHTML, /working-project/);
});

test('lists owned public projects without Pages or a homepage, excluding forks and self', async () => {
  const sandbox = loadScript(paginatedFetch([
    repo('plain-project'),
    repo('archived-project', { archived: true }),
    repo('private-project', { private: true }),
    repo('fork-project', { fork: true }),
    repo('Myowinthein.github.io'),
    repo('other-owner', { owner: { login: 'someone-else' } }),
  ]));
  await sandbox.ready;
  const html = sandbox.document.getElementById('grid').innerHTML;
  assert.match(html, /plain-project/);
  assert.match(html, /archived-project/);
  assert.doesNotMatch(html, /private-project|fork-project|Myowinthein.github.io|other-owner/);
  assert.match(html, /href="https:\/\/github.com\/myowinthein\/plain-project"/);
  assert.match(html, /Source<\/span><\/a>/);
});

test('omits absent project descriptions and homepage links while keeping source links', async () => {
  const sandbox = loadScript(paginatedFetch([
    repo('no-description', { description: null }),
    repo('blank-description', { description: ' ' }),
    repo('empty-description', { description: '' }),
  ]));
  await sandbox.ready;
  const html = sandbox.document.getElementById('grid').innerHTML;
  assert.equal(cardCount(html), 3);
  assert.doesNotMatch(html, /class="card-desc"|Website/);
  assert.equal((html.match(/>Source<\/span>/g) || []).length, 3);
});

function release(overrides = {}) {
  return {
    tag_name: 'v1.2.3', html_url: 'https://github.com/myowinthein/sample/releases/tag/v1.2.3',
    draft: false, prerelease: false, ...overrides,
  };
}

test('handles all 32 combinations of optional project content', async () => {
  for (let mask = 0; mask < 32; mask += 1) {
    const sandbox = loadScript(paginatedFetch([repo('sample', {
      description: mask & 1 ? 'Project description' : null,
      homepage: mask & 2 ? 'https://example.com/' : null,
      archived: Boolean(mask & 4),
      license: mask & 16 ? { spdx_id: 'MIT' } : null,
    })]), {
      releaseFetch: async () => mask & 8 ? response(release()) : { ok: false, status: 404 },
      licenseFetch: async () => response(license()),
    });
    await sandbox.ready;
    const get = id => sandbox.document.getElementById(id);
    const html = get('grid').innerHTML;
    assert.match(html, /class="card-name">sample<\/h3>/);
    assert.match(html, />Source<\/span>/);
    for (const [value, flag] of [['card-desc', 1], ['Website', 2], ['card-status', 4]]) {
      assert.equal(html.includes(value), Boolean(mask & flag), `mask ${mask}: ${value}`);
    }
    assert.equal(get(sandbox.releaseElementId('sample')).hidden, !(mask & 8));
    assert.equal(get(sandbox.licenseElementId('sample')).hidden, !(mask & 16));
    assert.doesNotMatch(html, /<p[^>]*>\s*<\/p>|<ul[^>]*>\s*<\/ul>/);
  }
});

function license(overrides = {}) {
  return {
    html_url: 'https://github.com/myowinthein/sample/blob/trunk/LICENSE.md',
    license: { spdx_id: 'MIT' }, ...overrides,
  };
}

test('places a license after Source and uses the actual file URL without guessing its path', async () => {
  const sandbox = loadScript(paginatedFetch([repo('sample', {
    homepage: 'https://example.com/', license: { spdx_id: 'MIT' },
  })]), { licenseFetch: async () => response(license()) });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  const html = get('grid').innerHTML;
  assert.ok(html.indexOf('>Website</span>') < html.indexOf('>Source</span>'));
  assert.ok(html.indexOf('>Source</span>') < html.indexOf('class="card-license"'));
  assert.doesNotMatch(html, /Project page/);
  const slot = get(sandbox.licenseElementId('sample'));
  assert.equal(slot.hidden, false);
  assert.match(slot.innerHTML, />MIT<\/span>/);
  assert.match(slot.innerHTML, /href="https:\/\/github.com\/myowinthein\/sample\/blob\/trunk\/LICENSE.md"/);
  assert.match(slot.innerHTML, /aria-label="MIT license for sample"/);
  assert.match(slot.innerHTML, /rel="noopener noreferrer"/);
  assert.doesNotMatch(slot.innerHTML, /\starget=/);
});

test('does not fetch licenses for absent metadata, excluded repos, or projects not yet displayed', async () => {
  const urls = [];
  const knownLicense = { license: { spdx_id: 'MIT' } };
  const sandbox = loadScript(paginatedFetch([
    repo('first', knownLicense), repo('missing'), repo('invalid', { license: 'MIT' }),
    repo('array', { license: [] }), repo('fork', { ...knownLicense, fork: true }),
    repo('myowinthein.github.io', knownLicense), repo('encoded name', knownLicense),
  ]), { licenseFetch: async url => { urls.push(url); return response(license()); } });
  await sandbox.ready;
  assert.deepEqual(urls, ['https://api.github.com/repos/myowinthein/first/license']);
  assert.equal(sandbox.document.getElementById(sandbox.licenseElementId('missing')).hidden, true);
  await sandbox.document.getElementById('load-more').click();
  assert.equal(urls.at(-1), 'https://api.github.com/repos/myowinthein/encoded%20name/license');
  assert.equal(urls.length, 2);
});

test('hides failed or unsafe license results and never caches their errors', async () => {
  for (const result of [
    { ok: false, status: 404 }, { ok: false, status: 403 }, response({}), response(null),
    response(license({ html_url: 'javascript:alert(1)' })),
    response(license({ license: { spdx_id: ' ' } })),
    response(license({ license: null })),
    { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } },
  ]) {
    const storage = new Map();
    const sandbox = loadScript(paginatedFetch([repo('sample', { license: { spdx_id: 'MIT' } })]), {
      storage, licenseFetch: async () => result,
    });
    await sandbox.ready;
    assert.equal(sandbox.document.getElementById(sandbox.licenseElementId('sample')).hidden, true);
    assert.match(sandbox.document.getElementById('grid').innerHTML, />Source<\/span>/);
    assert.ok(![...storage.keys()].some(key => key.endsWith('/license')));
  }
});

test('escapes license text and URL attributes and labels unidentified license files honestly', async () => {
  for (const [spdx, expected] of [['<img src=x>"', '&lt;img src=x&gt;&quot;'], ['NOASSERTION', 'License']]) {
    const sandbox = loadScript(paginatedFetch([repo('sample', { license: { spdx_id: spdx } })]), {
      licenseFetch: async () => response(license({
        html_url: 'https://example.com/license?a=1&b=2', license: { spdx_id: spdx },
      })),
    });
    await sandbox.ready;
    const html = sandbox.document.getElementById(sandbox.licenseElementId('sample')).innerHTML;
    assert.ok(html.includes(expected));
    assert.match(html, /href="https:\/\/example.com\/license\?a=1&amp;b=2"/);
    assert.doesNotMatch(html, /<img|NOASSERTION|License license/);
  }
});

test('caches licenses, preserves a focused link during refresh, and keeps stale data after failure', async () => {
  const storage = new Map();
  const project = repo('sample', { license: { spdx_id: 'MIT' } });
  const first = loadScript(paginatedFetch([project]), {
    storage, now: CACHE_TEST_TIME, licenseFetch: async () => response(license()),
  });
  await first.ready;
  let requests = 0;
  const fresh = loadScript(paginatedFetch([project]), {
    storage, now: CACHE_TEST_TIME + 1000,
    licenseFetch: async () => { requests += 1; throw new Error('Unexpected request'); },
  });
  await fresh.ready;
  assert.equal(requests, 0);
  assert.equal(fresh.document.getElementById(fresh.licenseElementId('sample')).hidden, false);
  let finishLicense;
  const stale = loadScript(paginatedFetch([project]), {
    storage, now: CACHE_TEST_TIME + 300_000,
    licenseFetch: () => new Promise(resolve => { finishLicense = resolve; }),
  });
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  const slot = stale.document.getElementById(stale.licenseElementId('sample'));
  const link = slot.firstElementChild;
  assert.match(slot.innerHTML, />MIT<\/span>/);
  assert.equal(stale.document.getElementById('grid').getAttribute('aria-busy'), 'false');
  assert.equal(stale.document.getElementById('load-more').disabled, false);
  finishLicense(response(license({ license: { spdx_id: 'Apache-2.0' } })));
  await stale.ready;
  assert.equal(slot.firstElementChild, link);
  assert.match(slot.innerHTML, /Apache-2.0/);
  const key = [...storage.keys()].find(key => key.endsWith('/license'));
  const lastSuccess = storage.get(key);
  const failed = loadScript(paginatedFetch([project]), {
    storage, now: CACHE_TEST_TIME + 600_000, licenseFetch: async () => ({ ok: false, status: 503 }),
  });
  await failed.ready;
  assert.match(failed.document.getElementById(failed.licenseElementId('sample')).innerHTML, /Apache-2.0/);
  assert.equal(storage.get(key), lastSuccess);
});

test('validates cached licenses and renders live licenses when storage is blocked', async () => {
  for (const blocked of [false, true]) {
    const storage = new Map();
    const key = 'github-directory:v1:myowinthein:https://api.github.com/repos/myowinthein/sample/license';
    storage.set(key, JSON.stringify({ data: license({ html_url: 'data:text/html,unsafe' }), link: '', savedAt: CACHE_TEST_TIME }));
    let requests = 0;
    const sandbox = loadScript(paginatedFetch([repo('sample', { license: { spdx_id: 'MIT' } })]), {
      storage, now: CACHE_TEST_TIME + 1000,
      storageApi: blocked ? { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); } } : undefined,
      licenseFetch: async () => { requests += 1; return response(license()); },
    });
    await sandbox.ready;
    assert.equal(requests, 1);
    const slot = sandbox.document.getElementById(sandbox.licenseElementId('sample'));
    assert.equal(slot.hidden, false);
    assert.doesNotMatch(slot.innerHTML, /data:text/);
  }
});

test('omits topics and their disclosure even when repositories supply topics', async () => {
  const sandbox = loadScript(paginatedFetch([
    repo('sample', { topics: ['topic-one', 'topic-two', 'topic-three', 'topic-four'] }),
  ]));
  await sandbox.ready;
  const html = sandbox.document.getElementById('grid').innerHTML;
  assert.doesNotMatch(html, /topic-one|card-topics|more-topics|<details|<summary/);
  assert.match(html, />Source<\/span>/);
});

test('requires explicit archived status and tolerates malformed optional repository data', async () => {
  const sandbox = loadScript(paginatedFetch([
    repo('invalid-optionals', { archived: 'true', homepage: 123 }),
    repo('archived', { archived: true }),
  ]));
  await sandbox.ready;
  const html = sandbox.document.getElementById('grid').innerHTML;
  assert.equal(cardCount(html), 2);
  assert.equal((html.match(/class="card-status"/g) || []).length, 1);
  assert.doesNotMatch(html, /Website/);
});

test('requests latest releases only for confirmed visible projects, including on Load more', async () => {
  const urls = [];
  const sandbox = loadScript(paginatedFetch([
    repo('first'), repo('myowinthein.github.io'), repo('fork', { fork: true }),
    repo('private', { private: true }), repo('other-owner', { owner: { login: 'other' } }),
    repo('encoded name'), repo('later'),
  ]), { releaseFetch: async url => { urls.push(url); return response(release()); } });
  await sandbox.ready;
  assert.deepEqual(urls, [
    'https://api.github.com/repos/myowinthein/first/releases/latest',
    'https://api.github.com/repos/myowinthein/encoded%20name/releases/latest',
  ]);
  await sandbox.document.getElementById('load-more').click();
  assert.equal(urls.at(-1), 'https://api.github.com/repos/myowinthein/later/releases/latest');
  assert.equal(urls.length, 3);
});

test('keeps cards usable and preserves nodes while independent release requests are pending', async () => {
  let finishRelease;
  const sandbox = loadScript(paginatedFetch([repo('sample')]), {
    profileFetch: async () => response({ name: 'Current name' }),
    releaseFetch: () => new Promise(resolve => { finishRelease = resolve; }),
  });
  // Drain resolved API/JSON promises without waiting on the deliberately pending release.
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  const get = id => sandbox.document.getElementById(id);
  assert.equal(typeof finishRelease, 'function');
  assert.equal(get('grid').getAttribute('aria-busy'), 'false');
  assert.equal(get('load-more').disabled, false);
  assert.equal(get('profile-name').textContent, 'Current name');
  const nodes = [...get('grid').children];
  const slot = get(sandbox.releaseElementId('sample'));
  assert.equal(slot.hidden, true);
  finishRelease(response(release({ tag_name: '<v1>"', html_url: 'https://example.com/?a=1&b=2' })));
  await sandbox.ready;
  assert.deepEqual(get('grid').children, nodes);
  assert.equal(get(sandbox.releaseElementId('sample')), slot);
  assert.equal(slot.hidden, false);
  assert.match(slot.innerHTML, /&lt;v1&gt;&quot;/);
  assert.match(slot.innerHTML, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.match(slot.innerHTML, /aria-label="Release /);
  assert.match(slot.innerHTML, /rel="noopener noreferrer"/);
  assert.doesNotMatch(slot.innerHTML, /\starget=|<v1>/);
});

test('omits missing, unavailable, unsafe, blank, draft, or prerelease versions without failing cards', async () => {
  const cases = [
    { ok: false, status: 404 }, { ok: false, status: 403 },
    response({}), response(null), response(release({ tag_name: ' ' })),
    response(release({ html_url: 'javascript:alert(1)' })),
    response(release({ draft: true })), response(release({ prerelease: true })),
    { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } },
  ];
  for (const result of cases) {
    const storage = new Map();
    const sandbox = loadScript(paginatedFetch([repo('sample')]), { storage, releaseFetch: async () => result });
    await sandbox.ready;
    const get = id => sandbox.document.getElementById(id);
    assert.equal(get(sandbox.releaseElementId('sample')).hidden, true);
    assert.match(get('grid').innerHTML, />Source<\/span>/);
    assert.equal(get('project-status').textContent, 'All 1 project loaded.');
    assert.ok(![...storage.keys()].some(key => key.includes('/releases/latest')));
  }
});

test('caches release responses, refreshes expired versions, and retains them after a failed refresh', async () => {
  const storage = new Map();
  const first = loadScript(paginatedFetch([repo('sample')]), {
    storage, now: CACHE_TEST_TIME, releaseFetch: async () => response(release()),
  });
  await first.ready;
  let requests = 0;
  const fresh = loadScript(paginatedFetch([repo('sample')]), {
    storage, now: CACHE_TEST_TIME + 1000,
    releaseFetch: async () => { requests += 1; throw new Error('Unexpected request'); },
  });
  await fresh.ready;
  assert.equal(requests, 0);
  assert.match(fresh.document.getElementById(fresh.releaseElementId('sample')).innerHTML, /v1.2.3/);
  let finishRelease;
  const stale = loadScript(paginatedFetch([repo('sample')]), {
    storage, now: CACHE_TEST_TIME + 300_000,
    releaseFetch: () => new Promise(resolve => { finishRelease = resolve; }),
  });
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  const slot = stale.document.getElementById(stale.releaseElementId('sample'));
  const link = slot.firstElementChild;
  assert.match(slot.innerHTML, /v1.2.3/);
  finishRelease(response(release({ tag_name: 'v2.0.0' })));
  await stale.ready;
  assert.match(slot.innerHTML, /v2.0.0/);
  assert.equal(slot.firstElementChild, link);
  const key = [...storage.keys()].find(key => key.includes('/releases/latest'));
  const lastSuccess = storage.get(key);
  const failure = loadScript(paginatedFetch([repo('sample')]), {
    storage, now: CACHE_TEST_TIME + 600_000, releaseFetch: async () => ({ ok: false, status: 503 }),
  });
  await failure.ready;
  assert.match(failure.document.getElementById(failure.releaseElementId('sample')).innerHTML, /v2.0.0/);
  assert.equal(storage.get(key), lastSuccess);
});

test('revalidates cached releases and loads releases even when browser storage is blocked', async () => {
  for (const blocked of [false, true]) {
    const storage = new Map();
    const key = 'github-directory:v1:myowinthein:https://api.github.com/repos/myowinthein/sample/releases/latest';
    storage.set(key, JSON.stringify({ data: release({ html_url: 'javascript:alert(1)' }), link: '', savedAt: CACHE_TEST_TIME }));
    let requests = 0;
    const sandbox = loadScript(paginatedFetch([repo('sample')]), {
      storage, now: CACHE_TEST_TIME + 1000,
      storageApi: blocked ? { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); } } : undefined,
      releaseFetch: async () => { requests += 1; return response(release()); },
    });
    await sandbox.ready;
    assert.equal(requests, 1);
    const slot = sandbox.document.getElementById(sandbox.releaseElementId('sample'));
    assert.equal(slot.hidden, false);
    assert.doesNotMatch(slot.innerHTML, /javascript:/);
  }
});

test('does not fetch releases for unconfirmed cached previews', async () => {
  const storage = new Map();
  await seedCache(storage);
  let requests = 0;
  const sandbox = loadScript(async () => ({ ok: false, status: 503 }), {
    storage, now: CACHE_TEST_TIME + 300_000,
    releaseFetch: async () => { requests += 1; return response(release()); },
  });
  await sandbox.ready;
  assert.equal(requests, 0);
  assert.match(sandbox.document.getElementById('grid').innerHTML, /cached-project/);
});

test('fetches six projects initially and appends more only when requested', async () => {
  const repositories = Array.from({ length: 13 }, (_, i) => repo(`project-${i}`));
  const requests = [];
  const sandbox = loadScript(paginatedFetch(repositories, requests));
  await sandbox.ready;
  const grid = sandbox.document.getElementById('grid');
  const button = sandbox.document.getElementById('load-more');
  assert.equal(requests.length, 1);
  assert.equal(cardCount(grid.innerHTML), 6);
  const initialCards = [...grid.children];
  assert.doesNotMatch(grid.innerHTML, /project-6/);
  assert.equal(button.hidden, false);

  await button.click();
  assert.equal(requests.length, 2);
  assert.equal(cardCount(grid.innerHTML), 12);
  assert.deepEqual(grid.children.slice(0, 6), initialCards);
  assert.equal(sandbox.document.getElementById('project-status').textContent, '');
  await button.click();
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map(url => url.searchParams.get('page')), ['1', '2', '3']);
  assert.ok(requests.every(url => url.searchParams.get('sort') === 'updated'));
  assert.ok(requests.every(url => url.searchParams.get('per_page') === '6'));
  const html = grid.innerHTML;
  assert.equal(cardCount(html), 13);
  assert.deepEqual(grid.children.slice(0, 6), initialCards);
  const renderedNames = cardNames(html);
  assert.deepEqual(renderedNames, repositories.map(r => r.name));
  assert.equal(button.hidden, true);
  assert.equal(sandbox.document.getElementById('project-status').textContent, 'All 13 projects loaded.');
  await button.click();
  assert.equal(requests.length, 3);
});

test('leaves later API pages for a click when filtering makes the first batch short', async () => {
  const requests = [];
  const sandbox = loadScript(paginatedFetch([
    repo('fork', { fork: true }), repo('alpha'), repo('myowinthein.github.io'),
    repo('beta'), repo('gamma'), repo('delta'), repo('epsilon'),
  ], requests));
  await sandbox.ready;
  const grid = sandbox.document.getElementById('grid');
  assert.equal(requests.length, 1);
  assert.deepEqual(cardNames(grid.innerHTML),
    ['alpha', 'beta', 'gamma', 'delta']);
  await sandbox.document.getElementById('load-more').click();
  assert.equal(requests.length, 2);
  assert.deepEqual(cardNames(grid.innerHTML),
    ['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
  assert.equal(sandbox.document.getElementById('load-more').hidden, true);
});

test('shows all five eligible projects in one request when six repos include self', async () => {
  const requests = [];
  const sandbox = loadScript(paginatedFetch([
    repo('myowinthein.github.io'), ...Array.from({ length: 5 }, (_, i) => repo(`project-${i}`)),
  ], requests));
  await sandbox.ready;
  assert.equal(requests.length, 1);
  assert.equal(cardCount(sandbox.document.getElementById('grid').innerHTML), 5);
  assert.equal(sandbox.document.getElementById('load-more').hidden, true);
  await sandbox.document.getElementById('load-more').click();
  assert.equal(requests.length, 1);
});

test('uses Link rather than batch size to recognize an exactly full last page', async () => {
  let requests = 0;
  const sandbox = loadScript(async () => {
    requests += 1;
    const result = response(Array.from({ length: 6 }, (_, i) => repo(`project-${i}`)));
    result.headers.get = () => '<https://api.github.com/users/myowinthein/repos?page=1>; rel="prev"';
    return result;
  });
  await sandbox.ready;
  assert.equal(requests, 1);
  assert.equal(sandbox.document.getElementById('load-more').hidden, true);
});

test('keeps displayed cards after a later failure and retries the same API page', async () => {
  const requests = [];
  const sandbox = loadScript(async url => {
    const page = new URL(url).searchParams.get('page');
    requests.push(page);
    if (requests.length === 2) return { ok: false, status: 503 };
    return response(page === '1' ? [repo('alpha'), repo('beta'), repo('gamma')] : [repo('delta')], page === '1');
  });
  await sandbox.ready;
  const grid = sandbox.document.getElementById('grid');
  const initialCards = grid.innerHTML;
  const initialNodes = [...grid.children];
  const button = sandbox.document.getElementById('load-more');
  await button.click();
  assert.equal(grid.innerHTML, initialCards);
  assert.deepEqual(grid.children, initialNodes);
  assert.equal(sandbox.document.getElementById('project-status').textContent, '');
  assert.equal(button.hidden, true);
  await sandbox.runNextRetry();
  assert.deepEqual(requests, ['1', '2', '2']);
  assert.equal(cardCount(grid.innerHTML), 4);
  assert.deepEqual(grid.children.slice(0, 3), initialNodes);
  assert.equal(button.hidden, true);
});

test('skips fully excluded pages and retries a failed next page without starting over', async () => {
  const requests = [];
  const sandbox = loadScript(async url => {
    const page = new URL(url).searchParams.get('page');
    requests.push(page);
    if (requests.length === 2) throw new TypeError('Network request failed');
    if (page === '1') return response([repo('fork', { fork: true }), repo('myowinthein.github.io')], true);
    if (page === '2') return response([repo('beta'), repo('gamma'), repo('delta')]);
    return response([]);
  });
  await sandbox.ready;
  const button = sandbox.document.getElementById('load-more');
  const grid = sandbox.document.getElementById('grid');
  assert.match(grid.innerHTML, /Browse public repositories/);
  await sandbox.runNextRetry();
  assert.deepEqual(requests, ['1', '2', '2']);
  assert.deepEqual(cardNames(grid.innerHTML),
    ['beta', 'gamma', 'delta']);
  assert.equal(cardCount(grid.innerHTML), 3);
  assert.equal(button.hidden, true);
});

test('ignores repeated load requests while an API page is in flight', async () => {
  let finishPage;
  let requests = 0;
  const sandbox = loadScript(async () => {
    requests += 1;
    if (requests === 1) return response([repo('alpha'), repo('beta'), repo('gamma')], true);
    return new Promise(resolve => { finishPage = resolve; });
  });
  await sandbox.ready;
  const button = sandbox.document.getElementById('load-more');
  const grid = sandbox.document.getElementById('grid');
  const pending = button.click();
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-disabled'), 'true');
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.getAttribute('aria-label'), 'Loading more projects');
  assert.equal(button.textContent, 'Load more');
  assert.equal(sandbox.document.getElementById('project-status').textContent, '');
  assert.equal(grid.getAttribute('aria-busy'), 'true');
  button.click();
  await sandbox.loadMoreProjects();
  assert.equal(requests, 2);
  finishPage(response([repo('delta')]));
  await pending;
  assert.equal(grid.getAttribute('aria-busy'), 'false');
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-disabled'), 'false');
  assert.equal(button.getAttribute('aria-busy'), 'false');
  assert.equal(cardCount(grid.innerHTML), 4);
});

for (const hasMore of [false, true]) {
  test(`continues keyboard focus into newly appended projects with more pages ${hasMore}`, async () => {
    let finishPage;
    const sandbox = loadScript(async url => {
      if (new URL(url).searchParams.get('page') === '1') return response([repo('alpha')], true);
      return new Promise(resolve => { finishPage = resolve; });
    });
    await sandbox.ready;
    const get = id => sandbox.document.getElementById(id);
    const button = get('load-more');
    button.focus();
    const pending = button.click();
    assert.equal(sandbox.document.activeElement, button);
    assert.equal(button.disabled, false);
    finishPage(response([repo('beta'), repo('gamma')], hasMore));
    await pending;
    const firstNewHeading = get('grid').children[1].querySelector('.card-name');
    assert.equal(sandbox.document.activeElement, firstNewHeading);
    assert.equal(firstNewHeading.getAttribute('tabindex'), '-1');
    assert.equal(button.hidden, !hasMore);
    assert.equal(button.getAttribute('aria-label'), 'Load more');
  });
}

test('moves focus to existing content when a failed batch hides Load more', async () => {
  let finishPage;
  const sandbox = loadScript(async url => {
    if (new URL(url).searchParams.get('page') === '1') return response([repo('alpha')], true);
    return new Promise(resolve => { finishPage = resolve; });
  });
  await sandbox.ready;
  const button = sandbox.document.getElementById('load-more');
  button.focus();
  const pending = button.click();
  finishPage({ ok: false, status: 503 });
  await pending;
  assert.equal(sandbox.document.activeElement, sandbox.document.getElementById('grid').children[0].querySelector('.card-name'));
  assert.equal(button.getAttribute('aria-busy'), 'false');
  assert.equal(button.getAttribute('aria-disabled'), 'false');
  assert.equal(button.getAttribute('aria-label'), 'Load more');
  assert.equal(button.hidden, true);
  assert.equal(sandbox.document.getElementById('project-status').textContent, '');
});

test('does not pull focus back after the user tabs away while loading', async () => {
  let finishPage;
  const sandbox = loadScript(async url => {
    if (new URL(url).searchParams.get('page') === '1') return response([repo('alpha')], true);
    return new Promise(resolve => { finishPage = resolve; });
  });
  await sandbox.ready;
  const button = sandbox.document.getElementById('load-more');
  const otherControl = sandbox.document.getElementById('theme-toggle');
  button.focus();
  const pending = button.click();
  otherControl.focus();
  finishPage(response([repo('beta')]));
  await pending;
  assert.equal(sandbox.document.activeElement, otherControl);
});

test('moves focus to the final count when the remaining page has no eligible projects', async () => {
  const sandbox = loadScript(async url => new URL(url).searchParams.get('page') === '1'
    ? response([repo('alpha')], true) : response([repo('fork', { fork: true })]));
  await sandbox.ready;
  const button = sandbox.document.getElementById('load-more');
  button.focus();
  await button.click();
  const status = sandbox.document.getElementById('project-status');
  assert.equal(sandbox.document.activeElement, status);
  assert.equal(status.textContent, 'All 1 project loaded.');
  assert.equal(button.hidden, true);
});

test('does not repeat cards when repositories move between API pages', async () => {
  const sandbox = loadScript(async url => {
    const page = new URL(url).searchParams.get('page');
    if (page === '1') return response([repo('alpha'), repo('beta'), repo('gamma')], true);
    if (page === '2') return response([repo('gamma'), repo('delta'), repo('epsilon')], true);
    return response([repo('zeta')]);
  });
  await sandbox.ready;
  await sandbox.document.getElementById('load-more').click();
  await sandbox.document.getElementById('load-more').click();
  const grid = sandbox.document.getElementById('grid');
  assert.deepEqual(cardNames(grid.innerHTML),
    ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']);
});

test('uses safe homepages and escapes API text and URL attributes', async () => {
  const sandbox = loadScript(paginatedFetch([
    repo('website', { homepage: 'https://example.com/?a=1&b=2', description: '<img src=x onerror=alert(1)>' }),
    repo('unsafe', { homepage: 'javascript:alert(1)' }),
    repo('invalid', { homepage: 'not a URL' }),
    repo('<script>'),
  ]));
  await sandbox.ready;
  await sandbox.document.getElementById('load-more').click();
  const html = sandbox.document.getElementById('grid').innerHTML;
  assert.match(html, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.match(html, /Website<\/span><\/a>/);
  assert.match(html, /href="https:\/\/github.com\/myowinthein\/unsafe"/);
  assert.match(html, /href="https:\/\/github.com\/myowinthein\/invalid"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /javascript:|<img|<script>/);
  assert.match(html, /href="https:\/\/github.com\/myowinthein\/website"/);
  assert.doesNotMatch(html, /\starget=/);
  assert.equal((html.match(/<a [^>]*rel="noopener noreferrer"/g) || []).length, (html.match(/<a /g) || []).length);
});

test('uses current GitHub copy for every project without maintained overrides', async () => {
  const sandbox = loadScript(paginatedFetch([
    repo('agent-helm', { homepage: 'https://myowinthein.github.io/agent-helm/', description: 'Updated description from GitHub.' }),
    repo('new-project', { description: 'Description from GitHub.' }),
    repo('toString', { description: 'A valid repository name.' }),
  ]));
  await sandbox.ready;
  const html = sandbox.document.getElementById('grid').innerHTML;
  assert.match(html, /<article class="card">/);
  assert.match(html, /<h3 class="card-name">agent-helm<\/h3>/);
  assert.match(html, /Updated description from GitHub\./);
  assert.doesNotMatch(html, /Reusable development workflows for Claude and Codex\./);
  assert.match(html, /href="https:\/\/myowinthein.github.io\/agent-helm\/"/);
  assert.match(html, /href="https:\/\/github.com\/myowinthein\/agent-helm"/);
  assert.match(html, /Description from GitHub\./);
  assert.match(html, /A valid repository name\./);
  assert.doesNotMatch(html, /function toString/);
});

test('shows an empty state when no repos qualify', async () => {
  const sandbox = loadScript(async () => response([repo('fork', { fork: true })]));
  await sandbox.ready;
  assert.match(sandbox.document.getElementById('grid').innerHTML, /No projects found/);
});

for (const scenario of [
  {
    name: 'the first API page returns an HTTP error',
    makeFetch: () => async () => ({ ok: false, status: 403 }),
  },
  {
    name: 'the GitHub request rejects',
    makeFetch: () => async () => { throw new TypeError('Network request failed'); },
  },
  {
    name: 'the GitHub response has invalid JSON',
    makeFetch: () => async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Invalid JSON'); },
    }),
  },
]) {
  test(`keeps a quiet GitHub fallback when ${scenario.name}`, async () => {
    const sandbox = loadScript(scenario.makeFetch());
    await sandbox.ready;
    assert.match(sandbox.document.getElementById('grid').innerHTML, /https:\/\/github.com\/myowinthein\?tab=repositories/);
    assert.equal(sandbox.document.getElementById('project-status').textContent, '');
    const button = sandbox.document.getElementById('load-more');
    assert.equal(button.textContent, 'Load more');
    assert.equal(button.hidden, true);
    assert.equal(button.disabled, false);
  });
}
