# 2pdf Agent Operating Manual

Node CLI that converts Markdown/HTML to styled PDFs via Puppeteer, plus a small web version (`web/`) that runs the same pipeline behind a drop page. Single package, no monorepo, no database.

When a change makes anything in this file inaccurate—a command, a path, a convention, a prohibition—update this file in the same change.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Compile the stylesheet (after any change to `pdf.scss`) | `npm run build:css` |
| Watch the stylesheet | `npx sass --watch --poll --no-source-map assets/styles/pdf.scss:public/assets/styles/pdf.min.css --style=compressed` |
| Convert a file | `node bin/2pdf.js path/to/file.md --no-open` |
| Convert and print how full each page is | `node bin/2pdf.js path/to/file.md --no-open --layout-report` |
| Run the web version (port 1646, watch, opens a browser) | `npm start` |
| Same, without opening a browser | `npm run start:no-open` |
| Compile the drop page's SCSS | `npm run web:css` |
| Convert a directory | `node bin/2pdf.js path/to/dir -r` |
| Unit tests | `npm test` |
| Single test file | `npx jest test/token-processor.test.js` |
| Single test by name | `npx jest -t "should replace simple tokens"` |
| Watch tests | `npm run test:watch` |
| Lint | `npm run lint` |
| Lint + autofix | `npm run lint:fix` |
| Build (lint + test) | `npm run build` |
| Install globally as `2pdf` | `npm install -g .` |

There is no typecheck step (plain JS, no TypeScript). `npm run dev` runs `src/index.js` directly, which exports a class and does nothing on its own—use `node bin/2pdf.js` instead. `npm start` runs the web version. Lint covers `src/`, `bin/`, `web/`, and `utils/`.

## Baseline

`npm run build` passes clean as of 2026-11-20: zero lint errors, 186 of 186 tests green (178 when the browser tests are skipped). Record the current worktree and run the build before editing; compare failures against that baseline and inspect `git stash list` without stashing or restoring another agent's work.

Coverage is still thin on the pipeline: `ConfigManager`, `TokenProcessor`, `RequestGuard`, and `LayoutChecker` have unit tests, `ToPdf.resolveLogoPath()` and `PdfGenerator`'s browser choice have one each, and `ContentProcessor` has tests for `processImageAlignment`, `processFigures`, `processH2PageBreaks`, and `processLeadIns` only. The rest of `ContentProcessor`, and all of `StyleManager` and `PdfGenerator`, is uncovered, so a green suite is weak evidence. Smoke-test real output. The web version (`web/auth.js`, `web/convert.js`, `web/server.js`) is tested with stand-in workers, so its tests never launch Chrome. The one suite that does is `test/pagination.integration.test.js`: it prints short documents in real Chrome and reads them back with `pdftotext`, and it skips itself when Chrome or `pdftotext` is missing.

## Definition of done

1. `npm run lint`—clean, no errors.
2. `npm test`—all green.
3. If you touched `assets/styles/pdf.scss`, run `npm run build:css` and commit `public/assets/styles/pdf.min.css` with it. Nothing reads the SCSS at runtime, and `test/stylesheet.test.js` fails when the two differ.
4. Smoke-test an actual conversion end to end. Unit tests cover only `ConfigManager`, `TokenProcessor`, and `ContentProcessor.processImageAlignment()`; every other rendering path is uncovered.

   ```bash
   printf '# Smoke\n\nHello[^1] ==mark==\n\n[^1]: note\n' > /tmp/smoke.md
   node bin/2pdf.js /tmp/smoke.md -c config/2pdf.config.sample --no-open
   ```

5. If you changed content processing or CSS, open the generated HTML instead of guessing: `node bin/2pdf.js /tmp/smoke.md -c config/2pdf.config.sample --debug --verbose --no-open` prints a temp dir; `open <tempdir>/styled.html`. Inspect print media as well as the screen view.
6. If you added or changed a document setting or comment tag, update `README.md` in the same change. It is the user-facing source of truth for the full tag surface.
7. If you touched `web/`, `src/request-guard.js`, or anything `sandboxed` gates, run `npm start`, drop a file on the page, and check the PDF. Then convert a hostile file (a `<script>`, an `<iframe src="file:///etc/passwd">`, `<!-- filename: ../../x -->`, `{{HOSTNAME}}`) and confirm none of it works.

## Prohibitions

- **Never hand-edit** `public/assets/styles/pdf.min.css` (tracked), `pdf.css`, or the `.map` files, or `assets/styles/pdf.css` / `pdf.min.css`. All are compiled output. Edit `assets/styles/pdf.scss` and run `npm run build:css`.
- **Never edit `package-lock.json` by hand.** Let npm write it.
- **Do not add dependencies** without asking. This tool is deliberately thin.
- **Do not add a `prepare`, `install`, or `postinstall` script.** The package must install with scripts off (`--ignore-scripts`), which is why the stylesheet is committed.
- **Do not upgrade Puppeteer past 21.x** without asking. `src/pdf-generator.js` calls `page.waitForTimeout()`, removed in Puppeteer 22.
- **Commit in logical blocks, but do not push.** The agent makes each commit itself with a Conventional Commits message; pushing needs explicit permission.
- **Do not commit a `2pdf.config`.** `.gitignore` covers `*.config`; only `config/2pdf.config.sample` is tracked.
- **Do not touch `_deprecated/`** (the original shell implementation) or `_archive/` (scratch test files). Both are gitignored and dead.
- **Do not use `---` horizontal rules** in Markdown authored for this tool. H1/H2 already get bottom rules from the CSS. Use `<!--| PAGE-BREAK -->` to break sections.
- **Never widen a document-setting regex to swallow the closing `-->`.** See Gotchas.
- **Never weaken sandboxed mode to make a document render.** Every uploaded file is hostile. Do not add `'unsafe-inline'` to the page's `script-src`, let Chrome fetch a URL itself, pass `--no-sandbox` by default, or read a path a document names. See [docs/web.md](docs/web.md).
- **Never put brand assets or licensed fonts in `web/`.** This repo is public.

## Architecture

Three entry points: `bin/2pdf.js` (Commander CLI), `src/index.js` (exports `ToPdf` for programmatic use), and `web/server.js` (the web version, which runs `ToPdf` with `sandboxed: true` in a child process per upload—see [docs/web.md](docs/web.md)). The CLI is a thin shell—it resolves the input to a file or directory, constructs one `ToPdf` per file, and prints results. All orchestration lives in `ToPdf.convert()`.

`ToPdf.convert()` call chain, Markdown path:

1. `ConfigManager.loadConfig()`—finds and parses `2pdf.config` into a flat `KEY=VALUE` map.
2. `TokenProcessor.processTokens(inputPath, config)`—up to 3 passes of `{{TOKEN}}` substitution, skipping code blocks.
3. `ContentProcessor.processContent()`—runs `extractDocumentSettings()` (stashed on `this.documentSettings`), then PDF-only blocks, page breaks, live-site shields.
4. `ContentProcessor.markdownToHtml()`—captures the first `# H1` as `documentTitle`, runs `marked`, then `postProcessHtml()` (header IDs, columns, table widths/size/alignment, image widths, figures, code sizes, header rules, H2 page breaks, footnote heading, anchor links, lead-in paragraphs, image paths).
5. `ToPdf` reads `contentProcessor.getDocumentSettings()` and resolves a `logo` into a base64 data URI.
6. `StyleManager.applyStyles()`—loads compiled CSS, string-substitutes theme colors and every size/spacing setting into it, wraps the body in a full HTML document.
7. Styled HTML is written to `os.tmpdir()/2pdf-XXXXXX/styled.html` (an `fs.mkdtemp` directory created at the top of `convert()`). In sandboxed mode a Content Security Policy `<meta>` is added first.
8. Output path is resolved: CLI `-o` > `<!-- filename: -->` > input basename (+ `-vXX.YY` when `sequential-output` is on), then the `file-date` UTC stamp is layered on top.
9. `PdfGenerator.generatePdf()`—Puppeteer renders the temp HTML to the output path. Just before printing, `markBlocksThatFit()` measures every table in Chrome and tags the short ones `keep-together`.
10. Post: print the `--layout-report` page table if asked (`LayoutChecker`, via `pdftotext`), bump `<!-- version-number: -->` in the *source* file, `open` the PDF (macOS), remove the temp dir unless `--debug`.

HTML input (`.html`/`.htm`) skips steps 2–4 in favour of `processTokensInContent()` + `processHtmlContent()`, and `StyleManager` injects only theme-color overrides when the file already has its own CSS and no custom stylesheet was passed. This early return also skips the logo and watermark.

Dependency direction is one-way: `bin` and `web` → `src/index.js` → the five processors and `LayoutChecker`. The processors never import each other, except `PdfGenerator`, which uses `src/request-guard.js` in sandboxed mode. `src/dependency-manager.js` is dead code (Chrome/Pandoc detection from the shell era)—nothing requires it.

See [docs/architecture.md](docs/architecture.md) for the non-obvious coupling in `ContentProcessor`'s marker/`<style>` protocol.

## Conventions

- CommonJS (`require`/`module.exports`). One class per file in `src/`, `module.exports = ClassName`—except `src/index.js`, which exports `{ ToPdf }`.
- Filenames in `src/` are kebab-case; classes are PascalCase.
- Prettier-style formatting: double quotes, semicolons, 2-space indent, ~120 col. Not enforced by a config file—match the surrounding file.
- User-facing progress goes through `chalk` + emoji on `console.log`, one line per pipeline step. `no-console` is off deliberately.
- Errors: `throw new Error(...)` inside processors; `ToPdf.convert()` catches everything and returns `{ success: false, error }`. Never let `convert()` throw—the CLI's batch loop depends on the result object.
- Document settings are read from HTML comments by regex in `ContentProcessor.extractDocumentSettings()`, stored camelCase on `settings`, then threaded through `ToPdf.convert()` into `StyleManager.applyStyles()`'s positional parameter list.
- Styling settings are applied by **prepending CSS override blocks with `!important`** to the compiled stylesheet (see the `apply*` methods in `src/style-manager.js`); `applyWatermark()` appends its block. Follow these patterns rather than introducing a CSS-in-JS layer.
- Tests are Jest, `test/<module>.test.js`, `describe(ClassName) > describe(methodName) > test(...)`, tmpdir fixtures created in `beforeEach`.

Adding a document setting touches four places, in order: `extractDocumentSettings()` in `src/content-processor.js`, the local-const block and the `applyStyles()` call in `ToPdf.convert()`, a new `applyX()` in `src/style-manager.js` plus its parameter, and `README.md`.

## Gotchas

- **The compiled stylesheet is committed.** `public/assets/styles/pdf.min.css` is the one compiled file git tracks (an exception to `*.css` in `.gitignore`), so that a clone or an installed copy works with no build step. A change to `pdf.scss` is not finished until `npm run build:css` has run and the result is in the same commit; `test/stylesheet.test.js` fails otherwise. Compile it with plain `sass` and no source map: VS Code's Live Sass Compiler adds vendor prefixes and would rewrite the tracked file.
- **A runtime file that is not in `files` does not exist in an installed copy.** `package.json` lists what ships: `bin/`, `src/`, the stylesheet, the tracked images by name, and the config sample. Add a new runtime asset there, by name when its folder also holds gitignored files (`files` overrides the root `.gitignore`), and check with `npm pack --dry-run`. `web/` is not shipped.
- **Only one compiled stylesheet is read.** Runtime loads `public/assets/styles/pdf.min.css`, falling back to an untracked `public/assets/styles/pdf.css` if someone has compiled one. The copies in `assets/styles/` are strays from compiling into the source directory; they are ignored at runtime.
- **`npx sass` does not add vendor prefixes.** `.vscode/settings.json` configures Live Sass Compiler with autoprefix `> 1%, last 2 versions`, so locally generated CSS may contain `-webkit-`/`-ms-` prefixes. Compiled CSS is ignored, not committed. Plain Sass output works in headless Chrome; do not add the prefixes by hand.
- **Most of the stylesheet lives inside `@media print`.** Global rules also apply to PDFs, but print rules can override them. Check the print cascade; a screen-only inspection is insufficient.
- **Watching only `pdf.css` leaves the runtime stale.** `StyleManager` prefers `pdf.min.css` whenever it exists, so that is the file the watcher above writes.
- **Standalone images are centered by default.** `processImageAlignment()` tags a `<p>` whose only content is an image (optionally inside a link) as `img-block`, which the stylesheet centers; `<!-- img-align: left|center|right -->` overrides the next one. A paragraph with any text beside the image is left alone, so do not widen the regex to catch images in running text—inline icons would jump to the center.
- **`<!-- rule: off -->` targets the heading above it.** Unlike image (`img-width`, `img-align`), table, and code-size comments, this Markdown-only tag searches backward. Preserve unconditional marker removal in `processHeaderRules()` so unmatched comments cannot loop forever.
- **Half the setting regexes reject hyphens in the value.** `theme-color`, `theme-color-primary`, `theme-color-secondary`, `body-color`, `link-color`, `font-size`, `header-size`, `body-size`, `line-height`, `paragraph-spacing`, `header-spacing`, `list-item-spacing`, `link-underline`, `page-numbers`, `disclosure`, and `version-number` use `([^-]+?)`; `filename`, `file-date`, `highlight-color`, and `logo` use `(.+?)`. So `<!-- disclosure: pre-release -->` silently fails to parse. Use `(.+?)` for anything new, and do not "normalize" the old ones to `(.+?)` without checking that the non-greedy match still stops at `-->` for every existing document.
- **The calling project's config wins over 2pdf's own.** Search order is `<cwd>/2pdf.config`, `<cwd>/config/2pdf.config`, `<install>/2pdf.config`, `<install>/config/2pdf.config` (reversed on 2026-11-20; the install used to come first). Run from inside this repo, `<cwd>` is the install, so this repo's `config/2pdf.config` is used; pass `-c` to be certain. Sandboxed mode never searches: `ConfigManager.loadConfig()` returns `{}` unless it is given a path.
- **A logo is looked up in three ways.** `ToPdf.resolveLogoPath()`: a bare name is bundled-first, then beside the document; a relative path with a directory is relative to the document; sandboxed mode names bundled logos only. Never let the sandboxed branch look beside the document, which there is the upload directory.
- **Inter is fetched from Google Fonts at render time.** `assets/fonts/` does not exist, so `processFontPaths()` logs "Fonts directory not found, using web fonts". Offline renders fall back to the system sans-serif—not a bug in your change.
- **`sequential-output` writes to the user's source file.** `updateVersionInFile()` rewrites `<!-- version-number: -->` in the *input* Markdown after a successful render. Never enable it in a test fixture you care about.
- **The footer layout is title / disclosure / date + page**, left / center / right—not what an older primer claimed. It is an inline template string duplicated in both branches of `generatePdf()`; change both.
- **`ToPdf.tempDir` is `null` until `convert()` runs.** It used to be set in the constructor from the clock; it is now created by `fs.mkdtemp` per conversion.
- **The sandboxed CSP allows one script: the last `<script>` in the page, by hash.** That is the wrapper script `StyleManager.createStyledHtml()` appends. Add a second wrapper script, or move it ahead of the content, and it silently stops running on the web.
- **`web/public/app.css` is compiled and gitignored**, like the PDF stylesheet. `npm start` compiles it; a bare `node web/server.js` on a fresh clone serves a page with no styles.
- **Never `pkill -f` the web server by its command line from a shell command that contains that text.** It kills the shell running it. Use `lsof -nP -iTCP:1646 -sTCP:LISTEN` to find the PID.
- **Pagination is CSS plus two things CSS cannot do.** The keep-together rules live in the PAGINATION block of `pdf.scss`. Whether a table is short enough to keep whole is measured in Chrome by `PdfGenerator.markBlocksThatFit()`, because `break-inside: avoid` on a long table makes Chrome leave most of a page blank before it. It must not resize the viewport: it squeezes the document to 720px inside one script and puts it back. Which paragraph is a caption or a lead-in is decided by `processFigures()` and `processLeadIns()`. Every `avoid` is best effort; check a change against a long real document with `--layout-report`, not a smoke file, and run `npx jest test/pagination.integration.test.js`.
- **`processFigures()`, `processLeadIns()`, and `processH2PageBreaks()` are single-pass scanners on purpose.** They run on uploaded documents. A regex that rescans from every unmatched tag goes quadratic on malformed HTML, and a tag pattern whose alternatives overlap (`"[^"]*"|[^>]`) backtracks exponentially on an unclosed tag. The hostile-input tests in `test/content-processor.test.js` hold the line.
- **`<!-- h2-break: off -->` targets the H2 above it**, like `<!-- rule: off -->`, and `processH2PageBreaks()` removes the comment whether or not `h2-page-breaks` is on.
- **The layout report measures text only.** `pdftotext` sees no images, so a page that ends on an uncaptioned image reads as less full than it is. `pdftotext` is optional; without it the report says so and the conversion still succeeds.
- **Positional parameters, not an options object.** `StyleManager.applyStyles()` takes 23 positional arguments. Inserting one in the middle silently shifts every later setting. Append at the end.
- **`--single-page` recomputes the page height from `document.body.scrollHeight` plus a fixed 200px buffer.** Tall or late-laying-out content clips. Adjust the buffer in `generatePdf()`, not the CSS.
- **`debug-highlight.js` at the root is broken.** It calls `processContent(content, file)` expecting `{ documentSettings, htmlContent }`; the method takes one argument and returns a string. It also reads `test-highlight-closing.md`, which lives in `_archive/`. Do not use it as a reference; rewrite or delete it if you need a scratch harness.
- **Auto-open is macOS-only.** `execSync("open ...")` runs only when `process.platform === "darwin"`. Batch/directory mode never auto-opens regardless.
- **`-o/--output` is ignored in directory mode**, with a warning. PDFs land next to their sources.

## Credentials

There are no secrets. The CLI reads one environment variable, `PUPPETEER_EXECUTABLE_PATH` (through Puppeteer, which also honors its other `PUPPETEER_*` settings). The web version reads settings from the environment (`PORT`, `HOST`, `GOOGLE_CLIENT_ID`, `ALLOWED_DOMAINS`, `ALLOWED_SUBS`, `AUTH_DISABLED`, `TOPDF_WEB_CONFIG`, `MAX_BODY_BYTES`, `TOPDF_CHROME_NO_SANDBOX`, and `PUPPETEER_EXECUTABLE_PATH` and `PUPPETEER_CACHE_DIR`, which it passes to each worker; see [docs/web.md](docs/web.md)), none of which is secret: a Google OAuth client ID is public by design. There is no `.env` and no `.env.example`. `2pdf.config` is user-authored plain text (names, company, colour hexes) and is gitignored via `*.config`; `config/2pdf.config.sample` is the tracked template and the canonical key list.

If you ever add a secret-bearing key, document its name and source here—never its value, not even masked.

Gitignored paths that must never be read into a commit, a log, or a chat response: `*.config`, `_*`, `.claude`, `**/img/*`, `public/assets/images/logo-cannonball.*`, `public/assets/images/logo-acmpls.*`.

## Commit and PR conventions

- Conventional Commits: `type(scope): subject`, imperative mood. Types in use: `feat`, `fix`, `docs`, `chore`, `refactor`, `style`.
- Branch: work on `main` unless the user says otherwise.
- The agent commits in logical blocks, one feature, fix, or refactor step per commit. Never push without the user asking.
- Never add AI attribution—no `Co-Authored-By`, no "Generated with" footer.
- Never commit: `2pdf.config`, generated PDFs other than a deliberate `README.pdf` refresh, temp dirs, compiled CSS other than `public/assets/styles/pdf.min.css`.

## Deep-dive index

- [docs/STATUS.md](docs/STATUS.md)—where the work stands and what is open. Read first when picking up a session.
- [docs/architecture.md](docs/architecture.md)—the marker/`<style>` injection protocol, HTML-vs-Markdown paths, settings threading. Read before changing `ContentProcessor` or `StyleManager`.
- [docs/decisions.md](docs/decisions.md)—why string-substituted CSS, why endnotes not footnotes, why Puppeteer is pinned. Read before "improving" something that looks wrong.
- [docs/debugging.md](docs/debugging.md)—flags, temp-file inspection, symptom-to-cause table. Read when output is wrong but nothing errored.
- [docs/web.md](docs/web.md)—the web version: settings, endpoints, sandboxed mode, sign-in, hosting requirements. Read before changing `web/`, `src/request-guard.js`, or anything gated on `sandboxed`.
- [docs/deployment.md](docs/deployment.md)—global install, publish, uninstall. Read before changing `bin`, `files`, or `engines` in `package.json`.
- [README.md](README.md)—the complete user-facing reference for every document setting and comment tag. The source of truth; do not duplicate it here.
