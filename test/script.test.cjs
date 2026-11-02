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
function loadScript(fetchImpl = () => Promise.resolve({ ok: false, status: 404 })) {
  const code = fs.readFileSync(path.join(__dirname, '../assets/script.js'), 'utf8');
  const elements = {
    grid: { innerHTML: '' },
    'theme-toggle': { addEventListener() {}, textContent: '' },
  };
  const sandbox = {
    document: {
      documentElement: { setAttribute() {}, getAttribute() { return null; } },
      getElementById(id) { return elements[id]; },
    },
    window: { matchMedia() { return { matches: false }; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    fetch: fetchImpl,
    URL,
  };
  vm.createContext(sandbox);
  sandbox.ready = vm.runInContext(code, sandbox);
  return sandbox;
}

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

test('lists owned public projects without Pages or a homepage, excluding forks and self', async () => {
  const sandbox = loadScript(async () => response([
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

test('loads projects beyond the first 100 repos and preserves updated order', async () => {
  const requests = [];
  const sandbox = loadScript(async url => {
    requests.push(new URL(url));
    return response(requests.length === 1
      ? Array.from({ length: 100 }, (_, i) => repo(`project-${i}`))
      : [repo('last-project')]);
  });
  await sandbox.ready;
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(url => url.searchParams.get('page')), ['1', '2']);
  assert.ok(requests.every(url => url.searchParams.get('sort') === 'updated'));
  const html = sandbox.document.getElementById('grid').innerHTML;
  assert.equal((html.match(/class="card"/g) || []).length, 101);
  assert.ok(html.indexOf('project-0') < html.indexOf('last-project'));
});

test('uses safe homepages and escapes API text and URL attributes', async () => {
  const sandbox = loadScript(async () => response([
    repo('website', { homepage: 'https://example.com/?a=1&b=2', description: '<img src=x onerror=alert(1)>' }),
    repo('unsafe', { homepage: 'javascript:alert(1)' }),
    repo('invalid', { homepage: 'not a URL' }),
    repo('<script>'),
  ]));
  await sandbox.ready;
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

test('shows an error if a later page fails', async () => {
  let requests = 0;
  const sandbox = loadScript(async () => ++requests === 1
    ? response(Array.from({ length: 100 }, (_, i) => repo(`project-${i}`)))
    : { ok: false, status: 403 });
  await sandbox.ready;
  assert.match(sandbox.document.getElementById('grid').innerHTML, /Could not load projects/);
});
