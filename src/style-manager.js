/**
 * Style Manager
 *
 * Handles CSS loading and HTML styling
 * Manages font loading and CSS compilation
 */

const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");

class StyleManager {
  constructor(scriptDir) {
    this.scriptDir = scriptDir;
    this.stylesDir = path.join(scriptDir, "assets", "styles");
    this.fontsDir = path.join(scriptDir, "assets", "fonts");
  }

  async applyStyles(
    htmlContent,
    customStylePath = null,
    isHtmlFile = false,
    themeColor = null,
    config = {},
    singlePage = false,
    baseFontSize = null,
    bodyColor = null,
    linkColor = null,
    linkUnderline = null,
    headerSize = null,
    bodySize = null,
    lineHeight = null
  ) {
    let cssContent = "";

    if (isHtmlFile && !customStylePath) {
      // For HTML files, check if they already have CSS
      const hasExistingCss = this.hasExistingCss(htmlContent);

      if (hasExistingCss) {
        console.log(chalk.blue("🎨 Using existing CSS from HTML file..."));
        // Apply theme color override (use default #808 if not specified)
        const effectiveThemeColor = themeColor || "808";
        return this.applyThemeColorToHtml(htmlContent, effectiveThemeColor, config);
      } else {
        console.log(chalk.blue("🎨 No CSS found in HTML file, applying default styles..."));
        // Fall through to apply our default CSS
      }
    }

    if (customStylePath) {
      // Use custom CSS file
      const customCssPath = path.resolve(customStylePath);
      if (await fs.pathExists(customCssPath)) {
        console.log(chalk.blue("🎨 Using custom CSS:"), customCssPath);
        cssContent = await fs.readFile(customCssPath, "utf8");
      } else {
        throw new Error(`Custom CSS file not found: ${customCssPath}`);
      }
    } else {
      // Use default CSS
      const defaultCssPath = path.join(this.stylesDir, "pdf.min.css");

      if (await fs.pathExists(defaultCssPath)) {
        console.log(chalk.blue("🎨 Using minimized CSS from compilation..."));
        console.log(chalk.gray("🔍 CSS file path:"), defaultCssPath);
        cssContent = await fs.readFile(defaultCssPath, "utf8");
      } else {
        // Fallback to regular CSS
        const fallbackCssPath = path.join(this.stylesDir, "pdf.css");
        if (await fs.pathExists(fallbackCssPath)) {
          console.log(chalk.blue("🎨 Using regular CSS file..."));
          cssContent = await fs.readFile(fallbackCssPath, "utf8");
        } else {
          throw new Error("No CSS file found. Expected pdf.min.css or pdf.css in assets/styles/");
        }
      }
    }

    // Handle font paths - convert relative paths to absolute file:// URLs for Chrome
    cssContent = await this.processFontPaths(cssContent);

    // Apply theme color (use default #808 if not specified)
    const effectiveThemeColor = themeColor || "808";
    cssContent = this.applyThemeColor(cssContent, effectiveThemeColor, config);

    // Apply base font size if specified
    if (baseFontSize) {
      cssContent = this.applyBaseFontSize(cssContent, baseFontSize);
    }

    // Apply body color if specified
    if (bodyColor) {
      cssContent = this.applyBodyColor(cssContent, bodyColor);
    }

    // Apply link color if specified
    if (linkColor) {
      cssContent = this.applyLinkColor(cssContent, linkColor);
    }

    // Apply link underline setting if specified
    if (linkUnderline !== null) {
      cssContent = this.applyLinkUnderline(cssContent, linkUnderline);
    }

    // Apply header size if specified
    if (headerSize) {
      cssContent = this.applyHeaderSize(cssContent, headerSize);
    }

    // Apply body size if specified
    if (bodySize) {
      cssContent = this.applyBodySize(cssContent, bodySize);
    }

    // Apply line height if specified
    if (lineHeight) {
      cssContent = this.applyLineHeight(cssContent, lineHeight);
    }

    // Apply single-page modifications if requested
    if (singlePage) {
      cssContent = this.applySinglePageMode(cssContent);
    }

    // Create complete HTML document with embedded CSS
    const styledHtml = this.createStyledHtml(htmlContent, cssContent);

    return styledHtml;
  }

  async processFontPaths(cssContent) {
    // Check if fonts directory exists
    if (await fs.pathExists(this.fontsDir)) {
      console.log(chalk.gray("🔍 Processing font paths..."));

      // Replace relative font paths with absolute file:// URLs for Chrome
      const absoluteFontsPath = this.fontsDir;
      cssContent = cssContent.replace(/url\(["']?\.\.\/fonts\//g, `url("file://${absoluteFontsPath}/`);

      // Debug: Show font paths being used
      const fontPaths = cssContent.match(/file:\/\/[^)]*\.(woff2|woff|ttf)/g);
      if (fontPaths) {
        console.log(chalk.gray("🔍 Font paths in CSS:"));
        fontPaths.slice(0, 5).forEach((fontPath) => {
          console.log(chalk.gray(`   ${fontPath}`));
        });
      }
    } else {
      console.log(chalk.yellow("⚠️ Fonts directory not found, using web fonts"));
    }

    return cssContent;
  }

  createStyledHtml(htmlContent, cssContent) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown to PDF</title>
    <style>
${cssContent}
    </style>
</head>
<body>
${htmlContent}

<script>
// Force font loading and apply additional processing
(function() {
    // Force Lato/Inter font loading
    function forceFonts() {
        const elements = document.querySelectorAll('*');
        elements.forEach(el => {
            const computedStyle = window.getComputedStyle(el);
            if (computedStyle.fontFamily.includes('Inter') || computedStyle.fontFamily.includes('Lato')) {
                el.style.fontFamily = '"Inter", sans-serif';
            }
        });
    }
    
    // Process icon placeholders
    const iconDivs = document.querySelectorAll('div[style*="background-color"]');
    iconDivs.forEach(iconDiv => {
        const parentDiv = iconDiv.parentElement;
        if (parentDiv && parentDiv.tagName === 'DIV') {
            const style = iconDiv.getAttribute('style') || '';
            let iconClass = '';
            
            if (style.includes('#27aae1') || iconDiv.getAttribute('style').includes('#27aae1')) {
                iconClass = 'icon-sonic';
            } else if (style.includes('#006400')) {
                iconClass = 'icon-5g';
            } else if (style.includes('#ff8c00')) {
                iconClass = 'icon-1gig';
            } else if (style.includes('#cc4400')) {
                iconClass = 'icon-10gig';
            }
            
            if (iconClass) {
                const placeholder = document.createElement('div');
                placeholder.className = 'icon-placeholder ' + iconClass;
                parentDiv.parentNode.replaceChild(placeholder, parentDiv);
            }
        }
    });
    
    // Force font application after processing
    setTimeout(forceFonts, 1000);
})();
</script>
</body>
</html>`;
  }

  hasExistingCss(htmlContent) {
    // Check for internal CSS (style tags)
    const hasStyleTags = /<style[^>]*>[\s\S]*?<\/style>/i.test(htmlContent);

    // Check for external CSS (link tags with rel="stylesheet")
    const hasExternalCss = /<link[^>]*rel=["']stylesheet["'][^>]*>/i.test(htmlContent);

    // Check for inline styles (style attributes with meaningful content)
    const hasInlineStyles =
      /style=["'][^"']*(?:color|background|font|margin|padding|border|width|height)[^"']*["']/i.test(htmlContent);

    return hasStyleTags || hasExternalCss || hasInlineStyles;
  }

  resolveThemeColor(themeColor, config) {
    if (!themeColor) return null;

    // If it's a predefined color name, look it up in config
    const colorKey = `COLOR_${themeColor.toUpperCase()}`;
    if (config[colorKey]) {
      console.log(chalk.blue(`🎨 Using predefined color '${themeColor}':`, config[colorKey]));
      return config[colorKey];
    }

    // If it looks like a hex color, use it directly (support both 3 and 6 character hex)
    const hexColor = themeColor.startsWith("#") ? themeColor : `#${themeColor}`;
    if (/^#[0-9A-Fa-f]{3}$/.test(hexColor) || /^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
      console.log(chalk.blue(`🎨 Using custom hex color:`, hexColor));
      return hexColor;
    }

    // Invalid color format
    console.log(chalk.yellow(`⚠️ Invalid color format '${themeColor}', using default`));
    return null;
  }

  applyThemeColor(cssContent, themeColor, config) {
    const resolvedColor = this.resolveThemeColor(themeColor, config);
    if (!resolvedColor) return cssContent;

    // Replace existing :root rule with the new theme color
    // Look for the existing :root rule and replace the --theme-color value
    // This regex handles various whitespace and formatting variations
    const rootRuleRegex = /(:root\s*\{[^}]*--theme-color:\s*)[^;}]+([^}]*\})/;

    let updatedCss = cssContent;

    if (rootRuleRegex.test(updatedCss)) {
      // Replace the existing --theme-color value in the :root rule
      updatedCss = updatedCss.replace(rootRuleRegex, `$1${resolvedColor}$2`);
    } else {
      // Fallback: inject CSS custom property at the beginning if no :root rule found
      const themeColorRule = `:root { --theme-color: ${resolvedColor}; }\n`;
      updatedCss = themeColorRule + updatedCss;
    }

    // Replace CSS custom properties with actual color values for better print compatibility
    // CSS custom properties can sometimes fail in print contexts, so we use direct color values

    // Generate 10% opacity version of the theme color for backgrounds
    const themeColor10 = this.hexToRgba(resolvedColor, 0.1);

    updatedCss = updatedCss.replace(/var\(--theme-color-10\)/g, themeColor10);
    updatedCss = updatedCss.replace(/var\(--theme-color\)/g, resolvedColor);

    // Also replace any remaining hardcoded Feral magenta colors
    updatedCss = updatedCss.replace(/color:#808/g, `color:${resolvedColor}`);
    updatedCss = updatedCss.replace(/color:#880088/g, `color:${resolvedColor}`);
    updatedCss = updatedCss.replace(/solid #808/g, `solid ${resolvedColor}`);
    updatedCss = updatedCss.replace(/solid #880088/g, `solid ${resolvedColor}`);

    return updatedCss;
  }

  applyBaseFontSize(cssContent, baseFontSize) {
    console.log(chalk.blue(`📏 Applying base font size:`, baseFontSize));

    // Add CSS custom property for base font size and apply it to body
    const fontSizeRule = `
/* Base font size override from document settings */
:root { --base-font-size: ${baseFontSize}; }
body { font-size: var(--base-font-size) !important; }
`;

    return fontSizeRule + cssContent;
  }

  applyBodyColor(cssContent, bodyColor) {
    console.log(chalk.blue(`📝 Applying body color:`, bodyColor));

    // Add CSS rule for body text color
    const bodyColorRule = `
/* Body text color override from document settings */
body, p, li, td, th, div, span {
  color: ${bodyColor} !important;
}
`;

    return bodyColorRule + cssContent;
  }

  applyLinkColor(cssContent, linkColor) {
    console.log(chalk.blue(`🔗 Applying link color:`, linkColor));

    // Add CSS rule for link colors
    const linkColorRule = `
/* Link color override from document settings */
a, a:link, a:visited {
  color: ${linkColor} !important;
}
a:hover, a:active {
  color: ${linkColor} !important;
  opacity: 0.8;
}
`;

    return linkColorRule + cssContent;
  }

  applyLinkUnderline(cssContent, linkUnderline) {
    const underlineText = linkUnderline ? "on" : "off";
    console.log(chalk.blue(`🔗 Applying link underline:`, underlineText));

    // Add CSS rule for link text decoration
    const textDecoration = linkUnderline ? "underline" : "none";
    const linkUnderlineRule = `
/* Link underline override from document settings */
a, a:link, a:visited {
  text-decoration: ${textDecoration} !important;
}
a:hover, a:active {
  text-decoration: ${textDecoration} !important;
}
`;

    return linkUnderlineRule + cssContent;
  }

  applyHeaderSize(cssContent, headerSize) {
    console.log(chalk.blue(`📏 Applying header size:`, headerSize));

    // Add CSS rule for header sizes - scale all headers proportionally
    const headerSizeRule = `
/* Header size override from document settings */
h1 { font-size: calc(${headerSize} * 2.5) !important; }
h2 { font-size: calc(${headerSize} * 2.0) !important; }
h3 { font-size: calc(${headerSize} * 1.75) !important; }
h4 { font-size: calc(${headerSize} * 1.5) !important; }
h5 { font-size: calc(${headerSize} * 1.25) !important; }
h6 { font-size: calc(${headerSize} * 1.1) !important; }
`;

    return headerSizeRule + cssContent;
  }

  applyBodySize(cssContent, bodySize) {
    console.log(chalk.blue(`📏 Applying body size:`, bodySize));

    // Add CSS rule for body text sizes
    const bodySizeRule = `
/* Body text size override from document settings */
p, li, td, th, div, span, blockquote {
  font-size: ${bodySize} !important;
}
`;

    return bodySizeRule + cssContent;
  }

  applyLineHeight(cssContent, lineHeight) {
    console.log(chalk.blue(`📏 Applying line height:`, lineHeight));

    // Add CSS rule for line height on all text elements
    const lineHeightRule = `
/* Line height override from document settings */
body, p, li, td, th, div, span, blockquote, h1, h2, h3, h4, h5, h6, pre, code {
  line-height: ${lineHeight} !important;
}
`;

    return lineHeightRule + cssContent;
  }

  hexToRgba(hex, alpha) {
    // Remove # if present
    hex = hex.replace("#", "");

    // Handle 3-character hex codes
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }

    // Parse RGB values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  applySinglePageMode(cssContent) {
    // Remove existing @page rules completely - we'll let Puppeteer handle page size
    cssContent = cssContent.replace(/@page\s*\{[^}]*\}/g, "");

    // Add CSS that works with custom page dimensions
    const singlePageCSS = `
/* Single-page mode: let Puppeteer control page size, prevent breaks */
html, body {
  height: auto !important;
  overflow: visible !important;
}

/* Prevent all page breaks */
* {
  page-break-before: avoid !important;
  page-break-after: avoid !important;
  page-break-inside: avoid !important;
  break-before: avoid !important;
  break-after: avoid !important;
  break-inside: avoid !important;
}

/* Completely hide page break elements */
.page-break {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
`;

    cssContent = singlePageCSS + cssContent;

    // Remove any remaining page break CSS rules from the original CSS
    cssContent = cssContent.replace(/page-break-[^:]*:[^;]*;/g, "");
    cssContent = cssContent.replace(/break-[^:]*:[^;]*;/g, "");

    return cssContent;
  }

  applyThemeColorToHtml(htmlContent, themeColor, config) {
    const resolvedColor = this.resolveThemeColor(themeColor, config);
    if (!resolvedColor) return htmlContent;

    // Inject CSS custom property into existing HTML
    const themeColorStyle = `<style>:root { --theme-color: ${resolvedColor}; }</style>`;

    // Try to inject after existing <style> tags, or before </head>
    if (htmlContent.includes("</style>")) {
      return htmlContent.replace(/(<\/style>)/, `$1\n${themeColorStyle}`);
    } else if (htmlContent.includes("</head>")) {
      return htmlContent.replace(/(<\/head>)/, `${themeColorStyle}\n$1`);
    } else {
      // Fallback: add at the beginning of body
      return htmlContent.replace(/(<body[^>]*>)/, `$1\n${themeColorStyle}`);
    }
  }
}

module.exports = StyleManager;
