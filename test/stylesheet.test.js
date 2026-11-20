/**
 * The compiled stylesheet is committed so that an installed copy of 2pdf
 * works with no build step. This test fails when it no longer matches the
 * SCSS it was compiled from.
 */

const fs = require("fs-extra");
const path = require("path");
const sass = require("sass");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "assets", "styles", "pdf.scss");
const COMPILED = path.join(ROOT, "public", "assets", "styles", "pdf.min.css");

// A watcher may append a source map comment, and Sass writes a byte order
// mark when the output has non-ASCII characters. Neither changes the styles.
const normalize = (css) =>
  css
    .replace(/^﻿/, "")
    .replace(/\/\*# sourceMappingURL=.*?\*\/\s*$/, "")
    .trim();

describe("compiled stylesheet", () => {
  test("public/assets/styles/pdf.min.css matches assets/styles/pdf.scss (fix: npm run build:css)", async () => {
    const committed = await fs.readFile(COMPILED, "utf8");
    const fresh = sass.compile(SOURCE, { style: "compressed", logger: sass.Logger.silent }).css;

    expect(normalize(committed)).toBe(normalize(fresh));
  });
});
