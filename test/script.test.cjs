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
function element() {
  const attributes = new Map();
  const handlers = new Map();
  return {
    innerHTML: '', textContent: '', hidden: false, disabled: false,
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    addEventListener(type, handler) { handlers.set(type, handler); },
    click() { if (!this.disabled) return handlers.get('click')?.(); },
    insertAdjacentHTML(position, html) {
      assert.equal(position, 'beforeend');
      this.innerHTML += html;
    },
  };
}

function loadScript(
  fetchImpl = () => Promise.resolve({ ok: false, status: 404 }),
  { savedTheme = null, prefersDark = false, storage = new Map() } = {},
) {
  const code = fs.readFileSync(path.join(__dirname, '../assets/script.js'), 'utf8');
  const attributes = new Map();
  if (savedTheme !== null) storage.set('theme', savedTheme);
  const elements = {
    grid: element(),
    'theme-toggle': element(),
    'load-more': element(),
    'project-status': element(),
  };
  const sandbox = {
    document: {
      documentElement: {
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name) ?? null; },
      },
      getElementById(id) { return elements[id]; },
    },
    window: { matchMedia() { return { matches: prefersDark }; } },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
    },
    fetch: fetchImpl,
    URL,
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

test('persists theme toggles and restores the choice on reload', async () => {
  const storage = new Map();
  const sandbox = loadScript(undefined, { storage });
  await sandbox.ready;
  const root = sandbox.document.documentElement;
  const button = sandbox.document.getElementById('theme-toggle');

  assert.equal(root.getAttribute('data-theme'), 'light');
  button.click();
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(storage.get('theme'), 'dark');
  button.click();
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(storage.get('theme'), 'light');

  const reloaded = loadScript(undefined, { storage, prefersDark: true });
  await reloaded.ready;
  assert.equal(reloaded.document.documentElement.getAttribute('data-theme'), 'light');
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

function response(repos) {
  return { ok: true, json: async () => repos };
}

function paginatedFetch(repositories, requests = []) {
  return async url => {
    const request = new URL(url);
    requests.push(request);
    if (requests.length > repositories.length + 1) throw new Error('Pagination did not finish');
    const page = Number(request.searchParams.get('page'));
    const perPage = Number(request.searchParams.get('per_page'));
    return response(repositories.slice((page - 1) * perPage, page * perPage));
  };
}

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
  assert.match(html, /View repository →/);
});

test('fetches three projects initially and appends more only when requested', async () => {
  const repositories = Array.from({ length: 7 }, (_, i) => repo(`project-${i}`));
  const requests = [];
  const sandbox = loadScript(paginatedFetch(repositories, requests));
  await sandbox.ready;
  const grid = sandbox.document.getElementById('grid');
  const button = sandbox.document.getElementById('load-more');
  assert.equal(requests.length, 1);
  assert.equal((grid.innerHTML.match(/class="card"/g) || []).length, 3);
  assert.doesNotMatch(grid.innerHTML, /project-3/);
  assert.equal(button.hidden, false);

  await button.click();
  assert.equal(requests.length, 2);
  assert.equal((grid.innerHTML.match(/class="card"/g) || []).length, 6);
  await button.click();
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map(url => url.searchParams.get('page')), ['1', '2', '3']);
  assert.ok(requests.every(url => url.searchParams.get('sort') === 'updated'));
  assert.ok(requests.every(url => url.searchParams.get('per_page') === '3'));
  const html = grid.innerHTML;
  assert.equal((html.match(/class="card"/g) || []).length, 7);
  const renderedNames = Array.from(html.matchAll(/class="card-name">([^<]+)<\/div>/g), match => match[1]);
  assert.deepEqual(renderedNames, repositories.map(r => r.name));
  assert.equal(button.hidden, true);
  assert.equal(sandbox.document.getElementById('project-status').textContent, 'All projects loaded.');
  await button.click();
  assert.equal(requests.length, 3);
});

test('fills batches across excluded repositories and retains extra eligible projects', async () => {
  const requests = [];
  const sandbox = loadScript(paginatedFetch([
    repo('fork', { fork: true }), repo('alpha'), repo('myowinthein.github.io'),
    repo('beta'), repo('gamma'), repo('delta'), repo('epsilon'),
  ], requests));
  await sandbox.ready;
  const grid = sandbox.document.getElementById('grid');
  assert.equal(requests.length, 2);
  assert.deepEqual(Array.from(grid.innerHTML.matchAll(/class="card-name">([^<]+)</g), m => m[1]),
    ['alpha', 'beta', 'gamma']);
  await sandbox.document.getElementById('load-more').click();
  assert.equal(requests.length, 3);
  assert.deepEqual(Array.from(grid.innerHTML.matchAll(/class="card-name">([^<]+)</g), m => m[1]),
    ['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
  assert.equal(sandbox.document.getElementById('load-more').hidden, true);
});

test('keeps displayed cards after a later failure and retries the same API page', async () => {
  const requests = [];
  const sandbox = loadScript(async url => {
    const page = new URL(url).searchParams.get('page');
    requests.push(page);
    if (requests.length === 2) return { ok: false, status: 403 };
    return response(page === '1' ? [repo('alpha'), repo('beta'), repo('gamma')] : [repo('delta')]);
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
  assert.equal((grid.innerHTML.match(/class="card"/g) || []).length, 4);
  assert.equal(button.hidden, true);
});

test('retains successful partial results when an initial batch needs a retry', async () => {
  const requests = [];
  const sandbox = loadScript(async url => {
    const page = new URL(url).searchParams.get('page');
    requests.push(page);
    if (requests.length === 2) throw new TypeError('Network request failed');
    if (page === '1') return response([repo('alpha'), repo('fork', { fork: true }), repo('myowinthein.github.io')]);
    if (page === '2') return response([repo('beta'), repo('gamma'), repo('delta')]);
    return response([]);
  });
  await sandbox.ready;
  const button = sandbox.document.getElementById('load-more');
  const grid = sandbox.document.getElementById('grid');
  assert.equal(grid.innerHTML, '');
  await button.click();
  assert.deepEqual(requests, ['1', '2', '2']);
  assert.deepEqual(Array.from(grid.innerHTML.matchAll(/class="card-name">([^<]+)</g), m => m[1]),
    ['alpha', 'beta', 'gamma']);
  await button.click();
  assert.equal((grid.innerHTML.match(/class="card"/g) || []).length, 4);
  assert.match(grid.innerHTML, /delta/);
  assert.equal(button.hidden, true);
});

test('ignores repeated load requests while an API page is in flight', async () => {
  let finishPage;
  let requests = 0;
  const sandbox = loadScript(async () => {
    requests += 1;
    if (requests === 1) return response([repo('alpha'), repo('beta'), repo('gamma')]);
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
  assert.equal((grid.innerHTML.match(/class="card"/g) || []).length, 4);
});

test('does not repeat cards when repositories move between API pages', async () => {
  const sandbox = loadScript(async url => {
    const page = new URL(url).searchParams.get('page');
    if (page === '1') return response([repo('alpha'), repo('beta'), repo('gamma')]);
    if (page === '2') return response([repo('gamma'), repo('delta'), repo('epsilon')]);
    return response([repo('zeta')]);
  });
  await sandbox.ready;
  await sandbox.document.getElementById('load-more').click();
  const grid = sandbox.document.getElementById('grid');
  assert.deepEqual(Array.from(grid.innerHTML.matchAll(/class="card-name">([^<]+)</g), m => m[1]),
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
  assert.match(html, /View site →/);
  assert.match(html, /href="https:\/\/github.com\/myowinthein\/unsafe"/);
  assert.match(html, /href="https:\/\/github.com\/myowinthein\/invalid"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /javascript:|<img|<script>/);
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
    assert.equal(sandbox.document.getElementById('grid').innerHTML, '');
    assert.equal(sandbox.document.getElementById('project-status').textContent,
      'Could not load projects. Try again.');
    const button = sandbox.document.getElementById('load-more');
    assert.equal(button.textContent, 'Try again');
    assert.equal(button.hidden, false);
    assert.equal(button.disabled, false);
  });
}
