# myowinthein.github.io

Personal landing page for Myo Win Thein, showcasing public GitHub repositories.

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

The page loads repositories owned by `myowinthein`, sorted by most recently updated,
and follows pagination to include all results. A repository appears only when it is:

- Public.
- Not a fork.
- Not this site's own repository, `myowinthein.github.io`.

GitHub Pages and a website URL are optional. Archived repositories can appear.
Cards link to a valid HTTP(S) website URL when available, otherwise to the GitHub
repository. Repository names and descriptions come from GitHub.

Use the theme button to switch between light and dark. The initial theme follows
the system preference unless a previous choice is saved in the browser.

If GitHub rejects a request, including a later page, the listing shows
"Could not load projects." Requests are unauthenticated and subject to GitHub's
rate limits.

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

## Deployment

The site is hosted on GitHub Pages. Pushing changes to `main` publishes the site
through the repository's existing Pages setup.

## Contributing

This is a personal site. Issues and PRs are not expected.

## License

All rights reserved. This code is not licensed for reuse.

<!-- last-reviewed: eb95f53617b1d635437c57cc9127dcb318b92477 -->
