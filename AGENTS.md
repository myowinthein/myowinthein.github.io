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
- Initial-theme syntax: `node --check assets/theme.js`.
- Tests use Node's built-in VM, DOM stubs, and mocked fetch responses; no npm dependencies.

## Architecture Pointers

- `index.html`: generic account fallback, profile placeholders, accessible shell, and project fallback.
- `assets/theme.js`: applies the saved or system theme in the head before the stylesheet and body render.
- `assets/script.js`: theme toggle, public profile/social loading, and
  on-demand GitHub repository fetch/filter/render.
- `assets/style.css`: responsive cards and theme variables; dark overrides use
  `[data-theme="dark"]` on `<html>`.
- `assets/icons/external-link.svg`: Lucide icon (ISC notice in its metadata), drawn as a
  CSS mask by `.external-link .link-label::after`. A link shows the arrow only with
  `class="external-link"` and a `.link-label` span, including links the script generates.
- `test/script.test.cjs`: runs the shipped script in a VM; covers filtering, pagination,
  storage failures, independent profile/social loading, link safety, and empty/error states.
- `.github/workflows/checks.yml`: dependency-free syntax/tests on pushes and pull requests,
  using Node.js 24. This reports results without gating the legacy Pages deployment.
- `legal/privacy-policy.md`: privacy notice linked from the footer. It describes theme
  storage, the GitHub data cache, GitHub API requests and the favicon host, so update it
  when browser storage, network requests or third-party hosts change.

## Domain Rules

- Link boundaries: this profile page and its legal page are internal; repository cards, social profiles and sibling project websites are external, even under `myowinthein.github.io`. Follow Writing’s Reference links workflow; keep project links in the current tab.

- Include only public, non-fork repositories owned by `myowinthein`; exclude
  `myowinthein.github.io` itself. Owner and self-name comparisons are case-insensitive.
- GitHub Pages and a homepage are optional. Archived repositories remain eligible.
- Request 6 repositories initially; Load more appends the next eligible batch of up
  to 6. Leave short nonempty batches as they are; skip only fully excluded pages.
  Use the GitHub Link header's next relation to detect more pages, not batch length.
- Every card has a Source link to its encoded GitHub repository URL; add a separate
  Website link only for a valid HTTP(S) homepage. Never generate a Pages URL.
  Card links open in the same tab: no `target="_blank"`; keep `rel="noopener noreferrer"`.
- GitHub is the content source: profile avatar/name/bio/company/location/website and
  social accounts populate the header; repository names/descriptions/homepages,
  archived status, latest full release tags, and license links populate cards.
  Do not add curated project lists, copy overrides, or duplicate profile details.
- Profile, social-account, and repository requests run independently. Keep generic
  static fallbacks; hide empty optional fields and deduplicate validated links.
  Refresh data on page load without requiring a site commit or deployment, subject
  to the five-minute response cache.
- Latest-release and license requests enrich only confirmed displayed projects, independently
  of repository loading. Missing or failed releases leave no empty version row;
  successful responses use the same five-minute cache. Update only each release
  or license slot so incoming data preserves existing card nodes and keyboard focus.
- Add a muted license link after Source only when a repository advertises a license
  and its license endpoint returns a valid file URL. Use its SPDX identifier, or
  License for NOASSERTION. Do not guess a filename, branch, or license from prose.
- Show an Archived badge in the title row only for an explicit true value.
- Cache successful public API responses and Link metadata in localStorage under
  `github-directory:v1:myowinthein:` plus the full request URL. Fresh entries avoid
  API calls; expired entries preview content while refreshing and survive errors.
  Validate cached data/timestamps; blocked, full, or corrupt storage must not break
  live loading. Never cache errors or update a cache timestamp on a failed request.
- Respect GitHub's rate-limit reset and Retry-After headers across page loads;
  store only the retry deadline separately from successful response entries.
  Keep cache/rate-limit failures out of the visible UI: no warning or Try again
  button. Retry requested resources quietly after reset; temporary failures get
  at most three background retries with increasing delays, not ongoing polling.
- On refresh failure, use validated cached pages even beyond five minutes and
  retain their release/license details without new detail requests. Cached browsing
  can advance using saved Link metadata without renewing cache timestamps. Load more
  stays available for cached batches during rate limits; hide it when the next batch
  needs a blocked request. Keep only the final loaded count visible.
- Background recovery updates stored pages while preserving the cards being browsed;
  the next visit uses those refreshed pages. Profile/social/details can update in place.
  Resume a previously requested uncached batch after recovery without fetching unrequested pages.
- Theme initialization uses `myowinthein-landing-theme` in local storage, migrating
  a valid legacy `theme` choice only when the new key is absent. Without a valid
  override, follow system changes live; a manual light/dark choice overrides them.
  Sync saved choices and cleared overrides across tabs. Denied storage keeps the
  current choice in memory. Keep the binary button and synchronous head script;
  root `color-scheme` follows the displayed theme for browser-drawn UI.

## Behavior Rules

- Keep the site dependency-free; do not add a build step, package.json, or dependencies
  without an explicit request.
- Work directly on `main` under the project's configured shipping policy.
- Keep links underlined and interactive controls at least 44px tall for mobile touch
  targets.

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
- A failed API request leaves displayed cards or the GitHub browsing fallback intact.
  Requests are unauthenticated and subject to GitHub rate limits; background retries
  run only while the page is open and stop after their retry budget.
- The privacy footer uses the published absolute URL so it works in the plain local
  preview as well as Pages; the local Python server does not render Markdown routes.
- Profile/social requests are also unauthenticated and share the GitHub API rate
  limit. Generic static metadata is intentional for crawlers that do not execute JS.
- Cache expiry controls freshness, not deletion. Cached public data may stay visible
  when GitHub is unavailable, and entries persist until replaced or cleared.
- Request GitHub avatars at 144px for the 72px profile image and circular favicon;
  preserve other URL parameters and leave other image hosts unchanged. Reserve avatar,
  profile and release-label space without clipping long content or revealing hidden fields.
- The favicon starts with `https://github.com/myowinthein.png?size=64`. Profile loading
  prepares a circular PNG in memory using an anonymous CORS image and canvas, with
  no referrer. Failed conversion keeps the direct URL; stale image loads cannot
  overwrite a newer profile's icon. No local favicon file is tracked.
- The test DOM stub in `test/script.test.cjs` only returns ids listed in `ELEMENT_IDS`,
  and a test requires each one in `index.html`. Add any new id the script reads to both.

## Rules

Read and follow these adopted project rules:
- .claude/rules/git.md
- .claude/rules/safety.md
- .claude/rules/writing.md
- .claude/rules/design.md

<!-- last-reviewed: 711c298ef8cc3036c5a779233d4a09598acaeb39 -->
