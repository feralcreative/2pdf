#!/usr/bin/env node

/**
 * 2PDF CLI Entry Point
 *
 * Command-line interface for converting Markdown and HTML files to PDF
 * Supports both markdown processing and direct HTML conversion
 */

const fs = require("fs");
const path = require("path");
const { program } = require("commander");
const chalk = require("chalk");
const { ToPdf } = require("../src/index.js");

// Package info
const packageJson = require("../package.json");

/**
 * Collect all convertible files in a directory.
 * @param {string} dir - Directory to scan
 * @param {boolean} recursive - Whether to descend into subdirectories
 * @returns {string[]} Absolute file paths
 */
function collectFiles(dir, recursive) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Cannot read directory: ${dir} — ${err.message}`);
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        results.push(...collectFiles(fullPath, true));
      }
    } else if (/\.(md|html?)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

program
  .name("2pdf")
  .description("Convert Markdown and HTML files to styled PDFs")
  .version(packageJson.version)
  .argument("[input]", "Markdown/HTML file or directory to convert (defaults to README.md)", "README.md")
  .option("-c, --config <path>", "Path to configuration file")
  .option("-o, --output <path>", "Output PDF file path (single-file mode only)")
  .option("-s, --style <path>", "Path to custom CSS file")
  .option("-r, --recursive", "Convert all .md/.html files in directory recursively")
  .option("--color <color>", "Theme color (predefined name or hex code) - overridden by document settings")
  .option("--single-page", "Generate single continuous page instead of multiple pages")
  .option("--no-open", "Don't open the PDF after generation (macOS only)")
  .option("--debug", "Enable debug mode (keeps temporary files)")
  .option("--verbose", "Enable verbose logging")
  .action(async (input, options) => {
    try {
      console.log(chalk.blue("🔄 2pdf v" + packageJson.version));

      const resolvedInput = path.resolve(process.cwd(), input);
      const inputStat = fs.statSync(resolvedInput);

      // ── Directory / batch mode ──────────────────────────────────────────────
      if (inputStat.isDirectory()) {
        if (options.output) {
          console.log(chalk.yellow("⚠️  --output is ignored in directory mode (PDFs are placed next to their source files)"));
        }

        const files = collectFiles(resolvedInput, options.recursive || false);

        if (files.length === 0) {
          console.log(chalk.yellow("⚠️  No .md or .html files found in"), chalk.cyan(resolvedInput));
          process.exit(0);
        }

        const mode = options.recursive ? "recursively" : "non-recursively";
        console.log(chalk.blue(`📂 Converting ${files.length} file(s) in`), chalk.cyan(resolvedInput), chalk.blue(`(${mode})...`));

        let passed = 0;
        let failed = 0;
        const failures = [];

        for (const file of files) {
          const rel = path.relative(resolvedInput, file);
          process.stdout.write(chalk.gray(`  → ${rel} ... `));

          const converter = new ToPdf({
            configPath: options.config,
            stylePath: options.style,
            themeColor: options.color,
            singlePage: options.singlePage || false,
            openAfterGeneration: false, // never auto-open in batch mode
            debug: options.debug || false,
            verbose: options.verbose || false,
          });

          const result = await converter.convert(file);

          if (result.success) {
            console.log(chalk.green(`✅ ${result.outputPath} (${result.fileSize})`));
            passed++;
          } else {
            console.log(chalk.red(`❌ ${result.error}`));
            failed++;
            failures.push({ file: rel, error: result.error });
          }
        }

        console.log("");
        console.log(chalk.blue(`📊 Done: ${passed} succeeded, ${failed} failed`));

        if (failures.length > 0) {
          console.log(chalk.red("\nFailed files:"));
          for (const f of failures) {
            console.log(chalk.red(`  • ${f.file}: ${f.error}`));
          }
          process.exit(1);
        }

      // ── Single-file mode ────────────────────────────────────────────────────
      } else {
        console.log(chalk.blue("🔄 Converting"), chalk.cyan(input), chalk.blue("to PDF..."));

        const converter = new ToPdf({
          configPath: options.config,
          outputPath: options.output,
          stylePath: options.style,
          themeColor: options.color,
          singlePage: options.singlePage || false,
          openAfterGeneration: options.open !== false,
          debug: options.debug || false,
          verbose: options.verbose || false,
        });

        const result = await converter.convert(input);

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
