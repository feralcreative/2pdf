/**
 * 2PDF - Markdown and HTML to PDF Converter
 *
 * Main entry point for the 2pdf converter
 * Provides a Node.js implementation for converting both Markdown and HTML files to PDF
 */

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const chalk = require("chalk");

const TokenProcessor = require("./token-processor");
const ConfigManager = require("./config-manager");
const StyleManager = require("./style-manager");
const ContentProcessor = require("./content-processor");
const PdfGenerator = require("./pdf-generator");
const LayoutChecker = require("./layout-checker");

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
      // Print how full each page of the finished PDF is (needs pdftotext)
      layoutReport: options.layoutReport || false,
      // Sandboxed mode treats the input as untrusted (the web version): no
      // config search, no machine tokens, bundled logos only, a Content
      // Security Policy on the rendered page, and guarded Chrome requests.
      sandboxed: options.sandboxed === true,
      ...options,
    };
    if (this.options.sandboxed) {
      this.options.openAfterGeneration = false;
      this.options.debug = false;
    }

    // Set up paths
    this.currentDir = process.cwd();
    this.scriptDir = path.dirname(path.dirname(__filename)); // Go up from src/ to root
    // Created per conversion by fs.mkdtemp, so it is unique and private to this user.
    this.tempDir = null;

    // Initialize components
    this.configManager = new ConfigManager(this.scriptDir, this.currentDir, { sandboxed: this.options.sandboxed });
    this.tokenProcessor = new TokenProcessor(this.configManager);
    this.styleManager = new StyleManager(this.scriptDir);
    this.contentProcessor = null; // Will be initialized with input directory
    this.pdfGenerator = new PdfGenerator({ sandboxed: this.options.sandboxed });
    this.layoutChecker = new LayoutChecker();

    if (this.options.verbose) {
      console.log(chalk.gray("📁 Working directory:"), this.currentDir);
      console.log(chalk.gray("📁 Script directory:"), this.scriptDir);
    }
  }

  // Version utility functions for sequential output
  parseVersion(versionString) {
    const match = versionString.match(/^(\d{2})\.(\d{2})$/);
    if (!match) return { major: 0, minor: 0 };
    return { major: parseInt(match[1]), minor: parseInt(match[2]) };
  }

  incrementVersion(major, minor) {
    minor++;
    if (minor > 99) {
      minor = 0;
      major++;
      if (major > 99) {
        major = 0; // Wrap around to 00.00
      }
    }
    return { major, minor };
  }

  formatVersion(major, minor) {
    return `${major.toString().padStart(2, "0")}.${minor.toString().padStart(2, "0")}`;
  }

  formatUtcStamp(date) {
    const pad = (n) => String(n).padStart(2, "0");
    const y = pad(date.getUTCFullYear() % 100);
    const mo = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    const h = pad(date.getUTCHours());
    const mi = pad(date.getUTCMinutes());
    return `${y}${mo}${d}T${h}${mi}Z`;
  }

  // A logo named by an untrusted document may only be a plain file name, which
  // resolves inside public/assets/images. No directories, no absolute paths.
  isBundledLogoName(logo) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]*\.(svg|png)$/i.test(logo) && !logo.includes("..");
  }

  // Reduces a document-supplied output name to a plain file name in the
  // input's own directory.
  safeOutputName(name) {
    const base = path
      .basename(name.replace(/\\/g, "/"))
      .replace(/[^A-Za-z0-9._ -]/g, "_")
      .replace(/^\.+/, "");
    return /.\.pdf$/i.test(base) ? base : "document.pdf";
  }

  // Adds a Content Security Policy to the rendered page so nothing an
  // untrusted document carries can run or phone out. The only script allowed
  // is the wrapper's own (the last one in the document), matched by hash;
  // images, fonts, and stylesheets may come from data: or https: URLs, which
  // RequestGuard then vets one by one.
  applyContentSecurityPolicy(styledHtml) {
    const open = styledHtml.lastIndexOf("<script>");
    const close = styledHtml.lastIndexOf("</script>");
    let scriptSource = "'none'";
    if (open !== -1 && close > open) {
      const body = styledHtml.slice(open + "<script>".length, close);
      scriptSource = `'sha256-${crypto.createHash("sha256").update(body, "utf8").digest("base64")}'`;
    }
    const policy = [
      "default-src 'none'",
      `script-src ${scriptSource}`,
      "style-src 'unsafe-inline' https:",
      "img-src data: https:",
      "font-src data: https:",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; ");
    const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
    return styledHtml.replace(/<head>/i, (match) => `${match}\n    ${meta}`);
  }

  async updateVersionInFile(filePath, newVersion) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const versionRegex = /<!--\s*version-number:\s*([^-]+?)\s*-->/i;

      if (versionRegex.test(content)) {
        // Replace existing version
        const updatedContent = content.replace(versionRegex, `<!-- version-number: ${newVersion} -->`);
        await fs.writeFile(filePath, updatedContent, "utf8");
        console.log(chalk.green(`📄 Updated version number to ${newVersion} in ${path.basename(filePath)}`));
      } else {
        // Add new version comment after the last HTML comment at the top
        const lines = content.split("\n");
        let insertIndex = 0;

        // Find the last HTML comment at the beginning of the file
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim().startsWith("<!--") && lines[i].trim().endsWith("-->")) {
            insertIndex = i + 1;
          } else if (lines[i].trim() !== "") {
            break; // Stop at first non-empty, non-comment line
          }
        }

        lines.splice(insertIndex, 0, `<!-- version-number: ${newVersion} -->`);
        const updatedContent = lines.join("\n");
        await fs.writeFile(filePath, updatedContent, "utf8");
        console.log(chalk.green(`📄 Added version number ${newVersion} to ${path.basename(filePath)}`));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Warning: Could not update version number in file: ${error.message}`));
    }
  }

  async convert(inputFile = "README.md") {
    try {
      // Ensure temp directory exists
      this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "2pdf-"));
      if (this.options.verbose) {
        console.log(chalk.gray("📁 Temp directory:"), this.tempDir);
      }

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
      // Sandboxed runs never search for a config; they use the one they are given or none.
      const config =
        this.options.sandboxed && !this.options.configPath
          ? {}
          : await this.configManager.loadConfig(this.options.configPath);

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

      // Warn about diagrams whose text will print too small, too large, or
      // whose height will not fit a page. Reads local SVG files, so it never
      // runs on untrusted input.
      const imageWarnings = this.options.sandboxed ? [] : this.warnAboutImages(htmlContent, path.dirname(inputPath));


      // Use document settings for colors and font size, with CLI options as fallback
      const effectiveThemeColor = documentSettings.themeColor || this.options.themeColor;
      const themeColorPrimary = documentSettings.themeColorPrimary;
      const themeColorSecondary = documentSettings.themeColorSecondary;
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
      const sequentialOutput = documentSettings.sequentialOutput;
      const versionNumber = documentSettings.versionNumber || "00.00";
      const lineHeight = documentSettings.lineHeight;
      const paragraphSpacing = documentSettings.paragraphSpacing;
      const headerSpacing = documentSettings.headerSpacing;
      const listItemSpacing = documentSettings.listItemSpacing;
      const customFilename = documentSettings.customFilename;
      const fileDate = documentSettings.fileDate;
      const highlightColor = documentSettings.highlightColor;
      const highlightColorRed = documentSettings.highlightColorRed;
      const logo = documentSettings.logo;
      const watermark = documentSettings.watermark;

      // Resolve logo to absolute path and encode as base64 data URI
      let resolvedLogoPath = null;
      let logoDataUri = null;
      if (logo && this.options.sandboxed && !this.isBundledLogoName(logo)) {
        console.log(chalk.yellow("⚠️  Logo must be a bundled file name, skipping:", logo));
      } else if (logo) {
        resolvedLogoPath = path.isAbsolute(logo)
          ? logo
          : path.join(this.scriptDir, 'public', 'assets', 'images', logo);
        try {
          const imageBuffer = await fs.readFile(resolvedLogoPath);
          const base64 = imageBuffer.toString('base64');
          const mimeType = resolvedLogoPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
          logoDataUri = `data:${mimeType};base64,${base64}`;
        } catch (e) {
          console.log(chalk.yellow('⚠️  Logo file not found, skipping:', resolvedLogoPath));
          resolvedLogoPath = null;
        }
      }

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
        bodySize,
        lineHeight,
        paragraphSpacing,
        headerSpacing,
        documentTitle,
        themeColorPrimary,
        themeColorSecondary,
        highlightColor,
        listItemSpacing,
        logoDataUri,
        watermark,
        highlightColorRed
      );

      // Save styled HTML to temp file
      const htmlPath = path.join(this.tempDir, "styled.html");
      await fs.writeFile(
        htmlPath,
        this.options.sandboxed ? this.applyContentSecurityPolicy(styledHtml) : styledHtml
      );

      if (this.options.debug) {
        console.log(chalk.gray("🔍 Debug: HTML file saved as"), htmlPath);
      }

      // Generate PDF
      console.log(chalk.blue("📄 Converting to PDF..."));
      // Generate output path with optional custom filename and version suffix
      let outputPath;
      if (this.options.outputPath) {
        // CLI option takes highest priority
        outputPath = this.options.outputPath;
      } else if (customFilename) {
        // Use custom filename from document settings
        // Ensure it has .pdf extension
        let customName = customFilename.endsWith(".pdf") ? customFilename : `${customFilename}.pdf`;
        if (this.options.sandboxed) {
          // An untrusted document may name its PDF but never choose where it is written.
          customName = this.safeOutputName(customName);
        }
        outputPath = path.join(path.dirname(inputPath), customName);
      } else {
        // Default: use input filename with optional version suffix
        const baseName = path.basename(inputFile, path.extname(inputFile));
        const versionSuffix = sequentialOutput ? `-v${versionNumber}` : "";
        outputPath = path.join(path.dirname(inputPath), baseName + versionSuffix + ".pdf");
      }

      // Apply file-date prefix/suffix (UTC) if requested
      if (fileDate === "before" || fileDate === "after") {
        const stamp = this.formatUtcStamp(new Date());
        const dir = path.dirname(outputPath);
        const ext = path.extname(outputPath);
        const base = path.basename(outputPath, ext);
        const newBase = fileDate === "before" ? `${stamp}-${base}` : `${base}-${stamp}`;
        outputPath = path.join(dir, newBase + ext);
      }

      await this.pdfGenerator.generatePdf(
        htmlPath,
        outputPath,
        this.options.singlePage,
        pageNumbers,
        documentTitle,
        disclosure,
        pageNumberFormat
      );

      // Report how full each page is, if asked
      const layout =
        this.options.layoutReport && !this.options.singlePage && !this.options.sandboxed
          ? this.printLayoutReport(outputPath, htmlContent, pageNumbers, watermark)
          : null;

      // Get file stats
      const stats = await fs.stat(outputPath);
      const fileSize = this.formatFileSize(stats.size);

      // Update version number if sequential output is enabled
      if (sequentialOutput) {
        const { major, minor } = this.parseVersion(versionNumber);
        const { major: newMajor, minor: newMinor } = this.incrementVersion(major, minor);
        const newVersion = this.formatVersion(newMajor, newMinor);
        await this.updateVersionInFile(inputPath, newVersion);
      }

      // Open PDF if requested (macOS only)
      let opened = false;
      if (this.options.openAfterGeneration && process.platform === "darwin") {
        try {
          // No shell: the output name can come from the document itself.
          execFileSync("open", [outputPath], { stdio: "ignore" });
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
        imageWarnings,
        layout,
      };
    } catch (error) {
      // Clean up temp directory on error
      if (this.tempDir && (await fs.pathExists(this.tempDir))) {
        await fs.remove(this.tempDir);
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Check every local SVG image and print a warning for each problem found.
  // A failure here never stops a conversion.
  warnAboutImages(htmlContent, inputDir) {
    try {
      const images = this.layoutChecker.checkImages(htmlContent, inputDir, { singlePage: this.options.singlePage });
      const warnings = [];

      for (const image of images) {
        for (const warning of image.warnings) {
          warnings.push({ file: image.file, warning });
          console.log(chalk.yellow(`⚠️ ${image.file}: ${warning}`));
        }
      }

      return warnings;
    } catch (error) {
      if (this.options.verbose) {
        console.log(chalk.yellow("⚠️ Could not check image sizes:"), error.message);
      }
      return [];
    }
  }

  // Print one line per page of the finished PDF: how full it is and what is
  // wrong with it. A failure here never stops a conversion.
  printLayoutReport(pdfPath, htmlContent, pageNumbers, watermark) {
    try {
      const pages = this.layoutChecker.report(pdfPath, htmlContent, {
        pageNumbers: !!pageNumbers,
        ignoreText: watermark || null,
      });

      if (pages === null) {
        console.log(chalk.yellow("⚠️ No layout report: pdftotext is not installed (brew install poppler)"));
        return null;
      }

      console.log(chalk.blue("📐 Layout report (fullness is measured from text, so an image at the foot of a page is not counted):"));
      for (const page of pages) {
        const percent = `${Math.round(page.fullness * 100)}%`.padStart(4);
        const start = page.firstLine.length > 60 ? `${page.firstLine.slice(0, 57)}...` : page.firstLine;
        const line = `   ${String(page.number).padStart(3)}  ${percent}  ${start}`;

        if (page.flags.length) {
          console.log(chalk.yellow(`${line}  ← ${page.flags.join(", ")}`));
        } else {
          console.log(chalk.gray(line));
        }
      }

      const flagged = pages.filter((page) => page.flags.length).length;
      console.log(
        flagged
          ? chalk.yellow(`📐 ${flagged} of ${pages.length} page(s) need a look`)
          : chalk.green(`📐 All ${pages.length} page(s) look fine`)
      );

      return pages;
    } catch (error) {
      console.log(chalk.yellow("⚠️ Could not build the layout report:"), error.message);
      return null;
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
