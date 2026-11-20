const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const which = require("which");

// The printable area of a US Letter page with 2pdf's margins: 0.5in at the top
// and sides, and 0.75in at the bottom when page numbers are on (0.5in when off).
const CONTENT_WIDTH_PX = 720; // 7.5in at 96 CSS px per inch
const PAGE_HEIGHT_PT = 792;
const TOP_MARGIN_PT = 36;
const BOTTOM_MARGIN_PT = 36;
const BOTTOM_MARGIN_WITH_FOOTER_PT = 54;

// Text inside a diagram should print between these sizes, in CSS px
const MIN_TEXT_PX = 9;
const MAX_TEXT_PX = 14;
// Tallest an image can print and still leave room for a heading and a caption
const MAX_IMAGE_HEIGHT_PX = 768; // 8in

// A page that is not the last of its section should reach this far down
const SPARSE_BELOW = 0.6;
// Any page that stops short of this is nearly empty
const NEAR_EMPTY_BELOW = 0.2;

class LayoutChecker {
  // ---------------------------------------------------------------------------
  // Diagram sizing: will the text inside each SVG be readable once printed?
  // ---------------------------------------------------------------------------

  // Read what decides an SVG's printed size: its viewBox and its font sizes.
  parseSvgMetrics(svgContent) {
    const viewBoxMatch = svgContent.match(/\bviewBox=["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)\s*["']/);
    if (!viewBoxMatch) {
      return null;
    }

    const width = parseFloat(viewBoxMatch[3]);
    const height = parseFloat(viewBoxMatch[4]);
    if (!(width > 0) || !(height > 0)) {
      return null;
    }

    // Font sizes appear as CSS (font-size: 14px) and as attributes
    // (font-size="14"). Only px and unitless sizes are in viewBox units; em, pt,
    // and percentages depend on context this cannot see, so they are skipped.
    const fontSizes = [];
    const fontSizeRegex = /font-size\s*[:=]\s*["']?\s*([\d.]+)(?:px)?(?![\d.a-z%])/gi;
    let match;
    while ((match = fontSizeRegex.exec(svgContent)) !== null) {
      const size = parseFloat(match[1]);
      if (size > 0) {
        fontSizes.push(size);
      }
    }

    // An <img> takes its natural width from the root element's width when that
    // is an absolute length, and from the viewBox otherwise (Mermaid writes
    // width="100%", which gives no natural size).
    const rootTag = (svgContent.match(/<svg\b[^>]*>/i) || [""])[0];
    const widthAttribute = rootTag.match(/\swidth=["']\s*([\d.]+)(?:px)?\s*["']/i);
    const naturalWidth = widthAttribute && parseFloat(widthAttribute[1]) > 0 ? parseFloat(widthAttribute[1]) : width;

    return {
      width,
      height,
      naturalWidth,
      smallestFont: fontSizes.length ? Math.min(...fontSizes) : null,
      largestFont: fontSizes.length ? Math.max(...fontSizes) : null,
    };
  }

  // Turn an img-width value into a printed width in CSS px. Returns null for a
  // unit this cannot resolve (em, rem, and so on).
  resolvePrintedWidth(widthValue, naturalWidth) {
    if (!widthValue) {
      return Math.min(naturalWidth, CONTENT_WIDTH_PX);
    }

    const value = widthValue.trim().toLowerCase();
    const number = parseFloat(value);
    if (!(number > 0)) {
      return null;
    }

    let width;
    if (value.endsWith("%")) {
      width = (CONTENT_WIDTH_PX * number) / 100;
    } else if (value.endsWith("px")) {
      width = number;
    } else if (value.endsWith("in")) {
      width = number * 96;
    } else {
      return null;
    }

    // img { max-width: 100% } caps every image at the content width
    return Math.min(width, CONTENT_WIDTH_PX);
  }

  // Work out how one SVG will print, and what is wrong with that.
  assessSvg(metrics, widthValue, { singlePage = false } = {}) {
    const printedWidth = this.resolvePrintedWidth(widthValue, metrics.naturalWidth || metrics.width);
    if (printedWidth === null) {
      return { printedWidth: null, warnings: [] };
    }

    const scale = printedWidth / metrics.width;
    const printedHeight = metrics.height * scale;
    const warnings = [];

    if (metrics.smallestFont !== null) {
      const smallestText = metrics.smallestFont * scale;
      if (smallestText < MIN_TEXT_PX) {
        warnings.push(
          `its ${metrics.smallestFont}px text will print at ${smallestText.toFixed(1)}px, under the ` +
            `${MIN_TEXT_PX}px minimum. It is drawn ${Math.round(metrics.width)}px wide and prints ` +
            `${Math.round(printedWidth)}px wide; redraw it narrower than ` +
            `${Math.round((metrics.smallestFont * printedWidth) / MIN_TEXT_PX)}px or split it`
        );
      }
    }

    if (metrics.largestFont !== null) {
      const largestText = metrics.largestFont * scale;
      const stretched = scale > 1;
      if (stretched && largestText > MAX_TEXT_PX) {
        const suggested = Math.max(10, Math.round((metrics.width / CONTENT_WIDTH_PX) * 100));
        warnings.push(
          `it is stretched from ${Math.round(metrics.width)}px to ${Math.round(printedWidth)}px, so its text ` +
            `prints at ${largestText.toFixed(1)}px. Try <!-- img-width: ${suggested}% -->`
        );
      }
    }

    // A single continuous page grows to fit, so height is no concern there
    if (!singlePage && printedHeight > MAX_IMAGE_HEIGHT_PX) {
      warnings.push(
        `it will print ${(printedHeight / 96).toFixed(1)}in tall, which leaves no room on the page for a ` +
          `heading and caption (limit ${MAX_IMAGE_HEIGHT_PX / 96}in)`
      );
    }

    return { printedWidth, printedHeight, warnings };
  }

  // Find every local SVG image in the processed HTML and assess it. Remote and
  // inline images are skipped; so is anything this cannot read.
  checkImages(htmlContent, inputDir, options = {}) {
    const results = [];
    const imgRegex = /<img\b[^>]*>/gi;
    let match;

    while ((match = imgRegex.exec(htmlContent)) !== null) {
      const tag = match[0];
      const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
      if (!srcMatch) continue;

      let src = srcMatch[1];
      if (/^(https?:|data:)/i.test(src)) continue;
      if (/^file:\/\//i.test(src)) {
        src = decodeURI(src.replace(/^file:\/\//i, ""));
      } else if (inputDir) {
        src = path.resolve(inputDir, src);
      }
      if (!/\.svg$/i.test(src)) continue;

      let svgContent;
      try {
        svgContent = fs.readFileSync(src, "utf8");
      } catch (error) {
        continue;
      }

      const metrics = this.parseSvgMetrics(svgContent);
      if (!metrics) continue;

      // <!-- img-width: --> leaves class img-width-N on the image and a
      // matching rule in a <style> block
      let widthValue = null;
      const classMatch = tag.match(/\b(img-width-\d+)\b/);
      if (classMatch) {
        const ruleMatch = htmlContent.match(new RegExp(`\\.${classMatch[1]}\\s*\\{\\s*width:\\s*([^;!]+)`));
        if (ruleMatch) {
          widthValue = ruleMatch[1].trim();
        }
      }

      const assessment = this.assessSvg(metrics, widthValue, options);
      results.push({ file: path.basename(src), ...metrics, widthValue, ...assessment });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Page report: how full is each page of the finished PDF?
  // ---------------------------------------------------------------------------

  // pdftotext (Poppler) is optional. Without it there is no page report.
  findPdfToText() {
    return which.sync("pdftotext", { nothrow: true });
  }

  readPdfLayout(pdfPath) {
    const pdfToText = this.findPdfToText();
    if (!pdfToText) {
      return null;
    }

    return execFileSync(pdfToText, ["-bbox-layout", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
  }

  decodeEntities(text) {
    return text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(parseInt(code, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&amp;/g, "&");
  }

  normalize(text) {
    return this.decodeEntities(text).replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Pull every heading's level and plain text out of the processed HTML, so the
  // page report can tell a section start from a stranded heading.
  extractHeadings(htmlContent) {
    const headings = [];
    const headingRegex = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let match;

    while ((match = headingRegex.exec(htmlContent)) !== null) {
      const text = this.normalize(match[2].replace(/<[^>]+>/g, ""));
      if (text) {
        headings.push({ level: parseInt(match[1], 10), text });
      }
    }

    return headings;
  }

  // Turn pdftotext's -bbox-layout output into one record per page: the lines of
  // text inside the printable area, top to bottom.
  //
  // ignoreText is the watermark, if any: it is real text in the PDF, stamped
  // across the middle of every page, and would otherwise count as content.
  parseBboxLayout(xml, { pageNumbers = false, ignoreText = null } = {}) {
    const ignored = ignoreText ? this.normalize(ignoreText) : null;
    const pages = [];
    const pageRegex = /<page\b([^>]*)>([\s\S]*?)<\/page>/gi;
    let pageMatch;

    while ((pageMatch = pageRegex.exec(xml)) !== null) {
      const heightMatch = pageMatch[1].match(/\bheight="([\d.]+)"/);
      const pageHeight = heightMatch ? parseFloat(heightMatch[1]) : PAGE_HEIGHT_PT;
      const top = TOP_MARGIN_PT;
      const bottom = pageHeight - (pageNumbers ? BOTTOM_MARGIN_WITH_FOOTER_PT : BOTTOM_MARGIN_PT);

      const lines = [];
      const lineRegex = /<line\b([^>]*)>([\s\S]*?)<\/line>/gi;
      let lineMatch;

      while ((lineMatch = lineRegex.exec(pageMatch[2])) !== null) {
        const yMin = parseFloat((lineMatch[1].match(/\byMin="([-\d.]+)"/) || [])[1]);
        const yMax = parseFloat((lineMatch[1].match(/\byMax="([-\d.]+)"/) || [])[1]);
        if (Number.isNaN(yMin) || Number.isNaN(yMax)) continue;
        // The footer sits in the bottom margin and is not content
        if (yMin >= bottom) continue;

        const words = [];
        const wordRegex = /<word\b[^>]*>([\s\S]*?)<\/word>/gi;
        let wordMatch;
        while ((wordMatch = wordRegex.exec(lineMatch[2])) !== null) {
          words.push(this.decodeEntities(wordMatch[1]));
        }
        if (!words.length) continue;

        const text = words.join(" ");
        if (ignored && this.normalize(text) === ignored) continue;

        lines.push({ yMin, yMax, text });
      }

      lines.sort((a, b) => a.yMin - b.yMin);

      const lastY = lines.length ? Math.max(...lines.map((line) => line.yMax)) : top;
      const fullness = Math.max(0, Math.min(1, (lastY - top) / (bottom - top)));

      pages.push({
        number: pages.length + 1,
        fullness,
        firstLine: lines.length ? lines[0].text : "",
        lastLine: lines.length ? lines[lines.length - 1].text : "",
      });
    }

    return pages;
  }

  // Decide what, if anything, is wrong with each page.
  //
  // Fullness is measured from text alone, so a page that ends on an image with
  // no caption beneath it reads as less full than it is.
  //
  // A long heading wraps, and pdftotext reports each printed line on its own,
  // so a line is matched against the start of a heading (for the top of a page)
  // or the end of one (for the foot), not only against the whole thing.
  analyzePages(pages, headings = []) {
    const MIN_PARTIAL = 12;
    const matches = (line, candidates, edge) => {
      const text = this.normalize(line);
      if (!text) return false;
      return candidates.some(
        (heading) => heading === text || (text.length >= MIN_PARTIAL && heading[edge](text) && heading !== text)
      );
    };
    const allHeadings = headings.map((heading) => heading.text);
    const sectionHeadings = headings.filter((heading) => heading.level <= 2).map((heading) => heading.text);

    return pages.map((page, index) => {
      const next = pages[index + 1];
      const isLast = !next;
      const flags = [];

      // The page before a new H1 or H2 is the tail of its section, and is
      // allowed to run short
      const endsSection = isLast || matches(next.firstLine, sectionHeadings, "startsWith");

      if (page.fullness < NEAR_EMPTY_BELOW && !(index === 0 && isLast)) {
        flags.push("near-empty");
      } else if (page.fullness < SPARSE_BELOW && !endsSection) {
        flags.push("sparse");
      }

      if (!isLast && matches(page.lastLine, allHeadings, "endsWith")) {
        flags.push("ends on a heading");
      }

      return { ...page, endsSection, flags };
    });
  }

  // The whole page report for a finished PDF, or null when pdftotext is missing.
  report(pdfPath, htmlContent, { pageNumbers = false, ignoreText = null } = {}) {
    const xml = this.readPdfLayout(pdfPath);
    if (xml === null) {
      return null;
    }

    const pages = this.parseBboxLayout(xml, { pageNumbers, ignoreText });
    return this.analyzePages(pages, this.extractHeadings(htmlContent || ""));
  }
}

module.exports = LayoutChecker;
