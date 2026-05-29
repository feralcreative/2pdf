# Task: Style markdown footnotes in 2pdf output

## Problem

Footnotes (`[^1]` references + `[^1]: …` definitions) parse correctly but render in the PDF with no footnote affordances: no heading, no divider, no separation from the body, and the in-text markers are bare unstyled superscripts. They look broken even though the HTML is valid.

This is a styling gap in 2pdf, not a parsing bug. `marked` + `marked-footnote` are already wired up in `src/content-processor.js` and produce correct markup.

## Scope boundary (read first)

`marked-footnote` produces **endnotes** — all notes collect in one section at the _end of the document_. This task is only to make that end-of-document section look intentional and styled. Do **not** attempt true per-page (bottom-of-page) footnotes — that needs a paged-media engine like Paged.js and is explicitly out of scope here.

## Current behavior

`src/content-processor.js` (~line 28) configures the plugin as:

```js
marked.use(markedFootnote({ description: "", footnoteDivider: false }));
```

`assets/styles/pdf.scss` (~lines 405-414) is the only footnote styling:

```scss
section[data-footnotes] {
  border-top: none !important;
}

section[data-footnotes] h2 {
  display: none !important;
}
```

The renderer loads `public/assets/styles/pdf.min.css` (falling back to `public/assets/styles/pdf.css`), so the SCSS must be recompiled after editing.

## Emitted HTML (the selectors you're targeting)

With the current config the plugin emits this structure (verified):

```html
<p>
  Text with a note.<sup
    ><a
      id="footnote-ref-1"
      href="#footnote-1"
      data-footnote-ref
      aria-describedby="footnote-label"
      >1</a
    ></sup
  >
</p>
<section
  class="footnotes"
  data-footnotes>
  <h2
    id="footnote-label"
    class="sr-only">
    …
  </h2>
  <ol>
    <li id="footnote-1">
      <p>
        The note body.
        <a
          href="#footnote-ref-1"
          data-footnote-backref
          aria-label="Back to reference 1"
          >↩</a
        >
      </p>
    </li>
  </ol>
</section>
```

Note: when `description` is non-empty the `<h2>` carries `class="sr-only"`, so trying to reveal it means fighting the screen-reader-only rule. Cleaner to leave the config alone and synthesize a visible label in CSS with `::before`.

## Required change

Leave `src/content-processor.js` as-is (`description: ""`, `footnoteDivider: false`). Replace the footnote block in `assets/styles/pdf.scss` with the following. Use the existing theme CSS variables (`--theme-color-primary`, `--theme-color-secondary`) already defined in `:root` so it respects per-document theme overrides.

```scss
// -------------------------------------------------------------------------
// FOOTNOTES - end-of-document notes section
// -------------------------------------------------------------------------

section[data-footnotes] {
  margin-top: 2em;
  padding-top: 0.75em;
  border-top: 0.5pt solid var(--theme-color-primary);
  font-size: 0.85em;
  color: #444;

  // synthesized "Notes" heading (the real <h2> is sr-only)
  &::before {
    content: "Notes";
    display: block;
    margin-bottom: 0.5em;
    font-weight: 600;
    font-size: 1em;
    color: var(--theme-color-primary);
  }

  h2 {
    display: none !important; // keep the sr-only heading hidden visually
  }

  ol {
    margin: 0;
    padding-left: 1.25em;
  }

  li {
    margin-bottom: 0.4em;

    p {
      margin: 0;
    }
  }
}

// in-text reference marker, e.g. [1]
a[data-footnote-ref] {
  color: var(--theme-color-primary);
  font-weight: 600;
  text-decoration: none;

  &::before {
    content: "[";
  }

  &::after {
    content: "]";
  }
}

// back-reference arrow at the end of each note
a[data-footnote-backref] {
  margin-left: 0.25em;
  color: var(--theme-color-secondary);
  text-decoration: none;
}
```

If the `↩` back-reference arrows are not wanted in print, replace the `a[data-footnote-backref]` block with `a[data-footnote-backref] { display: none; }`.

## Recompile

Check `package.json` / `config/` for an existing sass build script first and use it if present. If there isn't one, compile both targets with `npx sass` (do not lint/compile via an IDE extension):

```bash
npx sass assets/styles/pdf.scss public/assets/styles/pdf.css
npx sass --style=compressed assets/styles/pdf.scss public/assets/styles/pdf.min.css
```

## Acceptance criteria

Convert a small test document containing at least two footnotes and confirm in the PDF:

1. A visible **"Notes"** heading in the theme primary color introduces the section.
2. A thin divider rule sits above the notes section, separating it from the body.
3. In-text markers render as bracketed, theme-colored superscripts (e.g. `[1]`), not plain numbers.
4. Note text is smaller than body text and the list is tidily indented.
5. No literal `[^1]` / `[^1]:` strings appear anywhere in the output.
6. Theme overrides still work: a document with `<!-- theme-color-primary: … -->` recolors the heading, markers, and divider accordingly.

## Test fixture

```markdown
# Footnote render test

First claim that needs a note.[^1] Second claim with another.[^2]

[^1]: Short note body.

[^2]: Longer note body with **bold**, _italic_, and a (parenthetical) — to confirm inline markdown still renders inside notes.
```
