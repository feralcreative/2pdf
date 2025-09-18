/**
 * PDF Generator
 *
 * Handles PDF generation using Puppeteer (Chrome automation)
 * Replicates the Chrome command-line options from the original shell script
 */

const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");

class PdfGenerator {
  constructor() {
    // Try to find system Chrome first
    const chromePaths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
    ];

    let executablePath = null;
    for (const chromePath of chromePaths) {
      try {
        require("fs").accessSync(chromePath);
        executablePath = chromePath;
        break;
      } catch (e) {
        // Continue to next path
      }
    }

    this.chromeOptions = {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--allow-file-access-from-files",
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

  async generatePdf(htmlPath, outputPath, singlePage = false) {
    let browser = null;

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

      // Brief wait for rendering
      await page.waitForTimeout(500);

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
            top: "0.5in",
            right: "0.5in",
            bottom: "0.5in",
            left: "0.5in",
          },
          printBackground: true,
          preferCSSPageSize: false, // Use our custom dimensions
          displayHeaderFooter: false,
          headerTemplate: "",
          footerTemplate: "",
        };
      } else {
        // Standard multi-page mode
        pdfOptions = {
          path: outputPath,
          format: "Letter",
          margin: {
            top: "0.5in",
            right: "0.5in",
            bottom: "0.5in",
            left: "0.5in",
          },
          printBackground: true,
          preferCSSPageSize: false,
          displayHeaderFooter: false,
          headerTemplate: "",
          footerTemplate: "",
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

  async findChrome() {
    // This method is kept for compatibility but Puppeteer handles Chrome detection
    // Puppeteer will automatically download and use its own Chrome if needed
    return "puppeteer-chrome";
  }
}

module.exports = PdfGenerator;
