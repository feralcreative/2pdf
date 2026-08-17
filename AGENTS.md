# 2pdf Agent Operating Manual

Node CLI that converts Markdown/HTML to styled PDFs via Puppeteer. Single package, no monorepo, no server, no database, no network API.

When a change makes anything in this file inaccurate—a command, a path, a convention, a prohibition—update this file in the same change.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Compile SCSS (required before first run) | `npx sass assets/styles/pdf.scss public/assets/styles/pdf.css && npx sass assets/styles/pdf.scss public/assets/styles/pdf.min.css --style=compressed` |
| Watch SCSS | `npx sass --watch assets/styles/pdf.scss:public/assets/styles/pdf.css` |
| Convert a file | `node bin/2pdf.js path/to/file.md --no-open` |
| Convert a directory | `node bin/2pdf.js path/to/dir -r` |
| Unit tests | `npm test` |
| Single test file | `npx jest test/token-processor.test.js` |
| Single test by name | `npx jest -t "should replace simple tokens"` |
| Watch tests | `npm run test:watch` |
| Lint | `npm run lint` |
| Lint + autofix | `npm run lint:fix` |
| Build (lint + test) | `npm run build` |
| Install globally as `2pdf` | `npm install -g .` |

There is no typecheck step (plain JS, no TypeScript). `npm start` and `npm run dev` run `src/index.js` directly, which exports a class and does nothing on its own—use `node bin/2pdf.js` instead.

## Known-failing baseline

`npm run build` fails today, before any change you make. Verified 2026-08-17:

- `npm run lint`—10 errors. Four `no-unused-vars` (`timezone` in `src/config-manager.js`, `spawn` in `src/dependency-manager.js`, `fs` in `src/pdf-generator.js`, `allTokens` in `src/token-processor.js`) and six `no-undef` on `document` inside `page.evaluate` callbacks in `src/pdf-generator.js` (the `eslintConfig` in `package.json` sets `env.node` but not `env.browser`).
- `npm test`—3 of 16 fail, all in tests left over from the pre-rename `md2pdf` era: `TIME_NOW` (the token is named `TIME`), a fixture written as `md2pdf.config` (the loader looks for `2pdf.config`), and two `processTokens("dummy-path")` calls that hit the real filesystem.

Do not report these as caused by your change, and do not claim a clean build. Compare against this baseline; if your change adds a new failure, fix it.

## Definition of done

1. `npm run lint`—no *new* errors beyond the 10 above.
2. `npm test`—no *new* failures beyond the 3 above.
3. If you touched `assets/styles/pdf.scss`, recompile into `public/assets/styles/` (see Commands). Nothing reads the SCSS at runtime.
4. Smoke-test an actual conversion end to end. Unit tests cover only `ConfigManager` and `TokenProcessor`; every rendering path is uncovered.

   ```bash
   printf '# Smoke\n\nHello[^1] ==mark==\n\n[^1]: note\n' > /tmp/smoke.md
   node bin/2pdf.js /tmp/smoke.md --no-open
   ```

5. If you changed content processing or CSS, open the generated HTML instead of guessing: `node bin/2pdf.js /tmp/smoke.md --debug --verbose` prints a temp dir; `open <tempdir>/styled.html`.
6. If you added or changed a document setting or comment tag, update `README.md` in the same change. It is the user-facing source of truth for the full tag surface.

## Prohibitions

- **Never hand-edit** `public/assets/styles/pdf.css`, `pdf.min.css`, or the `.map` files, or `assets/styles/pdf.css` / `pdf.min.css`. All are compiled output. Edit `assets/styles/pdf.scss` and recompile.
- **Never edit `package-lock.json` by hand.** Let npm write it.
- **Do not add dependencies** without asking. This tool is deliberately thin.
- **Do not upgrade Puppeteer past 21.x** without asking. `src/pdf-generator.js` calls `page.waitForTimeout()`, removed in Puppeteer 22.
- **Do not commit.** Hand over `git add -A && git commit -m "type(scope): subject"` and let the user run it.
- **Do not commit a `2pdf.config`.** `.gitignore` covers `*.config`; only `config/2pdf.config.sample` is tracked.
- **Do not touch `_deprecated/`** (the original shell implementation) or `_archive/` (scratch test files). Both are gitignored and dead.
- **Do not use `---` horizontal rules** in Markdown authored for this tool. H1/H2 already get bottom rules from the CSS. Use `<!--| PAGE-BREAK -->` to break sections.
- **Never widen a document-setting regex to swallow the closing `-->`.** See Gotchas.

## Architecture

Two entry points: `bin/2pdf.js` (Commander CLI) and `src/index.js` (exports `ToPdf` for programmatic use). The CLI is a thin shell—it resolves the input to a file or directory, constructs one `ToPdf` per file, and prints results. All orchestration lives in `ToPdf.convert()`.

`ToPdf.convert()` call chain, Markdown path:

1. `ConfigManager.loadConfig()`—finds and parses `2pdf.config` into a flat `KEY=VALUE` map.
2. `TokenProcessor.processTokens(inputPath, config)`—up to 3 passes of `{{TOKEN}}` substitution, skipping code blocks.
3. `ContentProcessor.processContent()`—runs `extractDocumentSettings()` (stashed on `this.documentSettings`), then PDF-only blocks, page breaks, live-site shields.
4. `ContentProcessor.markdownToHtml()`—captures the first `# H1` as `documentTitle`, runs `marked`, then `postProcessHtml()` (header IDs, columns, table widths/size/alignment, image widths, footnote heading, anchor links, image paths).
5. `ToPdf` reads `contentProcessor.getDocumentSettings()` and resolves a `logo` into a base64 data URI.
6. `StyleManager.applyStyles()`—loads compiled CSS, string-substitutes theme colors and every size/spacing setting into it, wraps the body in a full HTML document.
7. Styled HTML is written to `os.tmpdir()/2pdf-<ms>/styled.html`.
8. Output path is resolved: CLI `-o` > `<!-- filename: -->` > input basename (+ `-vXX.YY` when `sequential-output` is on), then the `file-date` UTC stamp is layered on top.
9. `PdfGenerator.generatePdf()`—Puppeteer renders the temp HTML to the output path.
10. Post: bump `<!-- version-number: -->` in the *source* file, `open` the PDF (macOS), remove the temp dir unless `--debug`.

HTML input (`.html`/`.htm`) skips steps 2–4 in favour of `processTokensInContent()` + `processHtmlContent()`, and `StyleManager` injects only theme-color overrides when the file already has its own CSS.

Dependency direction is one-way: `bin` → `src/index.js` → the five processors. The processors never import each other. `src/dependency-manager.js` is dead code (Chrome/Pandoc detection from the shell era)—nothing requires it.

See [docs/architecture.md](docs/architecture.md) for the non-obvious coupling in `ContentProcessor`'s marker/`<style>` protocol.

## Conventions

- CommonJS (`require`/`module.exports`). One class per file in `src/`, `module.exports = ClassName`—except `src/index.js`, which exports `{ ToPdf }`.
- Filenames in `src/` are kebab-case; classes are PascalCase.
- Prettier-style formatting: double quotes, semicolons, 2-space indent, ~120 col. Not enforced by a config file—match the surrounding file.
- User-facing progress goes through `chalk` + emoji on `console.log`, one line per pipeline step. `no-console` is off deliberately.
- Errors: `throw new Error(...)` inside processors; `ToPdf.convert()` catches everything and returns `{ success: false, error }`. Never let `convert()` throw—the CLI's batch loop depends on the result object.
- Document settings are read from HTML comments by regex in `ContentProcessor.extractDocumentSettings()`, stored camelCase on `settings`, then threaded through `ToPdf.convert()` into `StyleManager.applyStyles()`'s positional parameter list.
- Styling settings are applied by **string-appending CSS override blocks with `!important`** onto the compiled stylesheet (see the `apply*` methods in `src/style-manager.js`). That is the established pattern; follow it rather than introducing a CSS-in-JS layer.
- Tests are Jest, `test/<module>.test.js`, `describe(ClassName) > describe(methodName) > test(...)`, tmpdir fixtures created in `beforeEach`.

Adding a document setting touches four places, in order: `extractDocumentSettings()` in `src/content-processor.js`, the local-const block and the `applyStyles()` call in `ToPdf.convert()`, a new `applyX()` in `src/style-manager.js` plus its parameter, and `README.md`.

## Gotchas

- **A fresh clone cannot generate a PDF.** `.gitignore` has `*.css`, so no compiled stylesheet is tracked and `StyleManager` throws "No CSS file found". Compile the SCSS first. This also means CSS changes never travel in a commit—say so when handing over a commit that changes `pdf.scss`.
- **There are two compiled-CSS locations and only one is read.** Runtime loads `public/assets/styles/pdf.min.css`, falling back to `public/assets/styles/pdf.css`. The copies in `assets/styles/` are strays from someone compiling into the source directory; they are ignored at runtime. Always target `public/assets/styles/`.
- **`npx sass` drops vendor prefixes that the committed CSS has.** `.vscode/settings.json` configures Live Sass Compiler with autoprefix `> 1%, last 2 versions`, so the checked-out `public/assets/styles/*.css` carries `-webkit-`/`-ms-` prefixes. A plain `npx sass` recompile produces prefix-free CSS. Harmless for headless Chrome, but expect a large diff-in-spirit; do not "fix" the missing prefixes by hand.
- **Most of the stylesheet lives inside `@media print`.** Editing a rule outside that block has no effect on PDF output. Check which block you are in.
- **Half the setting regexes reject hyphens in the value.** `theme-color`, `theme-color-primary`, `theme-color-secondary`, `body-color`, `link-color`, `font-size`, `header-size`, `body-size`, `line-height`, `paragraph-spacing`, `header-spacing`, `list-item-spacing`, `link-underline`, `page-numbers`, `disclosure`, and `version-number` use `([^-]+?)`; `filename`, `file-date`, `highlight-color`, and `logo` use `(.+?)`. So `<!-- disclosure: pre-release -->` silently fails to parse. Use `(.+?)` for anything new, and do not "normalize" the old ones to `(.+?)` without checking that the non-greedy match still stops at `-->` for every existing document.
- **2pdf's own config wins over the calling project's `config/2pdf.config`.** Search order is `<install>/2pdf.config`, `<cwd>/2pdf.config`, `<install>/config/2pdf.config`, `<cwd>/config/2pdf.config`. When 2pdf is installed globally from this checkout and this repo has a `config/2pdf.config`, that one is used. Pass `-c` to be certain.
- **Inter is fetched from Google Fonts at render time.** `assets/fonts/` does not exist, so `processFontPaths()` logs "Fonts directory not found, using web fonts". Offline renders fall back to the system sans-serif—not a bug in your change.
- **`sequential-output` writes to the user's source file.** `updateVersionInFile()` rewrites `<!-- version-number: -->` in the *input* Markdown after a successful render. Never enable it in a test fixture you care about.
- **The footer layout is title / disclosure / date + page**, left / center / right—not what an older primer claimed. It is an inline template string duplicated in both branches of `generatePdf()`; change both.
- **Positional parameters, not an options object.** `StyleManager.applyStyles()` takes 21 positional arguments. Inserting one in the middle silently shifts every later setting. Append at the end.
- **`--single-page` recomputes the page height from `document.body.scrollHeight` plus a fixed 200px buffer.** Tall or late-laying-out content clips. Adjust the buffer in `generatePdf()`, not the CSS.
- **`debug-highlight.js` at the root is broken.** It calls `processContent(content, file)` expecting `{ documentSettings, htmlContent }`; the method takes one argument and returns a string. It also reads `test-highlight-closing.md`, which lives in `_archive/`. Do not use it as a reference; rewrite or delete it if you need a scratch harness.
- **Auto-open is macOS-only.** `execSync("open ...")` runs only when `process.platform === "darwin"`. Batch/directory mode never auto-opens regardless.
- **`-o/--output` is ignored in directory mode**, with a warning. PDFs land next to their sources.

## Credentials

There are none. No environment variables, no API keys, no auth, no `.env`, and no `.env.example`—`grep -r process.env src/ bin/` returns nothing. `2pdf.config` is user-authored plain text (names, company, colour hexes) and is gitignored via `*.config`; `config/2pdf.config.sample` is the tracked template and the canonical key list.

If you ever add a secret-bearing key, document its name and source here—never its value, not even masked.

Gitignored paths that must never be read into a commit, a log, or a chat response: `*.config`, `_*`, `.claude`, `**/img/*`, `public/assets/images/logo-cannonball.*`.

## Commit and PR conventions

- Conventional Commits: `type(scope): subject`, imperative mood. Types in use: `feat`, `fix`, `docs`, `chore`, `refactor`, `style`.
- Branch: work on `main` unless the user says otherwise.
- Never commit or push without the user asking. Hand over a single chained one-liner: `git add -A && git commit -m "..."`.
- Never add AI attribution—no `Co-Authored-By`, no "Generated with" footer.
- Never commit: `2pdf.config`, generated PDFs other than a deliberate `README.pdf` refresh, temp dirs, compiled CSS (already ignored).

## Deep-dive index

- [docs/architecture.md](docs/architecture.md)—the marker/`<style>` injection protocol, HTML-vs-Markdown paths, settings threading. Read before changing `ContentProcessor` or `StyleManager`.
- [docs/decisions.md](docs/decisions.md)—why string-substituted CSS, why endnotes not footnotes, why Puppeteer is pinned. Read before "improving" something that looks wrong.
- [docs/debugging.md](docs/debugging.md)—flags, temp-file inspection, symptom-to-cause table. Read when output is wrong but nothing errored.
- [docs/deployment.md](docs/deployment.md)—global install, publish, uninstall. Read before changing `bin`, `files`, or `engines` in `package.json`.
- [README.md](README.md)—the complete user-facing reference for every document setting and comment tag. The source of truth; do not duplicate it here.
