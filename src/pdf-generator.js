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

  async generatePdf(htmlPath, outputPath) {
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

      const pdfOptions = {
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
