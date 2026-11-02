const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Loads the real assets/script.js in a sandboxed context, stubbing the DOM
// APIs its top-level theme/fetch code touches on load. Top-level function
// declarations (escapeHtml, safeUrl, applyTheme) become properties of the
// sandbox, so we can test the actual shipped code with no source changes
// and no npm/jsdom dependency.
const ELEMENT_IDS = [
  'grid', 'theme-toggle', 'load-more', 'project-status', 'profile-name', 'profile-bio',
  'profile-location', 'profile-links', 'page-description', 'page-og-title', 'page-og-description',
];

function element() {
  const attributes = new Map();
  const handlers = new Map();
  return {
    innerHTML: '', textContent: '', hidden: false, disabled: false,
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    addEventListener(type, handler) { handlers.set(type, handler); },
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
  } = {},
) {
  const code = fs.readFileSync(path.join(__dirname, '../assets/script.js'), 'utf8');
  const attributes = new Map();
  if (savedTheme !== null) storage.set('theme', savedTheme);
  const elements = Object.fromEntries(ELEMENT_IDS.map(id => [id, element()]));
  elements['profile-name'].textContent = 'myowinthein';
  elements['profile-bio'].hidden = true;
  elements['profile-location'].hidden = true;
  elements['profile-links'].innerHTML = '<a href="https://github.com/myowinthein">GitHub</a>';
  elements.grid.innerHTML = '<p><a href="https://github.com/myowinthein?tab=repositories">Browse public repositories</a></p>';
  const sandbox = {
    document: {
      title: 'myowinthein | Public projects',
      documentElement: {
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name) ?? null; },
      },
      getElementById(id) { return elements[id]; },
    },
    window: { matchMedia() { return { matches: prefersDark }; } },
    localStorage: storageApi || {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
    },
    fetch(url) {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/social_accounts')) return socialFetch(url);
      if (pathname.endsWith('/repos')) return fetchImpl(url);
      return profileFetch(url);
    },
    URL,
    Date: class extends Date { static now() { return now; } },
  };
  vm.createContext(sandbox);
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
  assert.equal(get('project-status').textContent, 'Showing cached projects…');
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

test('retains expired data after API errors and retries the failed project page without duplicates', async () => {
  const storage = new Map();
  await seedCache(storage);
  const pages = [];
  let recover = false;
  const sandbox = loadScript(async url => {
    pages.push(new URL(url).searchParams.get('page'));
    return recover ? response([repo('recovered-project')]) : { ok: false, status: 403 };
  }, {
    storage, now: CACHE_TEST_TIME + 5 * 60 * 1000,
    profileFetch: async () => { throw new TypeError('Network unavailable'); },
    socialFetch: async () => ({ ok: false, status: 503 }),
  });
  await sandbox.ready;
  const get = id => sandbox.document.getElementById(id);
  assert.equal(get('profile-name').textContent, 'Cached Name');
  assert.match(get('profile-links').innerHTML, /Medium/);
  assert.match(get('grid').innerHTML, /cached-project/);
  assert.equal(get('project-status').textContent, 'Showing cached projects. Could not refresh. Try again.');
  assert.equal(get('load-more').hidden, false);
  assert.equal(get('load-more').disabled, false);
  recover = true;
  await get('load-more').click();
  assert.deepEqual(pages, ['1', '1']);
  assert.match(get('grid').innerHTML, /recovered-project/);
  assert.doesNotMatch(get('grid').innerHTML, /cached-project/);
  assert.equal(cardCount(get('grid').innerHTML), 1);
  assert.equal(get('load-more').hidden, true);
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
  const storage = new Map([['theme', 'dark'], ['other-app-key', 'keep']]);
  const sandbox = loadScript(undefined, { storage });
  await sandbox.ready;
  assert.deepEqual(Array.from(storage), [['theme', 'dark'], ['other-app-key', 'keep']]);
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

test('replaces a failed cached later-page preview while preserving earlier cards', async () => {
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
  }, { storage, now: CACHE_TEST_TIME + 5 * 60 * 1000 });
  await nextVisit.ready;
  const get = id => nextVisit.document.getElementById(id);
  await get('load-more').click();
  assert.equal(cardCount(get('grid').innerHTML), 12);
  assert.match(get('project-status').textContent, /Showing cached projects/);
  recover = true;
  await get('load-more').click();
  assert.deepEqual(pages, ['1', '2', '2']);
  assert.equal(cardCount(get('grid').innerHTML), 8);
  assert.match(get('grid').innerHTML, /cached-0/);
  assert.match(get('grid').innerHTML, /updated-6/);
  assert.doesNotMatch(get('grid').innerHTML, />cached-6</);
  assert.equal(get('load-more').hidden, true);
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
  assert.equal(storage.get('theme'), 'dark');
  button.click();
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(storage.get('theme'), 'light');

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

test('index.html provides every element the script reads and keeps scripts and styles external', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const id of ELEMENT_IDS) assert.match(html, new RegExp(`\\sid="${id}"`), `missing id ${id}`);
  assert.match(html, /<script src="assets\/script\.js"><\/script>/);
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
      return response({ name: 'Current GitHub Name', bio: 'Current GitHub bio.', location: 'Current location', blog: 'https://example.com/' });
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
  assert.equal(get('profile-name').textContent, 'Current GitHub Name');
  assert.equal(get('profile-bio').textContent, 'Current GitHub bio.');
  assert.equal(get('profile-location').textContent, 'Current location');
  assert.equal(get('profile-bio').hidden, false);
  assert.equal(get('profile-location').hidden, false);
  assert.equal(sandbox.document.title, 'Current GitHub Name | Public projects');
  assert.equal(get('page-description').getAttribute('content'), 'Current GitHub bio.');
  assert.equal(get('page-og-title').getAttribute('content'), sandbox.document.title);
  assert.equal(get('page-og-description').getAttribute('content'), 'Current GitHub bio.');
  const links = get('profile-links').innerHTML;
  assert.match(links, /href="https:\/\/example.com\/">Website/);
  assert.match(links, /href="https:\/\/github.com\/myowinthein">GitHub/);
  assert.match(links, /href="https:\/\/www.linkedin.com\/in\/example\/">LinkedIn/);
  assert.match(links, /href="https:\/\/example.medium.com\/">Medium/);
  assert.ok(urls.includes('https://api.github.com/users/myowinthein'));
  assert.ok(urls.includes('https://api.github.com/users/myowinthein/social_accounts?per_page=100&page=1'));
});

test('treats profile text as plain text and validates and escapes social URLs and labels', async () => {
  const name = '<img src=x onerror=alert(1)>';
  const bio = '<script>alert(1)</script>';
  const sandbox = loadScript(undefined, {
    profileFetch: async () => response({ name, bio, blog: 'javascript:alert(1)' }),
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
  const links = get('profile-links').innerHTML;
  assert.match(links, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.match(links, /&lt;img src=x&gt;/);
  assert.doesNotMatch(links, /javascript:|data:|<img|Website/);
});

test('hides missing profile fields and avoids duplicate website and social links', async () => {
  const sandbox = loadScript(undefined, {
    profileFetch: async () => response({ name: null, bio: null, location: ' ', blog: 'https://example.com' }),
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
  assert.equal((get('profile-links').innerHTML.match(/<a /g) || []).length, 2);
  assert.equal(get('page-description').getAttribute('content'), 'Public GitHub projects by myowinthein.');
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
    ]),
  });
  await sandbox.ready;
  const labels = Array.from(
    sandbox.document.getElementById('profile-links').innerHTML.matchAll(/>([^<]+)<\/a>/g), m => m[1]);
  assert.deepEqual(labels, ['GitHub', 'mastodon', 'example.org', 'Medium', 'notmedium.com', 'no-provider.example']);
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
  assert.match(html, /Source →/);
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
  assert.doesNotMatch(grid.innerHTML, /project-6/);
  assert.equal(button.hidden, false);

  await button.click();
  assert.equal(requests.length, 2);
  assert.equal(cardCount(grid.innerHTML), 12);
  assert.equal(sandbox.document.getElementById('project-status').textContent, 'Showing 12 projects.');
  await button.click();
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map(url => url.searchParams.get('page')), ['1', '2', '3']);
  assert.ok(requests.every(url => url.searchParams.get('sort') === 'updated'));
  assert.ok(requests.every(url => url.searchParams.get('per_page') === '6'));
  const html = grid.innerHTML;
  assert.equal(cardCount(html), 13);
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
    if (requests.length === 2) return { ok: false, status: 403 };
    return response(page === '1' ? [repo('alpha'), repo('beta'), repo('gamma')] : [repo('delta')], page === '1');
  });
  await sandbox.ready;
  const grid = sandbox.document.getElementById('grid');
  const initialCards = grid.innerHTML;
  const button = sandbox.document.getElementById('load-more');
  await button.click();
  assert.equal(grid.innerHTML, initialCards);
  assert.equal(sandbox.document.getElementById('project-status').textContent,
    'Could not load more projects. Try again.');
  assert.equal(button.disabled, false);
  await button.click();
  assert.deepEqual(requests, ['1', '2', '2']);
  assert.equal(cardCount(grid.innerHTML), 4);
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
  await button.click();
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
  assert.equal(button.disabled, true);
  assert.equal(grid.getAttribute('aria-busy'), 'true');
  button.click();
  await sandbox.loadMoreProjects();
  assert.equal(requests, 2);
  finishPage(response([repo('delta')]));
  await pending;
  assert.equal(grid.getAttribute('aria-busy'), 'false');
  assert.equal(button.disabled, false);
  assert.equal(cardCount(grid.innerHTML), 4);
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
  assert.match(html, /Project page →/);
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
  test(`shows an error when ${scenario.name}`, async () => {
    const sandbox = loadScript(scenario.makeFetch());
    await sandbox.ready;
    assert.match(sandbox.document.getElementById('grid').innerHTML, /https:\/\/github.com\/myowinthein\?tab=repositories/);
    assert.equal(sandbox.document.getElementById('project-status').textContent,
      'Could not load projects. Try again.');
    const button = sandbox.document.getElementById('load-more');
    assert.equal(button.textContent, 'Try again');
    assert.equal(button.hidden, false);
    assert.equal(button.disabled, false);
  });
}
