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
- readme-style: custom

## Dev Commands

- Preview: open `index.html` directly in a browser; no install or local server required.
- Tests: `node --test test/script.test.cjs` with a Node.js version supporting `node:test`.
- JavaScript syntax: `node --check assets/script.js`.
- Tests use Node's built-in VM, DOM stubs, and mocked fetch responses; no npm dependencies.

## Architecture Pointers

- `index.html`: generic account fallback, profile placeholders, accessible shell, and project fallback.
- `assets/script.js`: theme initialization/toggle, public profile/social loading, and
  on-demand GitHub repository fetch/filter/render.
- `assets/style.css`: responsive cards and theme variables; dark overrides use
  `[data-theme="dark"]` on `<html>`.
- `test/script.test.cjs`: runs the shipped script in a VM; covers filtering, pagination,
  storage failures, independent profile/social loading, link safety, and empty/error states.
- `.github/workflows/checks.yml`: dependency-free syntax/tests on pushes and pull requests,
  using Node.js 24. This reports results without gating the legacy Pages deployment.

## Domain Rules

- Include only public, non-fork repositories owned by `myowinthein`; exclude
  `myowinthein.github.io` itself. Owner and self-name comparisons are case-insensitive.
- GitHub Pages and a homepage are optional. Archived repositories remain eligible.
- Request 6 repositories initially; Load more appends the next eligible batch of up
  to 6. Leave short nonempty batches as they are; skip only fully excluded pages.
  Use the GitHub Link header's next relation to detect more pages, not batch length.
- Every card has a Source link to its encoded GitHub repository URL; add a separate
  Project page link only for a valid HTTP(S) homepage. Never generate a Pages URL.
- GitHub is the content source: profile name/bio/location/website and social accounts
  populate the header; repository names/descriptions/homepages populate cards.
  Do not add curated project lists, copy overrides, or duplicate profile details.
- Profile, social-account, and repository requests run independently. Keep generic
  static fallbacks; hide empty optional fields and deduplicate validated links.
  Refresh data on page load without requiring a site commit or deployment, subject
  to the five-minute response cache.
- Cache successful public API responses and Link metadata in localStorage under
  `github-directory:v1:myowinthein:` plus the full request URL. Fresh entries avoid
  API calls; expired entries preview content while refreshing and survive errors.
  Validate cached data/timestamps; blocked, full, or corrupt storage must not break
  live loading. Never cache errors or update a cache timestamp on a failed request.
- Cached project previews do not advance pagination or mark repos seen until a
  successful refresh. Retry must replace the preview without duplicate cards.
- Theme initialization uses the saved `localStorage.theme` choice when present,
  otherwise the system preference. Ignore invalid stored values and tolerate denied
  storage reads/writes so project loading and visible theme changes still work.

## Behavior Rules

- Keep the site dependency-free; do not add a build step, package.json, or dependencies
  without an explicit request.
- Work directly on `main` under the project's configured shipping policy.

## Hard Safety Rules

- Never commit secrets; the GitHub API call is unauthenticated and must stay that way.
- Do not add inline `<script>` or `<style>` blocks; keep JS and CSS in `assets/`.
- Treat API-sourced text and URLs as untrusted: use `textContent` for plain text or
  `escapeHtml` when interpolating HTML text/attributes. Validate external URLs with
  `safeUrl`; skip invalid profile/social URLs and use the encoded repository URL
  for project fallbacks. Never interpolate raw API values into HTML.

## Known Traps

- Ownership plus non-fork status is the implemented approximation of "created by the
  user"; the listing does not verify who originally created a transferred repository.
- A failed API request leaves displayed cards intact. Try again
  retries the failed page. Requests are unauthenticated and subject to GitHub rate limits.
- The privacy footer uses the published absolute URL so it works in the plain local
  preview as well as Pages; the local Python server does not render Markdown routes.
- Profile/social requests are also unauthenticated and share the GitHub API rate
  limit. Generic static metadata is intentional for crawlers that do not execute JS.
- Cache expiry controls freshness, not deletion. Cached public data may stay visible
  when GitHub is unavailable, and entries persist until replaced or cleared.
- Theme initialization reads the system preference once; it does not listen for later
  system theme changes.
- The favicon URL is `https://myowin.dev/favicon.svg`; no local favicon file is tracked.
  Edit the hosted asset to change its image, or the HTML link to change its location.

## Rules

Read and follow these adopted project rules:
- .claude/rules/git.md
- .claude/rules/safety.md
- .claude/rules/writing.md

<!-- last-reviewed: 6f0f7457fc9ce70cc520724b27cb37f795813789 -->
