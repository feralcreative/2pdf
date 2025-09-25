/**
 * 2PDF - Markdown and HTML to PDF Converter
 *
 * Main entry point for the 2pdf converter
 * Provides a Node.js implementation for converting both Markdown and HTML files to PDF
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const chalk = require("chalk");

const TokenProcessor = require("./token-processor");
const ConfigManager = require("./config-manager");
const StyleManager = require("./style-manager");
const ContentProcessor = require("./content-processor");
const PdfGenerator = require("./pdf-generator");

class ToPdf {
  constructor(options = {}) {
    this.options = {
      configPath: options.configPath || null,
      outputPath: options.outputPath || null,
      stylePath: options.stylePath || null,
      themeColor: options.themeColor || null,
      singlePage: options.singlePage || false,
      openAfterGeneration: options.openAfterGeneration !== false,
      debug: options.debug || false,
      verbose: options.verbose || false,
      ...options,
    };

    // Set up paths
    this.currentDir = process.cwd();
    this.scriptDir = path.dirname(path.dirname(__filename)); // Go up from src/ to root
    this.tempDir = path.join(os.tmpdir(), "2pdf-" + Date.now());

    // Initialize components
    this.configManager = new ConfigManager(this.scriptDir, this.currentDir);
    this.tokenProcessor = new TokenProcessor(this.configManager);
    this.styleManager = new StyleManager(this.scriptDir);
    this.contentProcessor = null; // Will be initialized with input directory
    this.pdfGenerator = new PdfGenerator();

    if (this.options.verbose) {
      console.log(chalk.gray("📁 Working directory:"), this.currentDir);
      console.log(chalk.gray("📁 Script directory:"), this.scriptDir);
      console.log(chalk.gray("📁 Temp directory:"), this.tempDir);
    }
  }

  async convert(inputFile = "README.md") {
    try {
      // Ensure temp directory exists
      await fs.ensureDir(this.tempDir);

      // Resolve input file path
      const inputPath = path.resolve(this.currentDir, inputFile);

      // Check if input file exists
      if (!(await fs.pathExists(inputPath))) {
        throw new Error(`Input file not found: ${inputPath}`);
      }

      if (this.options.verbose) {
        console.log(chalk.gray("📄 Input file:"), inputPath);
      }

      // Initialize content processor with input directory for image path resolution
      this.contentProcessor = new ContentProcessor(path.dirname(inputPath));

      // Load configuration
      const config = await this.configManager.loadConfig(this.options.configPath);

      // Determine file type and process accordingly
      const fileExtension = path.extname(inputPath).toLowerCase();
      let htmlContent;

      if (fileExtension === ".html" || fileExtension === ".htm") {
        // Process HTML file directly
        console.log(chalk.blue("📄 Processing HTML file..."));
        let htmlFileContent = await fs.readFile(inputPath, "utf8");

        // Process tokens in HTML
        console.log(chalk.blue("🏷️ Processing tokens in HTML file..."));
        htmlFileContent = await this.tokenProcessor.processTokensInContent(htmlFileContent, config);

        // Process special content tags in HTML
        console.log(chalk.blue("🏷️ Processing special content tags..."));
        htmlContent = await this.contentProcessor.processHtmlContent(htmlFileContent);
      } else {
        // Process markdown file (default behavior)
        console.log(chalk.blue("📄 Processing Markdown file..."));

        // Process tokens in markdown
        console.log(chalk.blue("🏷️ Processing tokens in markdown file..."));
        const processedMarkdown = await this.tokenProcessor.processTokens(inputPath, config);

        // Process special content (PDF-only, page breaks, etc.)
        console.log(chalk.blue("🏷️ Processing special content tags..."));
        const processedContent = await this.contentProcessor.processContent(processedMarkdown);

        // Convert markdown to HTML
        console.log(chalk.blue("📝 Converting markdown to HTML..."));
        htmlContent = await this.contentProcessor.markdownToHtml(processedContent);
      }

      // Get document settings extracted from the content
      const documentSettings = this.contentProcessor.getDocumentSettings();

      // Use document settings for colors and font size, with CLI options as fallback
      const effectiveThemeColor = documentSettings.themeColor || this.options.themeColor;
      const bodyColor = documentSettings.bodyColor;
      const linkColor = documentSettings.linkColor;
      const linkUnderline = documentSettings.linkUnderline;
      const baseFontSize = documentSettings.baseFontSize;
      const headerSize = documentSettings.headerSize;
      const bodySize = documentSettings.bodySize;
      const pageNumbers = documentSettings.pageNumbers;
      const pageNumberFormat = documentSettings.pageNumberFormat || "X of Y";
      const documentTitle = documentSettings.documentTitle;
      const disclosure = documentSettings.disclosure;

      // Apply styling based on file type
      console.log(chalk.blue("🎨 Applying styles..."));
      const isHtmlFile = fileExtension === ".html" || fileExtension === ".htm";
      const styledHtml = await this.styleManager.applyStyles(
        htmlContent,
        this.options.stylePath,
        isHtmlFile,
        effectiveThemeColor,
        config,
        this.options.singlePage,
        baseFontSize,
        bodyColor,
        linkColor,
        linkUnderline,
        headerSize,
        bodySize
      );

      // Save styled HTML to temp file
      const htmlPath = path.join(this.tempDir, "styled.html");
      await fs.writeFile(htmlPath, styledHtml);

      if (this.options.debug) {
        console.log(chalk.gray("🔍 Debug: HTML file saved as"), htmlPath);
      }

      // Generate PDF
      console.log(chalk.blue("📄 Converting to PDF..."));
      const outputPath =
        this.options.outputPath ||
        path.join(path.dirname(inputPath), path.basename(inputFile, path.extname(inputFile)) + ".pdf");

      await this.pdfGenerator.generatePdf(
        htmlPath,
        outputPath,
        this.options.singlePage,
        pageNumbers,
        documentTitle,
        disclosure,
        pageNumberFormat
      );

      // Get file stats
      const stats = await fs.stat(outputPath);
      const fileSize = this.formatFileSize(stats.size);

      // Open PDF if requested (macOS only)
      let opened = false;
      if (this.options.openAfterGeneration && process.platform === "darwin") {
        try {
          execSync(`open "${outputPath}"`, { stdio: "ignore" });
          opened = true;
        } catch (error) {
          if (this.options.verbose) {
            console.log(chalk.yellow("⚠️ Could not open PDF automatically"));
          }
        }
      }

      // Clean up temp directory unless in debug mode
      if (!this.options.debug) {
        await fs.remove(this.tempDir);
      } else {
        console.log(chalk.gray("🔍 Debug files kept in:"), this.tempDir);
      }

      return {
        success: true,
        outputPath: path.basename(outputPath),
        fullPath: outputPath,
        fileSize,
        opened,
      };
    } catch (error) {
      // Clean up temp directory on error
      if (await fs.pathExists(this.tempDir)) {
        await fs.remove(this.tempDir);
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  formatFileSize(bytes) {
    const sizes = ["B", "KB", "MB", "GB"];
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
  }
}

module.exports = { ToPdf };
