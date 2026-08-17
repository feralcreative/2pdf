# Architecture

Depth behind the call chain in [AGENTS.md](../AGENTS.md). Read before changing `src/content-processor.js` or `src/style-manager.js`.

## The marker protocol in ContentProcessor

Several features need per-element CSS that markdown cannot express. They all use the same two-phase trick, and getting the phases out of order silently drops the styling.

**Phase 1—pre-HTML, in `processContent()` / early `postProcessHtml()`.** The comment is replaced with a `<style>` block carrying a generated class name plus an empty marker `<div>`:

```html
<style>.img-width-1 { width: 150px !important; height: auto !important; }</style>
<div class="img-class-marker" data-class="img-width-1"></div>
```

**Phase 2—`applyImageWidthClasses()` / `applyTableClasses()`.** The marker is found, removed, and its class is grafted onto the *next* matching element.

The phase-2 walkers slice the string (`before + after`) rather than using `String.replace`, deliberately: multiple `<img>` or `<table>` elements in one document can be byte-identical, and a naive replace hits the first occurrence rather than the one following the marker. Preserve the slicing approach if you extend this.

Features on this protocol:

| Comment | Phase 1 | Phase 2 |
| --- | --- | --- |
| `<!-- img-width: -->` | `processImageWidths()` | `applyImageWidthClasses()` |
| `<!-- code-size: -->` | `processCodeSize()` | `applyCodeSizeClasses()` |
| `<!-- col-widths: -->` | `processTableColumnWidths()` | `applyTableClasses()` |
| `<!-- table-size: -->` | `processTableSize()` | `applyTableClasses()` |

`applyTableClasses()` is shared by both table producers—it accumulates all pending classes onto one table. Adding a third table-scoped comment means adding a producer, not a second walker.

`applyCodeSizeClasses()` targets `<pre>`, not `<code>`: it sizes the block and pins the inner `<code>` to `1em` so the value does not compound. The `.code-size-N code` selector (0,1,1) is what beats the stylesheet's `code { font-size: .75em !important }` (0,0,1)—a bare `.code-size-N` rule on the `<pre>` alone would be overridden on the text itself.

`processTableAlignment()` is the exception: it is not comment-driven and not on the marker protocol. It walks every `<table>` that has a `<thead>`, reads the per-column alignment that `marked` already emitted from the markdown separator row (`:---`, `:---:`, `---:`), and writes an `align-table-N` class plus its own `<style>` block directly. It therefore runs on all tables, not just annotated ones.

`<!-- PDF ONLY ... -->` uses a different placeholder scheme: the block becomes `PDFONLY_PLACEHOLDER_START…END` in phase 1 and is run through `marked` a second time inside `postProcessHtml()`, so PDF-only content supports full markdown.

## Two input paths

`ToPdf.convert()` branches on file extension and the two branches share almost nothing.

| Step | `.md` | `.html` / `.htm` |
| --- | --- | --- |
| Tokens | `processTokens(path, config)`—reads the file itself | `processTokensInContent(string, config)` |
| Special tags | `processContent()` → `markdownToHtml()` → `postProcessHtml()` | `processHtmlContent()` → `processPdfOnlyContentInHtml()`, `processPageBreaksInHtml()`, `processLiveSiteShieldInHtml()` |
| Document settings | full `extractDocumentSettings()` | full `extractDocumentSettings()` |
| Styling | always full stylesheet | theme-colour variables only if the file already has `<style>`, `<link>`, or inline styles (`hasExistingCss()`); full stylesheet otherwise |

Consequence: markers, columns, table widths, image widths, code sizes, header IDs, and the footnote heading are **Markdown-only**. A feature added to `postProcessHtml()` does not reach HTML input. If it must, add it to `processHtmlContent()` too.

## Document settings threading

`extractDocumentSettings()` returns a plain object; `processContent()` stores it on `this.documentSettings`; `markdownToHtml()` then mutates the same object to add `documentTitle` (from the first `# H1`). So settings are only complete *after* HTML conversion—`ToPdf.convert()` calls `getDocumentSettings()` at that point, not earlier.

From there each setting becomes a local `const` in `convert()` and is passed to `StyleManager.applyStyles()` by position (21 parameters). `pageNumbers`, `pageNumberFormat`, `documentTitle`, and `disclosure` bypass `StyleManager` and go straight to `PdfGenerator.generatePdf()` for the footer. `customFilename`, `fileDate`, `sequentialOutput`, and `versionNumber` are consumed by `convert()` itself for output-path resolution.

`logo` is resolved in `convert()`, not `StyleManager`: a bare filename resolves against `<install>/public/assets/images/`, an absolute path is used as-is, and the file is read and inlined as a base64 data URI. Data URI, not `file://`, because the logo is emitted into the `<div class="pdf-header">` that `StyleManager.createStyledHtml()` builds, and Chrome's file-access rules make `file://` fragile there.

## How styling settings reach the PDF

`StyleManager.applyStyles()` never parses CSS. It:

1. Reads `public/assets/styles/pdf.min.css` (or `pdf.css`, or a `-s` custom file).
2. Rewrites relative `../fonts/` URLs to absolute `file://`—a no-op today, since `assets/fonts/` does not exist.
3. Replaces the `--theme-color` value inside the existing `:root` block by regex, then **flattens** `var(--theme-color)` and `var(--theme-color-10)` to literal colours, because CSS custom properties are unreliable in Chrome's print path. `--theme-color-primary` and `--theme-color-secondary` are flattened only when the corresponding document setting is present, so they stay as `var()` by default.
4. Prepends one `!important` override block per remaining setting (`applyBaseFontSize`, `applyBodyColor`, `applyLinkColor`, `applyLinkUnderline`, `applyHeaderSize`, `applyBodySize`, `applyLineHeight`, `applyParagraphSpacing`, `applyHeaderSpacing`, `applyListItemSpacing`, `applyHighlightColor`).
5. `applySinglePageMode()` strips page-break rules when `--single-page` is set.
6. `createStyledHtml()` wraps everything in a document with the CSS inlined in a `<style>` tag and the optional logo header.

Because overrides are *prepended*, they beat the stylesheet only by virtue of `!important`. Drop the `!important` from a new `applyX()` and it will lose.

## Footnotes

`marked-footnote` is configured with `{ description: "", footnoteDivider: false }`, which yields one end-of-document `<section data-footnotes>` with an empty screen-reader `<h2>`.

`processFootnotesHeading()` then derives a visible label from the last heading *preceding* that section, falling back to `Notes`. If that heading sits immediately before the section with only whitespace between, it is treated as the author's own notes heading and removed from the body—otherwise the reader sees two stacked headings, each with its own rule. The label is written into `<h2 class="footnotes-title">`, which `pdf.scss` styles as a small all-caps label with a single rule underneath while neutralizing the global `h2` chrome.

These are endnotes, not per-page footnotes. See [decisions.md](decisions.md).

## Dead code

- `src/dependency-manager.js`—Chrome/Pandoc detection from the shell-script era. Nothing requires it. Its unused `spawn` import is one of the standing lint errors.
- `PdfGenerator.findChrome()`—returns the string `"puppeteer-chrome"` and is never called. Real detection happens in the constructor's `chromePaths` loop.
- `debug-highlight.js` at the repo root—calls `processContent()` with the wrong arity and expects an object back. Broken.
