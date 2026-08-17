# Debugging

Read when the PDF is wrong but nothing threw. There are no log files—everything goes to stdout.

## Flags

| Flag | Effect |
| --- | --- |
| `--verbose` | Prints working dir, install dir, temp dir, input path, resolved font paths, and the stack trace on failure |
| `--debug` | Keeps the temp directory and prints its path instead of deleting it |
| `--no-open` | Skips the macOS auto-open. Always use this in scripted or agent runs |
| `-c <path>` | Forces a config file, bypassing the four-location search |
| `-s <path>` | Forces a CSS file, bypassing the compiled stylesheet |

## The one move that solves most problems

Inspect the intermediate HTML. It is the exact input Chrome saw.

```bash
node bin/2pdf.js file.md --debug --verbose --no-open
# → "🔍 Debug files kept in: /var/folders/.../2pdf-<ms>"
open /var/folders/.../2pdf-<ms>/styled.html
```

Everything downstream of `StyleManager` is Chrome's doing. If `styled.html` is wrong, the bug is in `ContentProcessor` or `StyleManager`. If `styled.html` is right and the PDF is wrong, it is `PdfGenerator` options, print CSS, or paging.

Caveat: the browser shows the screen cascade. Most of `pdf.scss` is inside `@media print`, so a rule can look absent in the browser and still apply to the PDF. Use the browser's print-preview or emulate print media before concluding a rule is missing.

## Reading the progress log

Each pipeline step prints one line. A missing line means that step was skipped.

- `📋 Using config file: …`—which of the four locations won. Absent means no config was found and token replacement is inert.
- `🎨 Found theme color in document: …` / `📄 Found page numbers setting …`—the setting parsed. **Absent means the regex did not match**, which is the usual cause of "my setting is ignored".
- `🔍 CSS file path: …`—confirms `public/assets/styles/pdf.min.css` was the stylesheet, not `assets/styles/`.
- `⚠️ Fonts directory not found, using web fonts`—always printed; expected, not a fault.
- `📏 Single-page mode: Npx content → N.N" page`—the computed page height.
- `📄 Loading HTML: file://…`—the temp path, printed even without `--debug`.

Some steps print twice (once from `ToPdf.convert()`, once from the processor). Cosmetic.

## Symptom to cause

| Symptom | Cause | Move |
| --- | --- | --- |
| `No CSS file found. Expected pdf.min.css or pdf.css in assets/styles/` | Compiled CSS absent—it is gitignored | Compile the SCSS into `public/assets/styles/` (see AGENTS.md Commands). The error message names the wrong directory |
| A document setting is ignored, no `Found …` line | Regex did not match. Most likely a hyphen in the value—the older settings use `([^-]+?)` | Remove the hyphen, or widen that one regex to `(.+?)` and verify it still stops at `-->` |
| A recent `pdf.scss` change has no effect | Not recompiled, or compiled into `assets/styles/` instead of `public/assets/styles/` | Recompile to `public/assets/styles/` |
| A CSS rule has no effect at all | Rule sits outside `@media print`, or a prepended `!important` override in `style-manager.js` beats it | Check the block; check the `apply*` methods |
| Wrong config values | 2pdf's own `config/2pdf.config` outranks the calling project's `config/2pdf.config` | Pass `-c`, or check the `📋 Using config file` line |
| Tokens left as `{{FOO}}` | Not in config, misspelled, or inside a code block (protected by design) | Look for the unprocessed-tokens warning; check `config/2pdf.config.sample` for the canonical key list |
| Fonts render as generic sans-serif | Google Fonts unreachable—Inter is not bundled | Check network. Not a code fault |
| Images missing | Relative path resolved against the *input file's* directory, not the cwd | Grep `styled.html` for the emitted `file://` URL and check it exists |
| Logo missing, `⚠️ Logo file not found` | Bare filenames resolve against `<install>/public/assets/images/` | Use that directory or an absolute path |
| TOC links do not jump | `addHeaderIds()` slugs only simple heading text; code spans or inline markup in a heading break the anchor | Use plain text in headings that the TOC targets |
| Two stacked headings above the footnotes | `processFootnotesHeading()` only absorbs the author's heading when *nothing but whitespace* separates it from the footnotes section | Move the heading adjacent, or accept the duplicate |
| Content clipped in `--single-page` | Height is `body.scrollHeight + 200px`; the buffer is fixed | Raise the buffer in `generatePdf()` |
| Footer shows nothing | `page-numbers` is off. The footer is the only thing `displayHeaderFooter` enables | Add `<!-- page-numbers: X of Y -->` |
| Source `.md` changed by itself | `sequential-output` bumped `<!-- version-number: -->` in the input file. By design | Turn it off for fixtures |

## Health checks

```bash
node bin/2pdf.js --version                  # should print 2.0.0
node -e "console.log(require('puppeteer/package.json').version)"   # must be 21.x
ls -l public/assets/styles/pdf.min.css      # must exist and be non-empty
ls -l "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"   # macOS system Chrome
npx sass --version
```

End-to-end smoke test:

```bash
printf '# Smoke\n\nHello[^1] ==mark==\n\n[^1]: note\n' > /tmp/smoke.md
node bin/2pdf.js /tmp/smoke.md --no-open
```

## Test-suite noise

`npm test` prints `ℹ️ No config file found` and `🏷️ Processing tokens…` from the code under test. Expected. Three failures are a known pre-existing baseline—see AGENTS.md before attributing any of them to your change.
