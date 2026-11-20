/**
 * Tests for LayoutChecker
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const LayoutChecker = require("../src/layout-checker");

describe("LayoutChecker", () => {
  let checker;

  beforeEach(() => {
    checker = new LayoutChecker();
  });

  describe("parseSvgMetrics", () => {
    test("should read the viewBox and the smallest and largest font sizes", () => {
      const svg =
        '<svg viewBox="0 0 1718.2 1065.1"><style>.a{font-size:14px}.b{font-size: 12px;}</style>' +
        '<text font-size="16">x</text></svg>';
      expect(checker.parseSvgMetrics(svg)).toEqual({
        width: 1718.2,
        height: 1065.1,
        naturalWidth: 1718.2,
        smallestFont: 12,
        largestFont: 16,
      });
    });

    test("should ignore font sizes in units it cannot convert", () => {
      const svg = '<svg viewBox="0 0 100 50"><style>.a{font-size:1.2em}.b{font-size:9pt}.c{font-size:80%}.d{font-size:14px}</style></svg>';
      expect(checker.parseSvgMetrics(svg)).toMatchObject({ smallestFont: 14, largestFont: 14 });
    });

    test("should take the natural width from an absolute root width, not a percentage", () => {
      expect(checker.parseSvgMetrics('<svg width="400" viewBox="0 0 800 200"></svg>').naturalWidth).toBe(400);
      expect(checker.parseSvgMetrics('<svg width="100%" viewBox="0 0 800 200"></svg>').naturalWidth).toBe(800);
    });

    test("should accept a viewBox with a negative origin and commas", () => {
      expect(checker.parseSvgMetrics('<svg viewBox="-50,-10,1133,489"></svg>')).toMatchObject({
        width: 1133,
        height: 489,
        smallestFont: null,
      });
    });

    test("should return null without a usable viewBox", () => {
      expect(checker.parseSvgMetrics('<svg width="100" height="50"></svg>')).toBeNull();
      expect(checker.parseSvgMetrics('<svg viewBox="0 0 0 50"></svg>')).toBeNull();
    });
  });

  describe("resolvePrintedWidth", () => {
    test("should cap an unsized image at the content width", () => {
      expect(checker.resolvePrintedWidth(null, 2000)).toBe(720);
      expect(checker.resolvePrintedWidth(null, 500)).toBe(500);
    });

    test("should resolve percentages, pixels, and inches", () => {
      expect(checker.resolvePrintedWidth("100%", 500)).toBe(720);
      expect(checker.resolvePrintedWidth("70%", 500)).toBeCloseTo(504);
      expect(checker.resolvePrintedWidth("300px", 500)).toBe(300);
      expect(checker.resolvePrintedWidth("5in", 500)).toBe(480);
      expect(checker.resolvePrintedWidth("2000px", 500)).toBe(720);
    });

    test("should give up on a unit it cannot resolve", () => {
      expect(checker.resolvePrintedWidth("20em", 500)).toBeNull();
    });
  });

  describe("assessSvg", () => {
    test("should warn when a wide diagram shrinks its text below the minimum", () => {
      const result = checker.assessSvg({ width: 2044, height: 317, smallestFont: 14, largestFont: 14 }, "100%");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("4.9px");
    });

    test("should warn when a small diagram is stretched", () => {
      const result = checker.assessSvg({ width: 400, height: 200, smallestFont: 14, largestFont: 14 }, "100%");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("stretched");
      expect(result.warnings[0]).toContain("img-width: 56%");
    });

    test("should warn when a diagram prints taller than a page allows", () => {
      const result = checker.assessSvg({ width: 700, height: 1400, smallestFont: null, largestFont: null }, "100%");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("tall");
    });

    test("should not warn about height in single-page mode", () => {
      const metrics = { width: 700, height: 1400, smallestFont: null, largestFont: null };
      expect(checker.assessSvg(metrics, "100%", { singlePage: true }).warnings).toEqual([]);
    });

    test("should base its redraw advice on the width the image prints at", () => {
      const result = checker.assessSvg({ width: 2000, height: 400, smallestFont: 14, largestFont: 14 }, "50%");
      expect(result.warnings[0]).toContain("narrower than 560px");
    });

    test("should pass a diagram sized for the page", () => {
      const result = checker.assessSvg({ width: 1000, height: 600, smallestFont: 14, largestFont: 14 }, "100%");
      expect(result.warnings).toEqual([]);
      expect(result.printedHeight).toBeCloseTo(432);
    });
  });

  describe("checkImages", () => {
    let dir;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "2pdf-layout-"));
      fs.writeFileSync(path.join(dir, "wide.svg"), '<svg viewBox="0 0 2000 400"><text font-size="14">x</text></svg>');
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test("should assess a local SVG using its img-width rule", () => {
      const html =
        "<style>\n.img-width-1 { width: 50% !important; height: auto !important; }\n</style>\n" +
        `<p class="img-block"><img class="img-width-1" src="file://${path.join(dir, "wide.svg")}" alt=""></p>`;
      const [image] = checker.checkImages(html, dir);
      expect(image.file).toBe("wide.svg");
      expect(image.widthValue).toBe("50%");
      expect(image.printedWidth).toBe(360);
      expect(image.warnings[0]).toContain("2.5px");
    });

    test("should resolve a relative path against the input directory", () => {
      expect(checker.checkImages('<img src="wide.svg" alt="">', dir)).toHaveLength(1);
    });

    test("should skip remote, inline, raster, and missing images", () => {
      const html =
        '<img src="https://example.com/a.svg"><img src="data:image/svg+xml;base64,AAAA">' +
        '<img src="photo.png"><img src="missing.svg">';
      expect(checker.checkImages(html, dir)).toEqual([]);
    });
  });

  describe("parseBboxLayout", () => {
    const line = (yMin, yMax, text) =>
      `<line xMin="36" yMin="${yMin}" xMax="500" yMax="${yMax}">` +
      text
        .split(" ")
        .map((word) => `<word xMin="36" yMin="${yMin}" xMax="60" yMax="${yMax}">${word}</word>`)
        .join("") +
      "</line>";

    const page = (...lines) => `<page width="612.000000" height="792.000000">${lines.join("")}</page>`;

    test("should measure fullness from the last line of text inside the margins", () => {
      const xml = page(line(40, 52, "Title"), line(378, 390, "Halfway"));
      const [first] = checker.parseBboxLayout(xml, { pageNumbers: true });
      // (390 - 36) / (792 - 54 - 36)
      expect(first.fullness).toBeCloseTo(354 / 702);
      expect(first.firstLine).toBe("Title");
      expect(first.lastLine).toBe("Halfway");
    });

    test("should not count the footer as content", () => {
      const xml = page(line(40, 52, "Only line"), line(750, 760, "Footer 1 of 2"));
      const [first] = checker.parseBboxLayout(xml, { pageNumbers: true });
      expect(first.lastLine).toBe("Only line");
      expect(first.fullness).toBeLessThan(0.05);
    });

    test("should decode entities in the text", () => {
      const [first] = checker.parseBboxLayout(page(line(40, 52, "Q&amp;A")), {});
      expect(first.firstLine).toBe("Q&A");
    });

    test("should leave the watermark out of the content", () => {
      const xml = page(line(40, 52, "Only line"), line(380, 420, "NOT FOR RELEASE"));
      const [first] = checker.parseBboxLayout(xml, { pageNumbers: true, ignoreText: "Not for release" });
      expect(first.lastLine).toBe("Only line");
      expect(first.fullness).toBeLessThan(0.05);
    });

    test("should number pages and report an empty one as empty", () => {
      const pages = checker.parseBboxLayout(page(line(40, 52, "One")) + page(), {});
      expect(pages.map((p) => p.number)).toEqual([1, 2]);
      expect(pages[1].fullness).toBe(0);
    });
  });

  describe("analyzePages", () => {
    const pageOf = (number, fullness, firstLine, lastLine = "text") => ({ number, fullness, firstLine, lastLine });
    const headings = [
      { level: 1, text: "title" },
      { level: 2, text: "appendix a" },
      { level: 3, text: "a.2 diagram" },
    ];

    test("should flag a near-empty page wherever it falls", () => {
      const pages = [pageOf(1, 0.9, "Title"), pageOf(2, 0.05, "A.9 Tail"), pageOf(3, 0.9, "Appendix A")];
      expect(checker.analyzePages(pages, headings)[1].flags).toEqual(["near-empty"]);
    });

    test("should let the last page of a section run short", () => {
      const pages = [pageOf(1, 0.4, "Title"), pageOf(2, 0.9, "Appendix A")];
      const [first] = checker.analyzePages(pages, headings);
      expect(first.endsSection).toBe(true);
      expect(first.flags).toEqual([]);
    });

    test("should flag a sparse page in the middle of a section", () => {
      const pages = [pageOf(1, 0.4, "Title"), pageOf(2, 0.9, "A.2 Diagram")];
      expect(checker.analyzePages(pages, headings)[0].flags).toEqual(["sparse"]);
    });

    test("should flag a page that ends on a heading", () => {
      const pages = [pageOf(1, 0.9, "Title", "A.2 Diagram"), pageOf(2, 0.9, "more")];
      expect(checker.analyzePages(pages, headings)[0].flags).toEqual(["ends on a heading"]);
    });

    test("should recognize a section heading that wraps onto two lines", () => {
      const long = [{ level: 2, text: "appendix d administrative access, deployment, and change management" }];
      const pages = [pageOf(1, 0.4, "Title"), pageOf(2, 0.9, "Appendix D Administrative access, deployment,")];
      expect(checker.analyzePages(pages, long)[0].endsSection).toBe(true);
    });

    test("should flag a page that ends on the last line of a wrapped heading", () => {
      const long = [{ level: 3, text: "d.9 a very long heading that wraps and change management" }];
      const pages = [pageOf(1, 0.9, "Title", "and change management"), pageOf(2, 0.9, "more")];
      expect(checker.analyzePages(pages, long)[0].flags).toEqual(["ends on a heading"]);
    });

    test("should not flag a short single-page document", () => {
      expect(checker.analyzePages([pageOf(1, 0.1, "Title")], headings)[0].flags).toEqual([]);
    });
  });

  describe("extractHeadings", () => {
    test("should return each heading's level and plain, normalized text", () => {
      const html = '<h1 id="t">Big  Title</h1><h3 id="x">A.2 <code>Diagram</code> &amp; more</h3>';
      expect(checker.extractHeadings(html)).toEqual([
        { level: 1, text: "big title" },
        { level: 3, text: "a.2 diagram & more" },
      ]);
    });
  });
});
