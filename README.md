# myowinthein.github.io

Personal project directory for the GitHub account `myowinthein`. The local files
provide the layout; GitHub supplies the profile, links, and public project data.

[Visit the site](https://myowinthein.github.io).

Built with plain HTML, CSS, and JavaScript. No framework, package manager, or build step.

## Install

Clone the repository with Git:

```sh
git clone https://github.com/myowinthein/myowinthein.github.io.git
cd myowinthein.github.io
```

No dependencies need to be installed to preview the site.

## Usage

Open `index.html` in a browser. On macOS, from the repository directory:

```sh
open index.html
```

On other systems, open the file from your file manager. An internet connection is
required to fetch projects from GitHub.

The introduction loads the account's name, bio, location, and website from
`https://api.github.com/users/myowinthein`. Social links load independently from
`https://api.github.com/users/myowinthein/social_accounts`. Empty optional fields
are hidden, unsafe URLs are skipped, and duplicate links are removed.

To update the site's content, edit GitHub rather than this repository:

| Content | Where to update it |
| --- | --- |
| Name, bio, location, website | Your GitHub profile |
| Social links | Social accounts on your GitHub profile |
| Project name, description, project-page URL | Each repository's name and About settings |
| Listed projects | Create or publish a repository that meets the rules below |

Updates are fetched on the next page load; no site commit or redeployment is needed.
Profile, social-account, and repository requests run independently, so a failed
endpoint does not block the others. Generic static text and a GitHub link remain
available if profile data cannot load. Browser title/description metadata updates
from the profile too; crawlers that do not run JavaScript see the generic metadata.

The page requests 6 repositories initially, sorted by most recently updated, and
shows the eligible projects. Select **Load more** to request the next API page and
append up to 6 more cards. A batch can be shorter after filtering; only fully
excluded pages are skipped automatically. GitHub's pagination header determines
when the button disappears, without an extra request for an empty last page.
A repository appears only when it is:

- Public.
- Not a fork.
- Not this site's own repository, `myowinthein.github.io`.

GitHub Pages and a website URL are optional. Archived repositories can appear.
Every card has a **Source** link to GitHub and, when a valid HTTP(S) homepage exists,
a separate **Project page** link. Every project uses its current GitHub name and
description; there are no maintained project lists or custom copy overrides.
Use complete HTTP(S) URLs in GitHub's website/homepage fields.

Use the theme button to switch between light and dark. The initial theme follows
the system preference unless a previous choice is saved in the browser.
Theme changes still work when browser storage is unavailable; the choice simply
cannot persist across visits in that case.

If a request fails, use **Try again** to retry. Projects already displayed remain
visible, and the next attempt resumes from the failed API page. Requests are
unauthenticated and subject to GitHub's rate limits.
The page also keeps a GitHub repository link available when JavaScript is disabled
or the initial API request fails. The footer links to the published privacy notice.

## Development

Edit `index.html` for markup, `assets/style.css` for styles, and
`assets/script.js` for theme behavior and project loading.

With a Node.js version that supports the built-in `node:test` module, run:

```sh
node --test test/script.test.cjs
node --check assets/script.js
```

Tests run the shipped script with mocked browser APIs and GitHub responses;
they do not require live API access or npm dependencies.

`.github/workflows/checks.yml` runs these checks on pushes and pull requests using
Node.js 24, with read-only repository permissions and no dependency installation.
The workflow reports check results; the existing Pages deployment remains automatic.

To preview over localhost, run `python3 -m http.server 8000 --bind 127.0.0.1` and
open `http://localhost:8000`.

For a browser check, review both themes at a narrow width such as 360px, use Tab
and Shift+Tab to check focus, activate buttons with Enter or Space, and confirm
Load more announces its result. With JavaScript disabled, the generic account
heading and GitHub repository link should remain usable.

## Deployment

The site is hosted on GitHub Pages. Pushing changes to `main` publishes the site
through the repository's existing Pages setup.

## Contributing

This is a personal site. Issues and PRs are not expected.

## License

All rights reserved. This code is not licensed for reuse.

<!-- last-reviewed: eb95f53617b1d635437c57cc9127dcb318b92477 -->
