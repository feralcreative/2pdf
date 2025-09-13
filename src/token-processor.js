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
    return content.includes(`{{${tokenName}}}`);
  }

  replaceToken(content, tokenName, value) {
    // Escape special regex characters in the value
    const escapedValue = value.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokenRegex = new RegExp(`\\{\\{${tokenName}\\}\\}`, "g");
    return content.replace(tokenRegex, value);
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
