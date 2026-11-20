# Status

Updated: 2026-11-19

## Where things stand

The web version exists and works locally. `npm start` serves a drop page on port 1646 that turns a dropped Markdown file into a PDF, using the same pipeline as the CLI with `sandboxed: true`. It is not hosted anywhere, and no one but the developer can reach it.

Page-breaking features are built on the branch `feat/page-break-controls` (issue #6), six commits on top of `main`. `npm run build` is clean there: no lint errors, and 171 of 171 tests pass, eight of them printing in real Chrome. Nothing is pushed: `main` is ten commits ahead of GitHub, and the branch has never been pushed, so no pull request exists yet.

## Landed on 2026-11-19

- **Keep-together rules** in the stylesheet: a heading stays with what follows, a table that fits on a page is never split, rows, code blocks, blockquotes, and list items do not split, and a table that must split keeps three rows on each side.
- **Figures and introductions.** An image and the italic caption after it become one unit; a paragraph that introduces a table, list, or figure stays with it.
- **`<!-- h2-page-breaks: ON -->`**, with `<!-- h2-break: off -->` to exempt one heading.
- **Diagram warnings** on every render, and **`--layout-report`** for a page-by-page fullness table (needs `pdftotext`).
- **Hostile-input fixes** in `ContentProcessor`: the new transforms and `processHeaderRules()` are single-pass, after Codex found quadratic and exponential patterns.

Codex reviewed the plan and the code twice. Its claim that Chrome ignores `break-after: avoid` between siblings was tested in Chrome 157 and is wrong; `test/pagination.integration.test.js` now holds that.

## Open on the branch

1. **Push and open the pull request.** Pushing the branch also publishes the ten unpushed `main` commits. Ziad's call.
2. **Sandboxed mode was not smoke-tested by hand** after these changes (Definition of done, step 7). The unit suites pass, but nobody dropped a file on the web page.
3. **Compiled CSS does not travel in git.** On another machine, compile the SCSS after checking out the branch.
4. **Qlty is not wired up** in this repo.

## Landed on 2026-11-18

- **Sandboxed mode** (`0e9afc2`): a `sandboxed` option on `ToPdf` for untrusted documents. It adds a Content Security Policy that allows only the wrapper script, fetches remote images, fonts, and stylesheets in Node from a checked public address (`src/request-guard.js`), keeps Chrome's process sandbox on, sanitises `filename` and `logo`, and blanks machine tokens. The CLI is unchanged.
- **Web version** (`1066837`): `web/server.js`, `web/convert.js`, `web/worker.js`, `web/auth.js`, and the drop page. No new dependencies. Each conversion runs in a child process that can be killed.
- **Docs** (`c1328ca`): [web.md](web.md), plus updates to `README.md`, `AGENTS.md`, [decisions.md](decisions.md), [deployment.md](deployment.md), and [debugging.md](debugging.md).

Codex reviewed the plan and the diff. What was accepted and rejected is recorded in `_PLANS/web-version.md` (gitignored) and in [decisions.md](decisions.md).

## Open

1. **Hosting.** Not decided. Either this server ships as its own container at a `*.hq.acmpls.com` host, or `tools.hq.acmpls.com` gets a feature that calls it. It needs a host that can run Chrome with its sandbox on; see the hosting requirements in [web.md](web.md).
2. **Sign-in.** Real sign-in needs a Google OAuth client ID and `ALLOWED_DOMAINS`. Until then the server runs only with `--dev` on loopback, with sign-in off. Sign-in has unit tests but has never been tried against Google.
3. **Token check.** Codex recommends `google-auth-library` over the hand-written check in `web/auth.js`. It was kept out because the web version was built with no new dependencies. Ziad's call.
4. **Brand.** The drop page is unbranded on purpose: this repo is public, and the acmpls marks and Klim fonts cannot live in it. Where the branded shell lives depends on the hosting decision.
6. **Personal-repo defaults not done:** Qlty is not wired up, and no GitHub issue was filed for the web version.

## Known limits

- One Markdown file per request. Images work only by `https:` URL or data URI.
- Markdown only: no HTML input, custom stylesheet, or `--single-page` on the web.
- Conversions run one at a time, and a client that disconnects does not cancel its conversion.
- Process-group kills assume a POSIX host.

## What will bite first

The Chrome sandbox. Most container hosts need extra setup before Chrome will start with its sandbox on, and `TOPDF_CHROME_NO_SANDBOX=1` removes the main protection against a hostile upload. Settle that before choosing a host.
