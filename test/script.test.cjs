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
function loadScript() {
  const code = fs.readFileSync(path.join(__dirname, '../assets/script.js'), 'utf8');
  const sandbox = {
    document: {
      documentElement: { setAttribute() {}, getAttribute() { return null; } },
      getElementById() { return { addEventListener() {}, textContent: '', innerHTML: '' }; },
    },
    window: { matchMedia() { return { matches: false }; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    fetch() { return Promise.resolve({ ok: false, status: 404 }); },
    URL,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
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
