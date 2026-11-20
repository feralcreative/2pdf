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

`processHeaderRules()` is the other exception, and the only comment whose target sits *above* it. `<!-- rule: off -->` / `<!-- rule: on -->` is authored on the line below a heading, so the walker slices back to the nearest preceding `<h1>`-`<h6>` and grafts `no-header-rule` / `has-header-rule` onto it, then emits one shared `<style>` block for the whole document rather than a class per instance. It also swallows the `<p>` wrapper `marked` puts around a standalone comment. If you add another comment that reads backwards, keep the marker-drop unconditional—the `while` loop only terminates because every matched comment is removed whether or not a heading was found.

`processTableAlignment()` is the exception: it is not comment-driven and not on the marker protocol. It walks every `<table>` that has a `<thead>`, reads the per-column alignment that `marked` already emitted from the markdown separator row (`:---`, `:---:`, `---:`), and writes an `align-table-N` class plus its own `<style>` block directly. It therefore runs on all tables, not just annotated ones.

`<!-- PDF ONLY ... -->` uses a different placeholder scheme: the block becomes `PDFONLY_PLACEHOLDER_START…END` in phase 1 and is run through `marked` a second time inside `postProcessHtml()`, so PDF-only content supports full markdown.

## Pagination

Three layers, each doing what the one before cannot.

**The stylesheet** (the PAGINATION block in `pdf.scss`) holds the keep-together rules: a heading stays with what follows, rows, code blocks, and blockquotes do not split, the first and last two rows of a table and the first and last item of a list stay with their neighbours, and paragraphs keep two lines on each side of a break. All of it is best effort, and Chrome drops an `avoid` when the protected unit is taller than a page.

**`ContentProcessor`** supplies the structure the stylesheet needs and Markdown does not give it. `processFigures()` wraps a standalone image and the all-italic paragraph directly after it in `<figure class="pdf-figure">`, so the pair is one unbreakable box. `processLeadIns()` tags a paragraph that ends in a colon and is followed by a table, list, code block, blockquote, or figure as `lead-in`. `processH2PageBreaks()` adds `h2-page-break` to each H2 when `<!-- h2-page-breaks: ON -->` is set, skipping the first H2, one that follows a manual page break, the footnotes heading, and any H2 with `<!-- h2-break: off -->` below it. `processFigures()` must run after `processImageAlignment()`, which creates the `img-block` paragraphs it looks for, and `processLeadIns()` runs late so the figures and table classes it looks past already exist.

**`PdfGenerator.markBlocksThatFit()`** answers the one question that needs a layout: is this table short enough to keep whole? It switches the page to print media, squeezes the document to the printed content width (720px) for the length of one script, measures every table, tags those under 40% of the content height `keep-together`, and puts the width and media type back. The viewport is never resized, because that would re-run media queries and could swap responsive images after they have loaded. A blanket `table { break-inside: avoid }` was tried and rejected: Chrome moves a table that will not fit to the next page before splitting it, which left a near-empty page ahead of every long table.

`LayoutChecker` is separate from all three and changes nothing. It warns about SVG images whose text will print too small or too large, from the `viewBox`, the font sizes, and the image's `img-width`, and with `--layout-report` it reads the finished PDF through `pdftotext -bbox-layout` to report how full each page is. Both are skipped in sandboxed mode, since the first reads local files and the second runs a local program. The page report drops the watermark's text, which `pdftotext` would otherwise read as content on every page.

All of this is Markdown-only and default-stylesheet-only: HTML input never reaches `postProcessHtml()`, and `--style` or an HTML file's own CSS replaces the stylesheet that holds the rules. `markBlocksThatFit()` still runs for those, harmlessly, since nothing styles the class it adds.

## Two input paths

`ToPdf.convert()` branches on file extension and the two branches share almost nothing.

| Step | `.md` | `.html` / `.htm` |
| --- | --- | --- |
| Tokens | `processTokens(path, config)`—reads the file itself | `processTokensInContent(string, config)` |
| Special tags | `processContent()` → `markdownToHtml()` → `postProcessHtml()` | `processHtmlContent()` → `processPdfOnlyContentInHtml()`, `processPageBreaksInHtml()`, `processLiveSiteShieldInHtml()` |
| Document settings | full `extractDocumentSettings()` | full `extractDocumentSettings()` |
| Styling | always full stylesheet | theme-colour variables only if the file already has `<style>`, `<link>`, or inline styles (`hasExistingCss()`) and no custom stylesheet was passed; full styling otherwise |

Consequence: markers, columns, table widths, image widths, code sizes, header rules, header IDs, and the footnote heading are **Markdown-only**. A feature added to `postProcessHtml()` does not reach HTML input. If it must, add it to `processHtmlContent()` too. HTML's existing-CSS early return also skips logo and watermark generation.

## Document settings threading

`extractDocumentSettings()` returns a plain object; `processContent()` stores it on `this.documentSettings`; `markdownToHtml()` then mutates the same object to add `documentTitle` (from the first `# H1`). So settings are only complete *after* HTML conversion—`ToPdf.convert()` calls `getDocumentSettings()` at that point, not earlier.

From there each setting becomes a local `const` in `convert()` and is passed to `StyleManager.applyStyles()` by position (23 parameters, with `highlightColorRed` last). `pageNumbers`, `pageNumberFormat`, and `disclosure` bypass `StyleManager` and go straight to `PdfGenerator.generatePdf()` for the footer; `documentTitle` goes to both. `customFilename`, `fileDate`, `sequentialOutput`, and `versionNumber` are consumed by `convert()` itself for output-path resolution.

`logo` is resolved in `convert()`, not `StyleManager`: a bare filename resolves against `<install>/public/assets/images/`, an absolute path is used as-is, and the file is read and inlined as a base64 data URI. Data URI, not `file://`, because the logo is emitted into the `<div class="pdf-header">` that `StyleManager.createStyledHtml()` builds, and Chrome's file-access rules make `file://` fragile there.

## How styling settings reach the PDF

`StyleManager.applyStyles()` never parses CSS. It:

1. Reads `public/assets/styles/pdf.min.css` (or `pdf.css`, or a `-s` custom file).
2. Rewrites relative `../fonts/` URLs to absolute `file://`—a no-op today, since `assets/fonts/` does not exist.
3. Replaces the `--theme-color` value inside the existing `:root` block by regex, then **flattens** `var(--theme-color)` and `var(--theme-color-10)` to literal colours, because CSS custom properties are unreliable in Chrome's print path. `--theme-color-primary` and `--theme-color-secondary` are flattened only when the corresponding document setting is present, so they stay as `var()` by default.
4. Prepends one `!important` override block per remaining setting (`applyBaseFontSize`, `applyBodyColor`, `applyLinkColor`, `applyLinkUnderline`, `applyHeaderSize`, `applyBodySize`, `applyLineHeight`, `applyParagraphSpacing`, `applyHeaderSpacing`, `applyListItemSpacing`, `applyHighlightColor`—called once per highlight color).
5. `applySinglePageMode()` strips page-break rules when `--single-page` is set.
6. `applyWatermark()` appends watermark CSS when enabled; its color resolves from the primary theme, then the base theme.
7. `createStyledHtml()` wraps everything in a document with the CSS inlined in a `<style>` tag, the optional logo header, and escaped watermark text.

Because overrides are *prepended*, they beat the stylesheet only by virtue of `!important`. Drop the `!important` from a new `applyX()` and it will lose.

## Footnotes

`marked-footnote` is configured with `{ description: "", footnoteDivider: false }`, which yields one end-of-document `<section data-footnotes>` with an empty screen-reader `<h2>`.

`processFootnotesHeading()` then derives a visible label from the last heading *preceding* that section, falling back to `Notes`. If that heading sits immediately before the section with only whitespace between, it is treated as the author's own notes heading and removed from the body—otherwise the reader sees two stacked headings, each with its own rule. The label is written into `<h2 class="footnotes-title">`, which `pdf.scss` styles as a small all-caps label with a single rule underneath while neutralizing the global `h2` chrome.

These are endnotes, not per-page footnotes. See [decisions.md](decisions.md).

## Dead code

- `src/dependency-manager.js`—Chrome/Pandoc detection from the shell-script era. Nothing requires it; the whole file is a deletion candidate, pending the user's call.
- `PdfGenerator.findChrome()`—returns the string `"puppeteer-chrome"` and is never called. Real detection happens in the constructor's `chromePaths` loop.
- `debug-highlight.js` at the repo root—calls `processContent()` with the wrong arity and expects an object back. Broken.
