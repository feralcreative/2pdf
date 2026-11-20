# Status

Updated: 2026-11-20

## Where things stand

2pdf can be installed into another repo as a git dependency. That work is on the branch `feat/installable-package` (issue #8), on top of `main`, which now has the page-breaking features (pull request #7, merged 2026-11-19). `npm run build` is clean on the branch: no lint errors, and 186 of 186 tests pass.

The web version works locally (`npm start`, port 1646) and is not hosted anywhere.

## Landed on 2026-11-20

- **The compiled stylesheet is committed** (`public/assets/styles/pdf.min.css`), with a test that fails when it differs from a fresh compile, and `package.json` has a `files` allowlist. `npm run build:css` compiles it.
- **The calling project's `2pdf.config` wins** over the one in the 2pdf install. Sandboxed mode refuses to search inside `ConfigManager`.
- **A document can use a logo from its own directory.**
- **`PUPPETEER_EXECUTABLE_PATH`** wins over the built-in Chrome list.
- **Metadata:** repository URLs, Node 22, `path` and `glob` removed, version 2.1.0.

Proved in scratch projects: a tarball installed with `--ignore-scripts`, a git dependency with its own config and logo, and a fresh clone installed globally all render. The web version was started and given a benign and a hostile file; nothing in the hostile file worked. Codex reviewed the plan and the diff.

## Open

1. **Open a pull request for the branch, merge it, then tag `v2.1.0` and push the tag.** The branch is pushed to `origin`; no pull request exists yet (2026-11-20). Until a tag exists, other repos have nothing stable to pin. After pushing, install from `github:feralcreative/2pdf#v2.1.0` in a clean project as the last check; only a local git install has been tried.
2. **`README.pdf` is out of date** with the README's new section.
3. **Move the repos that use 2pdf onto the dependency**, one at a time. Work repos are their owners' call.
4. **`npm audit` reports vulnerabilities** in the dependency tree (see the open Dependabot pull request #5).
5. **Web version:** hosting, real Google sign-in, and the `google-auth-library` question are still open; see the list below.
6. **Windows is untested**; see [decisions.md](decisions.md).
7. **Qlty is not wired up** in this repo.

## Landed on 2026-11-19

Page breaking (issue #6): keep-together rules, figures and introductions, `<!-- h2-page-breaks: ON -->`, diagram warnings, and `--layout-report`. Details are in `README.md` and `AGENTS.md`.

## Landed on 2026-11-18

- **Sandboxed mode** (`0e9afc2`): a `sandboxed` option on `ToPdf` for untrusted documents. It adds a Content Security Policy that allows only the wrapper script, fetches remote images, fonts, and stylesheets in Node from a checked public address (`src/request-guard.js`), keeps Chrome's process sandbox on, sanitises `filename` and `logo`, and blanks machine tokens. The CLI is unchanged.
- **Web version** (`1066837`): `web/server.js`, `web/convert.js`, `web/worker.js`, `web/auth.js`, and the drop page. No new dependencies. Each conversion runs in a child process that can be killed.
- **Docs** (`c1328ca`): [web.md](web.md), plus updates to `README.md`, `AGENTS.md`, [decisions.md](decisions.md), [deployment.md](deployment.md), and [debugging.md](debugging.md).

Codex reviewed the plan and the diff. What was accepted and rejected is recorded in `_PLANS/web-version.md` (gitignored) and in [decisions.md](decisions.md).

## Open on the web version

1. **Hosting.** Not decided. Either this server ships as its own container at a `*.hq.acmpls.com` host, or `tools.hq.acmpls.com` gets a feature that calls it. It needs a host that can run Chrome with its sandbox on; see the hosting requirements in [web.md](web.md).
2. **Sign-in.** Real sign-in needs a Google OAuth client ID and `ALLOWED_DOMAINS`. Until then the server runs only with `--dev` on loopback, with sign-in off. Sign-in has unit tests but has never been tried against Google.
3. **Token check.** Codex recommends `google-auth-library` over the hand-written check in `web/auth.js`. It was kept out because the web version was built with no new dependencies. Ziad's call.
4. **Brand.** The drop page is unbranded on purpose: this repo is public, and the acmpls marks and Klim fonts cannot live in it. Where the branded shell lives depends on the hosting decision.
5. **No GitHub issue was filed for the web version.**

## Known limits

- One Markdown file per request. Images work only by `https:` URL or data URI.
- Markdown only: no HTML input, custom stylesheet, or `--single-page` on the web.
- Conversions run one at a time, and a client that disconnects does not cancel its conversion.
- Process-group kills assume a POSIX host.

## What will bite first

The Chrome sandbox. Most container hosts need extra setup before Chrome will start with its sandbox on, and `TOPDF_CHROME_NO_SANDBOX=1` removes the main protection against a hostile upload. Settle that before choosing a host.
