/**
 * Token Processor
 *
 * Handles token replacement in markdown and HTML files
 * Supports nested token replacement and automatic tokens
 */

const fs = require("fs-extra");
const chalk = require("chalk");

class TokenProcessor {
  constructor(configManager) {
    this.configManager = configManager;
  }

  async processTokens(inputPath, config) {
    console.log(chalk.blue("🏷️ Processing tokens in markdown file..."));

    // Read the input file
    let content = await fs.readFile(inputPath, "utf8");

    if (Object.keys(config).length === 0) {
      // No config file, return content as-is
      return content;
    }

    // Get automatic tokens
    const automaticTokens = this.configManager.getAutomaticTokens();

    // Combine config tokens with automatic tokens
    // Config tokens are processed first to allow them to contain automatic tokens
    const allTokens = { ...config, ...automaticTokens };

    // Process tokens with multiple passes to handle nested tokens
    const maxPasses = 3;
    let tokenCount = 0;

    for (let pass = 1; pass <= maxPasses; pass++) {
      let passReplacements = 0;
      console.log(chalk.gray(`   🔄 Token replacement pass ${pass}...`));

      // Process config tokens first (allows nesting with automatic tokens)
      for (const [key, value] of Object.entries(config)) {
        if (this.hasToken(content, key)) {
          content = this.replaceToken(content, key, value);
          if (pass === 1) {
            console.log(chalk.gray(`   🔄 Replaced {{${key}}} with: ${value}`));
          }
          passReplacements++;
          tokenCount++;
        }
      }

      // Process automatic tokens
      for (const [key, value] of Object.entries(automaticTokens)) {
        if (this.hasToken(content, key)) {
          content = this.replaceToken(content, key, value);
          passReplacements++;
          tokenCount++;
        }
      }

      // If no replacements were made in this pass, we're done
      if (passReplacements === 0) {
        break;
      }
    }

    console.log(chalk.green(`✅ Processed ${tokenCount} total token replacements`));

    // Check for any remaining unprocessed tokens and warn
    const remainingTokens = this.findRemainingTokens(content);
    if (remainingTokens.length > 0) {
      console.log(chalk.yellow("⚠️ Warning: Found unprocessed tokens:"));
      const uniqueTokens = [...new Set(remainingTokens)].sort();
      uniqueTokens.forEach((token) => {
        console.log(chalk.yellow(`   ${token}`));
      });
      console.log(chalk.gray("💡 Add these tokens to your 2pdf.config file if needed"));
    }

    return content;
  }

  hasToken(content, tokenName) {
    const tokenPattern = `{{${tokenName}}}`;
    return content.includes(tokenPattern) && this.hasTokenOutsideCode(content, tokenName);
  }

  replaceToken(content, tokenName, value) {
    // Only replace tokens that are outside of code blocks/inline code
    return this.replaceTokenOutsideCode(content, tokenName, value);
  }

  /**
   * Check if a token exists outside of code blocks and inline code
   */
  hasTokenOutsideCode(content, tokenName) {
    const tokenPattern = `{{${tokenName}}}`;
    const codeRanges = this.getCodeRanges(content);

    let index = content.indexOf(tokenPattern);
    while (index !== -1) {
      // Check if this token occurrence is outside all code ranges
      const isInCode = codeRanges.some((range) => index >= range.start && index < range.end);
      if (!isInCode) {
        return true; // Found at least one token outside code
      }
      index = content.indexOf(tokenPattern, index + 1);
    }

    return false; // All tokens are inside code blocks
  }

  /**
   * Replace tokens only when they're outside of code blocks and inline code
   */
  replaceTokenOutsideCode(content, tokenName, value) {
    const tokenPattern = `{{${tokenName}}}`;
    const codeRanges = this.getCodeRanges(content);

    let result = "";
    let lastIndex = 0;
    let index = content.indexOf(tokenPattern);

    while (index !== -1) {
      // Add content up to this token
      result += content.substring(lastIndex, index);

      // Check if this token is inside a code block
      const isInCode = codeRanges.some((range) => index >= range.start && index < range.end);

      if (isInCode) {
        // Keep the token as-is if it's in code
        result += tokenPattern;
      } else {
        // Replace the token if it's outside code
        result += value;
      }

      lastIndex = index + tokenPattern.length;
      index = content.indexOf(tokenPattern, lastIndex);
    }

    // Add remaining content
    result += content.substring(lastIndex);
    return result;
  }

  /**
   * Get ranges of all code blocks (triple backticks) and inline code (single backticks)
   */
  getCodeRanges(content) {
    const ranges = [];

    // Find code blocks (triple backticks)
    const codeBlockRegex = /```[\s\S]*?```/g;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "block",
      });
    }

    // Find inline code (single backticks) - but not inside code blocks
    const inlineCodeRegex = /`[^`\n]+`/g;
    while ((match = inlineCodeRegex.exec(content)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;

      // Check if this inline code is inside a code block
      const isInsideBlock = ranges.some((range) => range.type === "block" && start >= range.start && end <= range.end);

      if (!isInsideBlock) {
        ranges.push({
          start: start,
          end: end,
          type: "inline",
        });
      }
    }

    return ranges.sort((a, b) => a.start - b.start);
  }

  findRemainingTokens(content) {
    const tokenRegex = /\{\{([^}]+)\}\}/g;
    const tokens = [];
    let match;

    while ((match = tokenRegex.exec(content)) !== null) {
      tokens.push(match[0]); // Include the full {{TOKEN}} format
    }

    return tokens;
  }

  async processTokensInContent(content, config) {
    console.log(chalk.blue("🏷️ Processing tokens in content..."));

    if (Object.keys(config).length === 0) {
      // No config file, return content as-is
      return content;
    }

    // Get automatic tokens
    const automaticTokens = this.configManager.getAutomaticTokens();

    // Process tokens with multiple passes to handle nested replacements
    const maxPasses = 5;
    let tokenCount = 0;

    for (let pass = 1; pass <= maxPasses; pass++) {
      let passReplacements = 0;
      console.log(chalk.gray(`   🔄 Token replacement pass ${pass}...`));

      // Process config tokens first (allows nesting with automatic tokens)
      for (const [key, value] of Object.entries(config)) {
        if (this.hasToken(content, key)) {
          content = this.replaceToken(content, key, value);
          if (pass === 1) {
            console.log(chalk.gray(`   🔄 Replaced {{${key}}} with: ${value}`));
          }
          passReplacements++;
          tokenCount++;
        }
      }

      // Process automatic tokens
      for (const [key, value] of Object.entries(automaticTokens)) {
        if (this.hasToken(content, key)) {
          content = this.replaceToken(content, key, value);
          passReplacements++;
          tokenCount++;
        }
      }

      // If no replacements were made in this pass, we're done
      if (passReplacements === 0) {
        break;
      }
    }

    console.log(chalk.green(`✅ Processed ${tokenCount} total token replacements`));

    // Check for any remaining unprocessed tokens and warn
    const remainingTokens = this.findRemainingTokens(content);
    if (remainingTokens.length > 0) {
      console.log(chalk.yellow("⚠️ Warning: Found unprocessed tokens:"));
      const uniqueTokens = [...new Set(remainingTokens)].sort();
      uniqueTokens.forEach((token) => {
        console.log(chalk.yellow(`   ${token}`));
      });
      console.log(chalk.gray("💡 Add these tokens to your 2pdf.config file if needed"));
    }

    return content;
  }
}

module.exports = TokenProcessor;
