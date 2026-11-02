# myowinthein.github.io

## Project Identity

Personal landing page for Myo Win Thein, hosted on GitHub Pages. Lists the owner's
public GitHub repositories as project cards.

- Stack: plain HTML, CSS, vanilla JavaScript; no framework, build tool, or package manager.
- Deployment: pushing to `main` publishes through GitHub Pages.
- Blast radius: a public personal site; deployed breakage is visible to visitors.

## Project Config

- ship-method: direct
- git-auto-commit: true
- git-merge-strategy: squash
- readme-style: standard

## Dev Commands

- Preview: open `index.html` directly in a browser; no install or local server required.
- Tests: `node --test test/script.test.cjs` with a Node.js version supporting `node:test`.
- JavaScript syntax: `node --check assets/script.js`.
- Tests use Node's built-in VM, DOM stubs, and mocked fetch responses; no npm dependencies.

## Architecture Pointers

- `index.html`: page shell, metadata, theme button, loading state, and external asset links.
- `assets/script.js`: theme initialization/toggle and paginated GitHub fetch/filter/render.
- `assets/style.css`: responsive cards and theme variables; dark overrides use
  `[data-theme="dark"]` on `<html>`.
- `test/script.test.cjs`: runs the shipped script in a VM; covers filtering, pagination,
  link fallback, escaping, and empty/error states.

## Domain Rules

- Include only public, non-fork repositories owned by `myowinthein`; exclude
  `myowinthein.github.io` itself. Owner and self-name comparisons are case-insensitive.
- GitHub Pages and a homepage are optional. Archived repositories remain eligible.
- Fetch every page in updated order, 100 repositories per request, until a shorter page.
- A valid HTTP(S) homepage gets a "View site" link; otherwise use the GitHub repository
  URL and "View repository". Do not restore the old generated Pages URL fallback.
- Theme initialization uses the saved `localStorage.theme` choice when present,
  otherwise the system preference. Toggling saves an explicit light/dark choice.

## Behavior Rules

- Keep the site dependency-free; do not add a build step, package.json, or dependencies
  without an explicit request.
- Work directly on `main` under the project's configured shipping policy.

## Hard Safety Rules

- Never commit secrets; the GitHub API call is unauthenticated and must stay that way.
- Do not add inline `<script>` or `<style>` blocks; keep JS and CSS in `assets/`.
- Treat API-sourced text and URLs as untrusted: use `escapeHtml` for text and URL
  attributes, validate homepage URLs with `safeUrl`, and use the encoded repository
  URL as the fallback. Never interpolate raw API values into HTML.

## Known Traps

- Ownership plus non-fork status is the implemented approximation of "created by the
  user"; the listing does not verify who originally created a transferred repository.
- A failed API request, including any later page, replaces the entire listing with
  the error state. Requests are unauthenticated and subject to GitHub rate limits.
- Theme initialization reads the system preference once; it does not listen for later
  system theme changes. Current tests stub theme APIs rather than asserting theme behavior.
- The favicon URL is `https://myowin.dev/favicon.svg`; no local favicon file is tracked.
  Edit the hosted asset to change its image, or the HTML link to change its location.

## Rules

Read and follow these adopted project rules:
- .claude/rules/git.md
- .claude/rules/safety.md

<!-- last-reviewed: 6f0f7457fc9ce70cc520724b27cb37f795813789 -->
