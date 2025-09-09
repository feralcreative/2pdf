#!/usr/bin/env node

/**
 * md2pdf CLI Entry Point
 *
 * Command-line interface for the md2pdf converter
 * Maintains compatibility with the original shell script usage
 */

const { program } = require("commander");
const chalk = require("chalk");
const path = require("path");
const { Md2Pdf } = require("../src/index.js");

// Package info
const packageJson = require("../package.json");

program
  .name("md2pdf")
  .description("Convert Markdown files to styled PDFs")
  .version(packageJson.version)
  .argument("[file]", "Markdown file to convert (defaults to README.md)", "README.md")
  .option("-c, --config <path>", "Path to configuration file")
  .option("-o, --output <path>", "Output PDF file path")
  .option("-s, --style <path>", "Path to custom CSS file")
  .option("--no-open", "Don't open the PDF after generation (macOS only)")
  .option("--debug", "Enable debug mode (keeps temporary files)")
  .option("--verbose", "Enable verbose logging")
  .action(async (file, options) => {
    try {
      console.log(chalk.blue("🔄 md2pdf v" + packageJson.version));
      console.log(chalk.blue("🔄 Converting"), chalk.cyan(file), chalk.blue("to PDF..."));

      const converter = new Md2Pdf({
        configPath: options.config,
        outputPath: options.output,
        stylePath: options.style,
        openAfterGeneration: options.open !== false,
        debug: options.debug || false,
        verbose: options.verbose || false,
      });

      const result = await converter.convert(file);

      if (result.success) {
        console.log(chalk.green("✅ Successfully created"), chalk.cyan(result.outputPath));
        console.log(chalk.blue("📊 File size:"), result.fileSize);
        console.log(chalk.blue("📁 Location:"), result.fullPath);

        if (result.opened) {
          console.log(chalk.blue("🔍 Opening PDF..."));
        }
      } else {
        console.error(chalk.red("❌ PDF generation failed:"), result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("❌ Error:"), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Handle uncaught errors gracefully
process.on("uncaughtException", (error) => {
  console.error(chalk.red("❌ Uncaught Exception:"), error.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(chalk.red("❌ Unhandled Rejection at:"), promise, chalk.red("reason:"), reason);
  process.exit(1);
});

program.parse();
