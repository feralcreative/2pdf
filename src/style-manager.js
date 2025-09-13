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

  async applyStyles(htmlContent, customStylePath = null, isHtmlFile = false, themeColor = null, config = {}) {
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

    // Inject CSS custom property at the beginning of the CSS
    const themeColorRule = `:root { --theme-color: ${resolvedColor}; }\n`;
    return themeColorRule + cssContent;
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
