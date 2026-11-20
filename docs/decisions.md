# Decisions

Why things are the way they are. Read before "fixing" something that looks wrong.

## Settings live in HTML comments, not front matter or config

`<!-- theme-color: #808 -->` rather than YAML front matter. Rationale: the source document must stay a valid, readable Markdown file that renders normally on GitHub and in editor previews. HTML comments are invisible everywhere else; front matter shows up as a literal block in most previewers. Commit `cdd9a1b` moved colour and font size out of the config file into comments for the same reason—settings are per-document, config is per-user.

Consequence accepted: parsing is regex, not a parser, and the `([^-]+?)` value pattern in the older settings rejects hyphens. See the Gotchas in [AGENTS.md](../AGENTS.md).

## Theme colours are flattened to literal hex, not left as `var()`

`applyThemeColor()` substitutes `var(--theme-color)` with the resolved colour string across the whole stylesheet. Custom properties survive on-screen rendering but have been unreliable in Chrome's print pipeline, which is the only path that matters here. The `:root` block is still rewritten first so that anything referencing the variable indirectly stays consistent.

Rejected: keeping `var()` and setting the property from `page.evaluate()`. Same fragility, more moving parts.

## Settings are applied as prepended `!important` CSS blocks

Each `applyX()` in `src/style-manager.js` prepends a small override block. Rejected alternatives: templating the SCSS per render (needs a Sass compile in the hot path), and a CSS-in-JS layer (a whole dependency to restyle nine properties). The current approach is crude but has one failure mode, and it is obvious: forget `!important` and the override loses.

## Compiled CSS was gitignored until 2026-11-20

`.gitignore` carries a blanket `*.css`, which once left `public/assets/styles/pdf.min.css` untracked, so a fresh clone could not render. Superseded: that one file is now tracked. See "The compiled stylesheet is committed" below.

## `npm run build:css` is the sanctioned compiler

Until 2026-11-20 it was VS Code's Live Sass Compiler, which `.vscode/settings.json` still configures to emit `.css` and `.min.css` into `/public/assets/styles` with source maps and autoprefixing (`> 1%, last 2 versions`). Its output differs from plain Sass, and `pdf.min.css` is now tracked and compared against a plain compile by `test/stylesheet.test.js`, so a save with the extension watching dirties the tracked file and fails the test. Run `npm run build:css` to put it right.

## Footnotes are endnotes, and that is final

`marked-footnote` collects every note into one section at the end of the document. True per-page footnotes need a paged-media engine (Paged.js) layered over the render, which would replace the Puppeteer path wholesale. Explicitly out of scope—the footnote work in commit `059df28` was styling that end section to look intentional, nothing more.

Do not propose Paged.js as a small fix.

## Puppeteer is pinned to 21.x

`src/pdf-generator.js` calls `page.waitForTimeout()` (500ms after load, and again after the viewport resize in single-page mode) to let fonts and layout settle. That API was removed in Puppeteer 22. The waits are load-bearing—dropping them produces PDFs with fallback fonts.

Upgrading means replacing both calls with an explicit `new Promise(r => setTimeout(r, ms))` or a real readiness condition, then re-verifying font rendering. Not a drive-by change.

## System Chrome is preferred over Puppeteer's bundled Chromium

`PdfGenerator`'s constructor probes three fixed paths (macOS Chrome, `/usr/bin/google-chrome`, `/usr/bin/chromium-browser`) and only falls back to the bundled binary. Since 2026-11-20, `PUPPETEER_EXECUTABLE_PATH` skips the probe and names the browser outright. Rationale: matching the original shell script's output byte-for-byte during the port, and avoiding a second ~200MB Chromium on machines that already have Chrome.

Note the probe list has no Windows path, so Windows always uses the bundled binary.

## Inter comes from Google Fonts, not bundled files

`processFontPaths()` exists to rewrite `../fonts/` URLs to absolute `file://` for local font files, but `assets/fonts/` was never populated—`pdf.scss` `@import`s Inter from Google Fonts instead. Trade-off accepted: renders need network access, in exchange for not carrying ~15 font files in the repo. The `processFontPaths()` machinery is kept so dropping fonts in later needs no code change.

## An empty config must not short-circuit token replacement

`processTokens()` and `processTokensInContent()` both used to return the content untouched when `config` was `{}`, on the theory that no config means nothing to replace. That skipped the *automatic* tokens too, so `{{DATE}}` and `{{USERNAME}}` leaked literally into the PDF whenever no `2pdf.config` was found anywhere—reachable on a fresh clone, since `config/2pdf.config` is gitignored. README calls automatic tokens "always available", so the code contradicted the documentation.

Both early returns were removed on 2026-08-17 and a regression test added. Do not reinstate them as an optimization: `getAutomaticTokens()` is cheap, and the guard's only effect was the bug. The visible change is that a no-config run now resolves date/time/system tokens and may emit an unprocessed-token warning where it previously stayed silent.

## `sequential-output` writes back to the source document

Incrementing `<!-- version-number: -->` in the user's own Markdown after a successful render is intentional: the version has to survive between invocations and the document is the only place a user reliably keeps. Rejected: a sidecar state file (invisible, gets out of sync, pollutes the user's project).

## `_deprecated/` is kept, not deleted

The original shell implementation (`md2pdf-sh.sh`, `install-sh.sh`, its `style/` directory) is retained as the reference for output parity during the Node port. It is gitignored via `_*`, so it costs nothing. Do not read it for current behaviour and do not port anything from it without asking.

## The web version adds no dependencies

Set by User on 2026-11-18. `web/server.js` is Node's `http` module, uploads are a raw request body instead of multipart, and `web/auth.js` verifies Google ID tokens with `crypto`. The cost is one Markdown file per request with no local images, and a hand-written token check where Google recommends a library. Codex flagged the second point in review; it stays as it is unless User lifts the constraint, and the swap to `google-auth-library` is confined to `web/auth.js`.

## Uploaded scripts are blocked by policy, not by turning JavaScript off

The wrapper script that `StyleManager` appends still has to run, so sandboxed mode cannot simply disable JavaScript. A Content Security Policy that allows that one script by hash blocks everything a document brings with it, including markup injected through a title or a setting value, without auditing every place the pipeline pastes text into HTML. `RequestGuard` is the second layer, for what a policy cannot see: where a permitted `https:` URL actually leads.

## Remote files are fetched in Node, not by Chrome

Checking a hostname and then letting Chrome connect leaves a gap: the name can resolve somewhere else the second time (DNS rebinding). `RequestGuard` resolves the name, checks every address, connects to the one it checked, and hands Chrome the bytes.

## One child process per web conversion

A conversion that hangs cannot be cancelled from inside the process that started it, and `ContentProcessor` registers Marked extensions globally on every construction, which piles up in a long-lived server. A fresh process per upload fixes both and gives a process group to kill on timeout.

## The compiled stylesheet is committed

Set 2026-11-20 (issue #8), so that 2pdf can be installed into another repo as a git dependency. Compiled CSS used to be ignored, which left a clone or an installed copy with no stylesheet. Rejected: a `prepare` script that compiles on install. It fails when lifecycle scripts are off (`--ignore-scripts`, or npm's script approval), it makes npm install every devDependency for a git install, and it breaks `npm install -g .` on a clone that has not run `npm install`. The cost of committing is a generated file that can go stale, which `test/stylesheet.test.js` catches by recompiling and comparing. Only `pdf.min.css` is tracked; `pdf.css` and the source maps stay ignored.

## The calling project's config wins

Set 2026-11-20. The search used to start in the 2pdf install, so with the global install linked to this checkout, this checkout's `2pdf.config` beat the one in the project being rendered. The current directory now comes first. A project that relied on the install's config while having one of its own gets its own.

## A bare logo name is bundled-first

Set 2026-11-20. A project needs to supply its own logo without an absolute path, but a document that names a bundled logo must not be hijacked by a same-named file beside it. So a bare name falls back to the document's directory only when nothing bundled has that name, and a path with a directory in it (`./logo.svg`) always means the document's directory. The current directory is never searched. Sandboxed mode is unchanged: bundled names only.

## Puppeteer, not puppeteer-core

Considered 2026-11-20 as a way to avoid a Chrome download in every project that installs 2pdf. Kept `puppeteer`: its Chrome goes to a cache shared by every project on the machine, and it is the fallback when no system Chrome exists. `PUPPETEER_SKIP_DOWNLOAD=1` covers machines that have Chrome.

## Windows is untested

The README said "Works on macOS, Linux, and Windows" until 2026-11-20; it now says Windows is untested. `file://` URLs are built by joining strings in `PdfGenerator`, `ContentProcessor.processImagePaths()`, and `StyleManager.processFontPaths()`, which Codex flagged on 2026-11-20 as wrong for Windows paths. Nobody has run 2pdf on Windows to confirm it. If it matters, test there and switch those three places to `url.pathToFileURL()`.
