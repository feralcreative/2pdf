/**
 * PDF Generator
 *
 * Handles PDF generation using Puppeteer (Chrome automation)
 * Replicates the Chrome command-line options from the original shell script
 */

/* global document */
// `document` is referenced only inside page.evaluate() callbacks, which run in
// the browser context rather than in Node.

const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");
const RequestGuard = require("./request-guard");

class PdfGenerator {
  constructor(options = {}) {
    // Sandboxed mode renders untrusted input (the web version): Chrome keeps
    // its same-origin rules and every request goes through RequestGuard.
    this.sandboxed = options.sandboxed === true;

    // Try to find system Chrome first
    const chromePaths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
    ];

    let executablePath = null;
    for (const chromePath of chromePaths) {
      try {
        fs.accessSync(chromePath);
        executablePath = chromePath;
        break;
      } catch (e) {
        // Continue to next path
      }
    }

    this.chromeOptions = {
      headless: "new",
      args: [
        // Untrusted input is rendered with Chrome's own process sandbox on.
        // TOPDF_CHROME_NO_SANDBOX=1 turns it off for hosts that cannot run
        // it, which leaves a Chrome bug one step from the server itself.
        ...(this.sandboxed && process.env.TOPDF_CHROME_NO_SANDBOX !== "1" ? [] : ["--no-sandbox"]),
        "--disable-dev-shm-usage",
        ...(this.sandboxed ? [] : ["--disable-web-security", "--allow-file-access-from-files"]),
        "--disable-logging",
        "--log-level=3",
      ],
      timeout: 60000,
    };

    if (executablePath) {
      this.chromeOptions.executablePath = executablePath;
      console.log(chalk.gray("🔍 Using system Chrome:", executablePath));
    }
  }

  // Tag every table short enough to be kept whole on a page.
  //
  // CSS can say "do not split this table", but not "only if it is short". Asked
  // to keep a table taller than the space left, Chrome moves it to the next
  // page, and for a long table that leaves most of a page blank. So measure the
  // tables as they will print and tag only those that fit on one page with
  // room left for a heading and an introduction (85% of the page). A table
  // that fits on a page is never split; a longer one splits, and the
  // stylesheet keeps at least three rows on each side of the break.
  //
  // The measurement must not change what prints. The viewport is left alone (a
  // resize would re-run media queries and could swap responsive images after
  // they have loaded); instead the document is squeezed to the printed content
  // width for the length of one synchronous script, under print styles, and
  // then put back.
  async markBlocksThatFit(page, pageNumbers) {
    const contentWidth = 720; // 7.5in: Letter less 0.5in side margins
    const contentHeight = pageNumbers ? 936 : 960; // 9.75in with a footer, 10in without
    const limit = contentHeight * 0.85;

    try {
      await page.emulateMediaType("print");

      const kept = await page.evaluate(
        (width, maxHeight) => {
          const root = document.documentElement;
          const previousWidth = root.style.width;
          root.style.width = `${width}px`;

          let count = 0;
          for (const table of document.querySelectorAll("table")) {
            if (table.getBoundingClientRect().height <= maxHeight) {
              table.classList.add("keep-together");
              count++;
            }
          }

          root.style.width = previousWidth;
          return count;
        },
        contentWidth,
        limit
      );

      if (kept > 0) {
        console.log(chalk.gray(`📐 Keeping ${kept} table(s) whole`));
      }
    } catch (e) {
      console.log(chalk.yellow("⚠️ Could not measure tables, continuing..."));
    } finally {
      try {
        await page.emulateMediaType(null);
      } catch (e) {
        // Printing switches to print styles on its own
      }
    }
  }

  async generatePdf(
    htmlPath,
    outputPath,
    singlePage = false,
    pageNumbers = false,
    documentTitle = "",
    disclosure = "",
    pageNumberFormat = "X of Y",
  ) {
    let browser = null;

    if (this.sandboxed) {
      // The footer template is HTML; an untrusted title must stay text.
      documentTitle = this.escapeHtml(documentTitle);
      disclosure = this.escapeHtml(disclosure);
    }

    const headerTemplate = "<div></div>";
    const topMargin = "0.5in";

    try {
      console.log(chalk.blue("🚀 Launching Chrome..."));

      // Launch browser with the same options as the shell script
      browser = await puppeteer.launch(this.chromeOptions);

      const page = await browser.newPage();

      // Set viewport for consistent rendering
      await page.setViewport({
        width: 1200,
        height: 800,
        deviceScaleFactor: 1,
      });

      // Load the HTML file
      const htmlUrl = `file://${path.resolve(htmlPath)}`;

      if (this.sandboxed) {
        const guard = new RequestGuard(htmlUrl);
        await page.setRequestInterception(true);
        page.on("request", (request) => guard.handle(request));
      }
      console.log(chalk.gray("📄 Loading HTML:"), htmlUrl);

      await page.goto(htmlUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      // Wait for fonts to load
      try {
        await page.evaluate(() => {
          return document.fonts.ready;
        });
      } catch (e) {
        console.log(chalk.yellow("⚠️ Font loading check failed, continuing..."));
      }

      // Remote images are fetched through RequestGuard, which is slower than
      // a local file, so wait for them (up to 15 seconds) before printing.
      if (this.sandboxed) {
        try {
          await page.evaluate(
            (deadlineMs) =>
              Promise.race([
                Promise.all(
                  Array.from(document.images)
                    .filter((image) => !image.complete)
                    .map(
                      (image) =>
                        new Promise((resolve) => {
                          image.addEventListener("load", resolve, { once: true });
                          image.addEventListener("error", resolve, { once: true });
                        })
                    )
                ),
                new Promise((resolve) => setTimeout(resolve, deadlineMs)),
              ]),
            15000
          );
        } catch (e) {
          console.log(chalk.yellow("⚠️ Image loading check failed, continuing..."));
        }
      }

      // Brief wait for rendering
      await page.waitForTimeout(500);

      if (!singlePage) {
        await this.markBlocksThatFit(page, pageNumbers);
      }

      // Generate PDF with options matching the shell script
      console.log(chalk.blue("📄 Generating PDF..."));

      let pdfOptions;

      if (singlePage) {
        // Single-page mode: Force a truly single page using custom page size
        const contentHeight = await page.evaluate(() => {
          return Math.max(
            document.body.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.clientHeight,
            document.documentElement.scrollHeight,
            document.documentElement.offsetHeight
          );
        });

        // Calculate page dimensions in points (72 points = 1 inch)
        const widthPoints = 8.5 * 72; // 8.5 inches
        const heightPoints = Math.max(11 * 72, ((contentHeight + 200) * 72) / 96); // Convert px to points, minimum 11"

        console.log(
          chalk.gray(`📏 Single-page mode: ${contentHeight}px content → ${(heightPoints / 72).toFixed(1)}" page`)
        );

        // Set viewport to match the page size
        await page.setViewport({
          width: Math.round((widthPoints * 96) / 72), // Convert points to pixels for viewport
          height: Math.round((heightPoints * 96) / 72),
          deviceScaleFactor: 1,
        });

        // Wait for re-render with new viewport
        await page.waitForTimeout(1000);

        pdfOptions = {
          path: outputPath,
          width: `${widthPoints / 72}in`, // Convert points to inches
          height: `${heightPoints / 72}in`,
          margin: {
            top: topMargin,
            right: "0.5in",
            bottom: pageNumbers ? "0.75in" : "0.5in", // Extra space for page numbers
            left: "0.5in",
          },
          printBackground: true,
          preferCSSPageSize: false, // Use our custom dimensions
          displayHeaderFooter: pageNumbers,
          headerTemplate: headerTemplate,
          footerTemplate: pageNumbers
            ? `<div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; width: 100%; display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; padding: 0 0.5in;">
                <span style="color: #666; justify-self: start;">${documentTitle || ""}</span>
                <span style="color: #666; text-transform: uppercase; justify-self: center;">${disclosure || ""}</span>
                <span style="color: #666; justify-self: end;">${new Date()
                  .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                  .replace(/,/g, "")} <span style="color: #ccc;">|</span> ${
                pageNumberFormat === "X"
                  ? '<span class="pageNumber"></span>'
                  : '<span class="pageNumber"></span> of <span class="totalPages"></span>'
              }</span>
              </div>`
            : "",
        };
      } else {
        // Standard multi-page mode
        pdfOptions = {
          path: outputPath,
          format: "Letter",
          margin: {
            top: topMargin,
            right: "0.5in",
            bottom: pageNumbers ? "0.75in" : "0.5in", // Extra space for page numbers
            left: "0.5in",
          },
          printBackground: true,
          preferCSSPageSize: false,
          displayHeaderFooter: pageNumbers,
          headerTemplate: headerTemplate,
          footerTemplate: pageNumbers
            ? `<div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; width: 100%; display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; padding: 0 0.5in;">
                <span style="color: #666; justify-self: start;">${documentTitle || ""}</span>
                <span style="color: #666; text-transform: uppercase; justify-self: center;">${disclosure || ""}</span>
                <span style="color: #666; justify-self: end;">${new Date()
                  .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                  .replace(/,/g, "")} <span style="color: #ccc;">|</span> ${
                pageNumberFormat === "X"
                  ? '<span class="pageNumber"></span>'
                  : '<span class="pageNumber"></span> of <span class="totalPages"></span>'
              }</span>
              </div>`
            : "",
        };
      }

      await page.pdf(pdfOptions);

      console.log(chalk.green("✅ PDF generated successfully"));
    } catch (error) {
      throw new Error(`PDF generation failed: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async findChrome() {
    // This method is kept for compatibility but Puppeteer handles Chrome detection
    // Puppeteer will automatically download and use its own Chrome if needed
    return "puppeteer-chrome";
  }
}

module.exports = PdfGenerator;
