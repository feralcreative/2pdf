/**
 * Tests for ContentProcessor
 */

const ContentProcessor = require("../src/content-processor");

describe("ContentProcessor", () => {
  let processor;

  beforeEach(() => {
    processor = new ContentProcessor();
  });

  describe("processImageAlignment", () => {
    test("should center a paragraph that holds only an image", () => {
      const html = '<p><img src="a.png" alt="A"></p>';
      expect(processor.processImageAlignment(html)).toBe(
        '<p class="img-block"><img src="a.png" alt="A"></p>'
      );
    });

    test("should treat a linked image on its own as standalone", () => {
      const html = '<p><a href="x"><img src="a.png" alt="A"></a></p>';
      expect(processor.processImageAlignment(html)).toContain('<p class="img-block">');
    });

    test("should leave an image inside running text alone", () => {
      const html = '<p>Click <img src="icon.svg" alt="i"> to continue</p>';
      expect(processor.processImageAlignment(html)).toBe(html);
    });

    test("should apply an img-align override to the next standalone image only", () => {
      const html =
        '<!-- img-align: left -->\n<p><img src="a.png" alt="A"></p>\n<p><img src="a.png" alt="A"></p>';
      const result = processor.processImageAlignment(html);
      expect(result).toBe(
        '\n<p class="img-block img-align-left"><img src="a.png" alt="A"></p>\n' +
          '<p class="img-block"><img src="a.png" alt="A"></p>'
      );
    });

    test("should drop an img-align marker with no image after it", () => {
      const html = "<p>Text</p>\n<!-- img-align: right -->";
      expect(processor.processImageAlignment(html)).toBe("<p>Text</p>\n");
    });
  });
  describe("processFigures", () => {
    const image = '<p class="img-block"><img src="a.svg" alt="A"></p>';

    test("should wrap an image and the italic caption after it in one figure", () => {
      const html = `${image}\n<p><em>The caption.</em></p>\n<p>Body text.</p>`;
      expect(processor.processFigures(html)).toBe(
        `<figure class="pdf-figure">${image}\n<figcaption><em>The caption.</em></figcaption></figure>\n<p>Body text.</p>`
      );
    });

    test("should keep an alignment class on the image paragraph", () => {
      const aligned = '<p class="img-block img-align-left"><img src="a.svg" alt="A"></p>';
      expect(processor.processFigures(`${aligned}<p><em>Caption</em></p>`)).toContain(
        `<figure class="pdf-figure">${aligned}<figcaption>`
      );
    });

    test("should leave an image with no caption alone", () => {
      const html = `${image}\n<p>Ordinary text.</p>`;
      expect(processor.processFigures(html)).toBe(html);
    });

    test("should not treat a paragraph with two italic runs as a caption", () => {
      const html = `${image}\n<p><em>One</em> and <em>two</em></p>`;
      expect(processor.processFigures(html)).toBe(html);
    });

    test("should not treat a paragraph that only starts in italics as a caption", () => {
      const html = `${image}\n<p><em>Note:</em> ordinary text.</p>`;
      expect(processor.processFigures(html)).toBe(html);
    });

    test("should wrap each image with its own caption", () => {
      const html = `${image}<p><em>First</em></p>${image}<p><em>Second</em></p>`;
      const result = processor.processFigures(html);
      expect(result.match(/<figure class="pdf-figure">/g)).toHaveLength(2);
      expect(result).toContain("<figcaption><em>Second</em></figcaption>");
    });
  });

  describe("processH2PageBreaks", () => {
    const html =
      '<h1 id="t">Title</h1><h2 id="a">A</h2><p>x</p><h2 id="b">B</h2><p>y</p><h2 id="c">C</h2>';

    test("should do nothing when the setting is off", () => {
      processor.documentSettings = {};
      expect(processor.processH2PageBreaks(html)).toBe(html);
    });

    test("should break before every H2 but the first when the setting is on", () => {
      processor.documentSettings = { h2PageBreaks: true };
      const result = processor.processH2PageBreaks(html);
      expect(result).toContain('<h2 id="a">A</h2>');
      expect(result).toContain('<h2 class="h2-page-break" id="b">');
      expect(result).toContain('<h2 class="h2-page-break" id="c">');
    });

    test("should skip an H2 opted out by the comment below it", () => {
      processor.documentSettings = { h2PageBreaks: true };
      const result = processor.processH2PageBreaks(
        '<h2 id="a">A</h2><h2 id="b">B</h2>\n<p><!-- h2-break: off --></p><h2 id="c">C</h2>'
      );
      expect(result).toContain('<h2 class="no-h2-break" id="b">');
      expect(result).toContain('<h2 class="h2-page-break" id="c">');
      expect(result).not.toContain("h2-break: off");
    });

    test("should skip an H2 that already follows a manual page break", () => {
      processor.documentSettings = { h2PageBreaks: true };
      const result = processor.processH2PageBreaks(
        '<h2 id="a">A</h2><div class="page-break"></div>\n<h2 id="b">B</h2>'
      );
      expect(result).toContain('<h2 id="b">B</h2>');
    });

    test("should never break before the footnotes heading", () => {
      processor.documentSettings = { h2PageBreaks: true };
      const result = processor.processH2PageBreaks(
        '<h2 id="a">A</h2><h2 id="footnote-label" class="sr-only">Footnotes</h2>'
      );
      expect(result).not.toContain("h2-page-break");
    });

    test("should add to an existing class instead of replacing it", () => {
      processor.documentSettings = { h2PageBreaks: true };
      const result = processor.processH2PageBreaks('<h2 id="a">A</h2><h2 id="b" class="no-header-rule">B</h2>');
      expect(result).toContain('class="no-header-rule h2-page-break"');
    });

    test("should remove an opt-out comment even when the setting is off", () => {
      processor.documentSettings = {};
      expect(processor.processH2PageBreaks('<h2 id="a">A</h2><!-- h2-break: off -->')).toBe(
        '<h2 class="no-h2-break" id="a">A</h2>'
      );
    });
  });

  describe("processLeadIns", () => {
    test("should tag a paragraph ending in a colon that introduces a table", () => {
      expect(processor.processLeadIns("<p>The hosts are:</p>\n<table><tr><td>a</td></tr></table>")).toContain(
        '<p class="lead-in">The hosts are:</p>'
      );
    });

    test("should see past a generated style block and closing inline tags", () => {
      const html = "<p><strong>The hosts are:</strong></p>\n<style>.t { width: 1px; }</style>\n<table></table>";
      expect(processor.processLeadIns(html)).toContain('<p class="lead-in"><strong>The hosts are:</strong></p>');
    });

    test("should tag a lead-in to a list, a code block, and a figure", () => {
      for (const tag of ["ul", "ol", "pre", "figure"]) {
        expect(processor.processLeadIns(`<p>As follows:</p><${tag}></${tag}>`)).toContain('class="lead-in"');
      }
    });

    test("should leave a paragraph that does not end in a colon alone", () => {
      const html = "<p>The hosts are listed below.</p>\n<table></table>";
      expect(processor.processLeadIns(html)).toBe(html);
    });

    test("should leave a colon paragraph followed by another paragraph alone", () => {
      const html = "<p>Note:</p>\n<p>Something else.</p>\n<table></table>";
      expect(processor.processLeadIns(html)).toBe(html);
    });
  });

  describe("extractDocumentSettings", () => {
    test("should read the h2-page-breaks switch", () => {
      expect(processor.extractDocumentSettings("<!-- h2-page-breaks: ON -->").h2PageBreaks).toBe(true);
      expect(processor.extractDocumentSettings("<!-- h2-page-breaks: off -->").h2PageBreaks).toBe(false);
      expect(processor.extractDocumentSettings("# Title").h2PageBreaks).toBeUndefined();
    });
  });

  describe("hostile input", () => {
    // Uploaded documents reach these on the web. Each must stay linear.
    const withinBudget = (work) => {
      const started = Date.now();
      work();
      expect(Date.now() - started).toBeLessThan(1500);
    };

    test("processLeadIns should not slow down on thousands of unclosed paragraphs", () => {
      withinBudget(() => processor.processLeadIns("<p>x:".repeat(200000)));
    });

    test("processFigures should not slow down on thousands of unclosed image paragraphs", () => {
      withinBudget(() => processor.processFigures('<p class="img-block">'.repeat(200000)));
      withinBudget(() => processor.processFigures('<p class="img-block"></p><p>'.repeat(100000)));
    });

    test("processH2PageBreaks should not backtrack on an unclosed tag full of quotes", () => {
      processor.documentSettings = { h2PageBreaks: true };
      withinBudget(() => processor.processH2PageBreaks("<h2 " + '"'.repeat(5000)));
      withinBudget(() => processor.processH2PageBreaks('<h2 id="a">A</h2><!-- h2-break: off -->'.repeat(50000)));
    });

    test("processH2PageBreaks should not count a custom element as an H2", () => {
      processor.documentSettings = { h2PageBreaks: true };
      const result = processor.processH2PageBreaks('<h2-widget></h2-widget><h2 id="a">A</h2><h2 id="b">B</h2>');
      expect(result).toContain('<h2 id="a">A</h2>');
      expect(result).toContain('<h2 class="h2-page-break" id="b">');
    });

    test("processHeaderRules should not backtrack on an unclosed tag full of quotes", () => {
      withinBudget(() => processor.processHeaderRules("<h2 " + '"'.repeat(5000) + "<!-- rule: off -->"));
    });
  });

  describe("extractDocumentSettings in code blocks", () => {
    test("should not switch h2-page-breaks on from an example in a code block", () => {
      const markdown = "# Title\n\n```markdown\n<!-- h2-page-breaks: ON -->\n```\n";
      expect(processor.extractDocumentSettings(markdown).h2PageBreaks).toBeUndefined();
    });
  });
});
