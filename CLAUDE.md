# myowinthein.github.io

## Project Identity

Personal landing page for Myo Win Thein. A single-page static site hosted on GitHub Pages that
fetches the owner's public GitHub repos via the GitHub API and renders them as project cards.

- Stack: plain HTML, CSS, vanilla JS — no framework, no build tool, no package manager
- Deploy: push to `main`; GitHub Pages serves automatically
- Blast radius: public-facing personal site; breakage is immediately visible to anyone visiting

## Project Config

git-strategy: solo
git-auto-commit: true
readme-style: standard

## Dev Commands

Open `index.html` directly in a browser for local preview. No install, no build step.

## Architecture Pointers

- `index.html` — single page; shell markup only, grid content injected by JS
- `assets/style.css` — all styles; theme via CSS custom properties on `[data-theme]` on `<html>`
- `assets/script.js` — two responsibilities: theme toggle + GitHub API fetch/render

## Domain Rules

- A repo becomes a project card only if all four hold: `has_pages === true`, non-empty `homepage`,
  not a fork, and not the `myowinthein.github.io` repo itself — this is the site's core "what
  counts as a project" rule (script.js filter line)
- Repo-sourced text (`name`, `description`) is untrusted external input and must pass through
  `escapeHtml` before being placed in the DOM; any new field rendered from the API response must
  do the same or it reintroduces the XSS this was fixed for (see `74375b3`)
- Repo-sourced URLs (`homepage`) must pass through `safeUrl`, which only allows `http:`/`https:`
  protocols and falls back to the repo's own GitHub Pages URL otherwise — do not link `r.homepage`
  directly
- Theme resolution order: explicit `localStorage` choice wins if present, otherwise system
  `prefers-color-scheme` decides; there is no third "auto" state once the user has toggled once

## Behavior Rules

- No build step exists; do not introduce one unless the user asks
- No npm/package.json; do not add dependencies without explicit request
- Changes go straight to `main`; confirm before pushing

## Hard Safety Rules

- Never commit secrets; the GitHub API call is unauthenticated and must stay that way
- Do not add inline `<script>` or `<style>` blocks — keep JS and CSS in `assets/`

## Known Traps

- GitHub API: the project card filter requires `has_pages === true`, a truthy `homepage` field,
  excludes forks, and excludes the `myowinthein.github.io` repo itself (script.js filter line)
- Repos with Pages enabled but no `homepage` set are intentionally skipped — `has_pages` only
  means Pages is enabled, not that a live site exists at the generated URL
- The API is unauthenticated — rate-limited to 60 req/hr per IP; no auth token is wired up
- Favicon is hosted externally at `https://myowin.dev/favicon.svg`; no local favicon file exists.
  To change it, update the file on myowin.dev, not here.

## Rules

This project follows the rules shipped in claude-helm:
- ~/.claude/plugins/marketplaces/claude-helm/rules/git.md
- ~/.claude/plugins/marketplaces/claude-helm/rules/safety.md

At the start of every session, check whether the paths above exist on this machine.
If either is missing, inform the user: "helm rules are referenced in CLAUDE.md but the
plugin is not installed on this machine. Install it with: /plugin install claude-helm"

<!-- last-reviewed: b961594b75690cd03a936a4d8f5d6dd832fdb455 -->
