/**
 * Content Processor
 *
 * Handles markdown and HTML processing and special content tags
 * Processes PDF-only content, page breaks, and other special features
 */

const { marked } = require("marked");
const markedFootnote = require("marked-footnote");
const chalk = require("chalk");

class ContentProcessor {
  constructor(inputDir = null) {
    this.inputDir = inputDir;
    this.documentSettings = {}; // Store extracted document settings

    // Configure marked options
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false,
    });

    // Add footnote extension
    marked.use(markedFootnote());
  }

  async processContent(markdownContent) {
    console.log(chalk.blue("🏷️ Processing special content tags..."));

    let processedContent = markdownContent;

    // Extract document settings (theme color, font size) from comments
    const documentSettings = this.extractDocumentSettings(processedContent);

    // Process PDF-only content tags
    processedContent = this.processPdfOnlyContent(processedContent);

    // Process page break comments
    processedContent = this.processPageBreaks(processedContent);

    // Process live-site-shield comments
    processedContent = this.processLiveSiteShield(processedContent);

    // Store document settings for later use
    this.documentSettings = documentSettings;

    return processedContent;
  }

  extractDocumentSettings(content) {
    const settings = {};

    // Extract theme color from comments like <!-- theme-color: #ff6b35 -->
    const themeColorRegex = /<!--\s*theme-color:\s*([^-]+?)\s*-->/i;
    const themeColorMatch = content.match(themeColorRegex);
    if (themeColorMatch) {
      const color = themeColorMatch[1].trim();
      settings.themeColor = color;
      console.log(chalk.blue(`🎨 Found theme color in document:`, color));
    }

    // Extract body text color from comments like <!-- body-color: #333333 -->
    const bodyColorRegex = /<!--\s*body-color:\s*([^-]+?)\s*-->/i;
    const bodyColorMatch = content.match(bodyColorRegex);
    if (bodyColorMatch) {
      const color = bodyColorMatch[1].trim();
      settings.bodyColor = color;
      console.log(chalk.blue(`📝 Found body color in document:`, color));
    }

    // Extract link color from comments like <!-- link-color: #0066cc -->
    const linkColorRegex = /<!--\s*link-color:\s*([^-]+?)\s*-->/i;
    const linkColorMatch = content.match(linkColorRegex);
    if (linkColorMatch) {
      const color = linkColorMatch[1].trim();
      settings.linkColor = color;
      console.log(chalk.blue(`🔗 Found link color in document:`, color));
    }

    // Extract base font size from comments like <!-- font-size: 1.2em -->
    const fontSizeRegex = /<!--\s*font-size:\s*([^-]+?)\s*-->/i;
    const fontSizeMatch = content.match(fontSizeRegex);
    if (fontSizeMatch) {
      const fontSize = fontSizeMatch[1].trim();
      settings.baseFontSize = fontSize;
      console.log(chalk.blue(`📏 Found base font size in document:`, fontSize));
    }

    // Extract link underline setting from comments like <!-- link-underline: on --> or <!-- link-underline: off -->
    const linkUnderlineRegex = /<!--\s*link-underline:\s*([^-]+?)\s*-->/i;
    const linkUnderlineMatch = content.match(linkUnderlineRegex);
    if (linkUnderlineMatch) {
      const underlineSetting = linkUnderlineMatch[1].trim().toLowerCase();
      settings.linkUnderline = underlineSetting === "on" || underlineSetting === "true" || underlineSetting === "yes";
      console.log(chalk.blue(`🔗 Found link underline setting in document:`, underlineSetting));
    }

    // Extract header size from comments like <!-- header-size: 1.5em -->
    const headerSizeRegex = /<!--\s*header-size:\s*([^-]+?)\s*-->/i;
    const headerSizeMatch = content.match(headerSizeRegex);
    if (headerSizeMatch) {
      const headerSize = headerSizeMatch[1].trim();
      settings.headerSize = headerSize;
      console.log(chalk.blue(`📏 Found header size in document:`, headerSize));
    }

    // Extract body size from comments like <!-- body-size: 0.9em -->
    const bodySizeRegex = /<!--\s*body-size:\s*([^-]+?)\s*-->/i;
    const bodySizeMatch = content.match(bodySizeRegex);
    if (bodySizeMatch) {
      const bodySize = bodySizeMatch[1].trim();
      settings.bodySize = bodySize;
      console.log(chalk.blue(`📏 Found body size in document:`, bodySize));
    }

    // Extract page numbers setting from comments like <!-- page-numbers: on --> or <!-- page-numbers: X --> or <!-- page-numbers: X of Y -->
    const pageNumbersRegex = /<!--\s*page-numbers:\s*([^-]+?)\s*-->/i;
    const pageNumbersMatch = content.match(pageNumbersRegex);
    if (pageNumbersMatch) {
      const pageNumbersSetting = pageNumbersMatch[1].trim().toLowerCase();
      if (
        pageNumbersSetting === "on" ||
        pageNumbersSetting === "true" ||
        pageNumbersSetting === "yes" ||
        pageNumbersSetting === "x of y"
      ) {
        settings.pageNumbers = true;
        settings.pageNumberFormat = pageNumbersSetting === "x" ? "X" : "X of Y";
      } else if (pageNumbersSetting === "x") {
        settings.pageNumbers = true;
        settings.pageNumberFormat = "X";
      } else {
        settings.pageNumbers = false;
        settings.pageNumberFormat = "X of Y";
      }
      console.log(chalk.blue(`📄 Found page numbers setting in document:`, pageNumbersSetting));
    }

    // Extract disclosure from comments like <!-- disclosure: Internal Use Only / CONFIDENTIAL -->
    const disclosureRegex = /<!--\s*disclosure:\s*([^-]+?)\s*-->/i;
    const disclosureMatch = content.match(disclosureRegex);
    if (disclosureMatch) {
      const disclosure = disclosureMatch[1].trim();
      settings.disclosure = disclosure;
      console.log(chalk.blue(`📄 Found disclosure in document:`, disclosure));
    }

    return settings;
  }

  getDocumentSettings() {
    return this.documentSettings || {};
  }

  processPdfOnlyContent(content) {
    // Extract PDF-ONLY content and process it as Markdown
    // Supports both "PDF ONLY" and "PDF-ONLY" formats
    const pdfOnlyRegex = /<!--\s*PDF[-\s]+ONLY\s*\n([\s\S]*?)\n-->/g;

    let processedContent = content.replace(pdfOnlyRegex, (match, pdfContent) => {
      // Store the PDF-only content with special markers for later processing
      return `PDFONLY_PLACEHOLDER_START${pdfContent}PDFONLY_PLACEHOLDER_END`;
    });

    return processedContent;
  }

  processPageBreaks(content) {
    // Convert manual page break comments to markdown that will become HTML page breaks
    // Supports Better Comments plugin tags and various formats
    // Skip content inside code blocks (``` or ` delimited)

    const pageBreakRegex = /<!--[!?~\/\\*|—\^\^@#\[\s]*PAGE-?BREAK\s*-->/gi;

    // Split content by code blocks to avoid processing inside them
    const parts = this.splitByCodeBlocks(content);

    return parts
      .map((part, index) => {
        // Only process parts that are NOT code blocks (even indices)
        if (index % 2 === 0) {
          return part.replace(pageBreakRegex, '\n\n<div class="page-break"></div>\n\n');
        }
        return part; // Return code blocks unchanged
      })
      .join("");
  }

  processLiveSiteShield(content) {
    // Process live-site-shield comments
    // Look for <!-- live-site-shield --> comments and mark the next paragraph
    // Skip content inside code blocks
    const liveShieldRegex = /<!--\s*live-site-shield\s*-->\s*\n/gi;

    // Split content by code blocks to avoid processing inside them
    const parts = this.splitByCodeBlocks(content);

    return parts
      .map((part, index) => {
        // Only process parts that are NOT code blocks (even indices)
        if (index % 2 === 0) {
          return part.replace(liveShieldRegex, '\n\n<div class="live-site-shield-marker"></div>\n\n');
        }
        return part; // Return code blocks unchanged
      })
      .join("");
  }

  async markdownToHtml(markdownContent) {
    console.log(chalk.blue("📝 Converting markdown to HTML..."));

    try {
      // Extract document title from first H1 before converting to HTML
      const h1Match = markdownContent.match(/^#\s+(.+)$/m);
      if (h1Match) {
        this.documentSettings.documentTitle = h1Match[1].trim();
        console.log(chalk.blue(`📄 Found document title:`, this.documentSettings.documentTitle));
      }

      // Convert markdown to HTML
      let htmlContent = marked(markdownContent);

      // Post-process the HTML
      htmlContent = this.postProcessHtml(htmlContent);

      return htmlContent;
    } catch (error) {
      throw new Error(`Failed to convert markdown to HTML: ${error.message}`);
    }
  }

  postProcessHtml(htmlContent) {
    // Process PDF-only content - convert markdown inside placeholders to HTML
    htmlContent = htmlContent.replace(
      /PDFONLY_PLACEHOLDER_START([\s\S]*?)PDFONLY_PLACEHOLDER_END/g,
      (match, pdfContent) => {
        // Convert the PDF-only markdown content to HTML
        return marked(pdfContent.trim());
      }
    );

    // Process live-site-shield markers
    // Find the marker and apply the class to the next paragraph, then structure the content
    htmlContent = htmlContent.replace(
      /<div class="live-site-shield-marker"><\/div>\s*<p>(.*?)<\/p>/gi,
      (match, content) => {
        // Parse "Live Site: https://example.com" format
        const colonMatch = content.match(/^(.*?):\s*(.+)$/);
        if (colonMatch) {
          const [, label, url] = colonMatch;
          return `<p class="live-site-shield"><span class="label">${label}</span><span class="url">${url}</span></p>`;
        }
        return `<p class="live-site-shield">${content}</p>`;
      }
    );

    // Remove any remaining markers
    htmlContent = htmlContent.replace(/<div class="live-site-shield-marker"><\/div>/gi, "");

    // Process table column widths if present
    htmlContent = this.processTableColumnWidths(htmlContent);

    // Process image paths to make them absolute
    if (this.inputDir) {
      htmlContent = this.processImagePaths(htmlContent);
    }

    return htmlContent;
  }

  processTableColumnWidths(htmlContent) {
    // Process table column width specifications
    // Look for comments like <!-- col-widths: 30% 70% -->
    const colWidthRegex = /<!--\s*col-widths:\s*([^-]+)\s*-->/gi;

    return htmlContent.replace(colWidthRegex, (match, widths) => {
      const widthArray = widths.trim().split(/\s+/);
      let styleTag = "<style>\n";

      widthArray.forEach((width, index) => {
        styleTag += `table tr td:nth-child(${index + 1}) { width: ${width}; }\n`;
      });

      styleTag += "</style>\n";
      return styleTag;
    });
  }

  splitByCodeBlocks(content) {
    // Split content by code blocks to avoid processing inside them
    // Handles both ``` fenced blocks and ` inline code
    const parts = [];
    let currentPos = 0;

    // Find all code blocks (both ``` and ` delimited)
    const codeBlockRegex = /(```[\s\S]*?```|`[^`\n]*?`)/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add content before the code block
      if (match.index > currentPos) {
        parts.push(content.slice(currentPos, match.index));
      }

      // Add the code block itself
      parts.push(match[0]);

      currentPos = match.index + match[0].length;
    }

    // Add remaining content after the last code block
    if (currentPos < content.length) {
      parts.push(content.slice(currentPos));
    }

    return parts;
  }

  processImagePaths(htmlContent) {
    const path = require("path");

    // Convert relative image paths to absolute file:// URLs
    return htmlContent.replace(/<img([^>]*)\ssrc=["']([^"']+)["']/gi, (match, attributes, src) => {
      // Skip if already absolute (http://, https://, file://, or data:)
      if (src.match(/^(https?:|file:|data:)/i)) {
        return match;
      }

      // Convert relative path to absolute file:// URL
      const absolutePath = path.resolve(this.inputDir, src);
      return `<img${attributes} src="file://${absolutePath}"`;
    });
  }

  async processHtmlContent(htmlContent) {
    console.log(chalk.blue("🏷️ Processing special content tags in HTML..."));

    let processedContent = htmlContent;

    // Process PDF-only content tags (same as markdown)
    processedContent = this.processPdfOnlyContentInHtml(processedContent);

    // Process page break comments
    processedContent = this.processPageBreaksInHtml(processedContent);

    // Process live-site-shield comments
    processedContent = this.processLiveSiteShieldInHtml(processedContent);

    // Fix relative image paths
    if (this.inputDir) {
      processedContent = this.processImagePaths(processedContent);
    }

    return processedContent;
  }

  processPdfOnlyContentInHtml(content) {
    // Extract PDF-ONLY content in HTML comments
    const pdfOnlyRegex = /<!--\s*PDF[-\s]+ONLY\s*\n([\s\S]*?)\n-->/g;

    return content.replace(pdfOnlyRegex, (match, pdfContent) => {
      // Return the content directly since it's already HTML
      return pdfContent.trim();
    });
  }

  processPageBreaksInHtml(content) {
    // Convert page break comments to div elements
    const pageBreakRegex = /<!--\|\s*PAGE-BREAK\s*-->/g;
    return content.replace(pageBreakRegex, '<div class="page-break"></div>');
  }

  processLiveSiteShieldInHtml(content) {
    // Convert live site shield comments to div elements
    const liveSiteShieldRegex = /<!--\|\s*LIVE-SITE-SHIELD\s*-->/g;
    return content.replace(liveSiteShieldRegex, '<div class="live-site-shield"></div>');
  }
}

module.exports = ContentProcessor;
