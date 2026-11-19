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

## Compiled CSS is gitignored

`.gitignore` carries a blanket `*.css`. Effect: `public/assets/styles/pdf.min.css` is not tracked, so a fresh clone cannot render until the SCSS is compiled, and CSS changes never appear in a diff.

This is a side effect of a broad ignore rule, not a considered decision—but do not flip it without the user's say-so. Tracking compiled CSS would put autoprefixer output in every diff and create a second source of truth alongside `pdf.scss`.

## Live Sass Compiler, not an npm script, is the sanctioned compiler

`.vscode/settings.json` configures Live Sass Compiler to emit `.css` and `.min.css` into `/public/assets/styles` with source maps and autoprefixing (`> 1%, last 2 versions`). Locally generated CSS can therefore carry `-webkit-`/`-ms-` prefixes that a plain `npx sass` run does not produce; these outputs are gitignored.

There is deliberately no `npm run sass` script. The user's standing preference is `npx sass` over IDE extensions in general, but this repo predates that and its IDE compiler adds prefixes. Recompiling with `npx sass` is correct and safe for headless Chrome; just do not treat the vanished prefixes as a regression to patch by hand.

## Footnotes are endnotes, and that is final

`marked-footnote` collects every note into one section at the end of the document. True per-page footnotes need a paged-media engine (Paged.js) layered over the render, which would replace the Puppeteer path wholesale. Explicitly out of scope—the footnote work in commit `059df28` was styling that end section to look intentional, nothing more.

Do not propose Paged.js as a small fix.

## Puppeteer is pinned to 21.x

`src/pdf-generator.js` calls `page.waitForTimeout()` (500ms after load, and again after the viewport resize in single-page mode) to let fonts and layout settle. That API was removed in Puppeteer 22. The waits are load-bearing—dropping them produces PDFs with fallback fonts.

Upgrading means replacing both calls with an explicit `new Promise(r => setTimeout(r, ms))` or a real readiness condition, then re-verifying font rendering. Not a drive-by change.

## System Chrome is preferred over Puppeteer's bundled Chromium

`PdfGenerator`'s constructor probes three fixed paths (macOS Chrome, `/usr/bin/google-chrome`, `/usr/bin/chromium-browser`) and only falls back to the bundled binary. Rationale: matching the original shell script's output byte-for-byte during the port, and avoiding a second ~200MB Chromium on machines that already have Chrome.

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
