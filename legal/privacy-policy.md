# Privacy Notice

Last updated: 13 November 2026

This notice explains how information is handled when you visit
[myowinthein.github.io](https://myowinthein.github.io), a personal project listing
operated by Myo Win Thein.

For privacy questions or requests, email
[mwt.creative@gmail.com](mailto:mwt.creative@gmail.com).

## Visiting the site

You can browse the listing without creating an account or submitting a form.
The page displays public profile information, social links, and repository
information from my GitHub account.

Loading the page involves requests to these services:

- **GitHub Pages:** GitHub hosts the site. GitHub states that it logs and stores
  visitors' IP addresses for security purposes, whether or not they are signed in.
  See [GitHub Pages data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection).
- **GitHub API:** Your browser requests public profile, social-account,
  repository, latest-release, and license information directly from `api.github.com`.
  GitHub receives the request and associated technical information, such as your IP address and
  browser request information. The site
  does not ask you to sign into GitHub or supply an API token.
- **GitHub profile image:** Your browser requests my public profile image from
  GitHub's image host, `avatars.githubusercontent.com`. GitHub receives the image
  request and associated technical information. The site sends no referring-page
  URL with this request.
- **Favicon hosting:** Your browser can request my GitHub avatar as the site icon
  through `github.com`, which redirects to `avatars.githubusercontent.com`.
  GitHub receives the requests and associated technical information. Depending
  on your browser and its settings, requests can also include referring-site
  information.

The page can also load the public profile image without a referring-page URL
and draw a circular copy in your browser for the favicon. The generated copy
stays in page memory; it is not uploaded or added to local storage.

These requests deliver the page, profile image, repository listing, and icon.
Hosting providers also process technical information to operate and protect their services.
Their handling of this information is described in the
[GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Theme storage and controls

When you use the theme button, the site stores a `myowinthein-landing-theme`
preference with the value `light` or `dark` in your browser's local storage.
It remembers your choice across tabs, windows and later visits in the same
browser profile. A valid choice previously stored under `theme` is moved to
this project-specific key when no new preference exists.

Without a valid saved choice, the theme follows your browser's system preference,
including changes while the page is open. A manual choice takes priority over
system changes. If storage is unavailable, switching still works for the current page.

The site does not set an expiration for this preference. You can remove it by
clearing this site's local storage or site data in your browser. Other open tabs
return to the system preference when they receive that change; the next visit
also follows it until you choose a theme again. The page's JavaScript does not
send the stored theme value to the GitHub API or the favicon host.

This browser preference is separate from request records kept by hosting
providers. Clearing it does not delete their records.

## Public GitHub data cache

The site stores copies of my public GitHub profile, social links, repository
pages, and successful latest-release and license responses in your browser's local storage.
This cache contains public GitHub data, not information you submit through this site.

For five minutes after a successful request, the site can reuse that response
without another API request. Once it is older, cached content can remain visible
while the site requests an update. If the request fails, the cached content may
remain visible, and Load more can use saved repository pages even after five minutes.
While the page remains open, the site can retry temporary failures in the background
up to three times, with increasing delays. If GitHub limits requests, retries wait
until its retry time. Successful background requests refresh the stored copies;
cards already being browsed remain in place until a later visit uses the updated pages.

If GitHub limits requests, the site also stores a retry time in local storage so
reloading the page does not immediately repeat blocked requests. This stores a
time, not the error response. Once that time passes, requests can be tried again.
The stored retry time is ignored after it expires and can be removed by clearing
this site's local storage or site data.

The five-minute period does not delete the stored copy. Cached copies remain
until replaced or removed when you clear this site's local storage or site data
in your browser. If browser storage is unavailable, the site attempts to load
data directly from GitHub.

## Email correspondence

If you email me, I receive the address, message, and any other information you
choose to include. I use that information to respond to your inquiry and related
follow-up. Please send only the information needed for your request.

The contact address uses Gmail, so Google processes and stores correspondence
as part of providing that service. See the
[Google Privacy Policy](https://policies.google.com/privacy).
Correspondence is managed in my Gmail mailbox rather than in a database operated
by this website. Contact me to ask about retention of, or request deletion of,
messages you have sent.

## Reporting an issue

The footer's Report an issue link opens this repository's issue forms on
GitHub. An issue is public, and GitHub processes what you submit, including your
GitHub username, under the
[GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
I receive reports through GitHub, not through a form on this site. The forms
ask for details such as your browser and device, so leave out anything private.
You can contact me by email about a report you submitted.

## Provider records and privacy requests

GitHub and Google describe their retention criteria, privacy contacts,
and available controls in the notices linked above. Their services can process
information in countries other than the country where you live. This notice
does not promise a particular provider retention period or deletion of records
that a provider controls independently.

You can contact me about information I hold, including requests concerning
access, correction, or deletion. The rights and exceptions that apply depend on
the applicable law and the information involved. For information a provider
handles independently, its privacy notice explains how to contact it.

## Linked websites

Project cards and the GitHub profile link lead to other websites. This notice
covers this landing page and its favicon requests. It does not describe all
processing on the linked projects, GitHub's website, or the full `myowin.dev`
portfolio. Review the relevant site's privacy information when you visit it.

## Changes to this notice

Revisions will appear in this document with an updated last-updated date.
