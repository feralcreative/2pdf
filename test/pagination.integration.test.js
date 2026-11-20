/**
 * Pagination, checked in a real browser.
 *
 * The keep-together rules are CSS, and whether they work is up to Chrome, so
 * string tests cannot cover them. Each case here prints a short document many
 * times, pushing the block under test a little further down the page each
 * time, and asserts that the rule holds wherever the page boundary lands.
 *
 * Needs Chrome, pdftotext (Poppler), and the compiled stylesheet. Skipped when
 * any of the three is missing.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const puppeteer = require("puppeteer");
const which = require("which");
const PdfGenerator = require("../src/pdf-generator");

const stylesheetPath = path.join(__dirname, "..", "public", "assets", "styles", "pdf.min.css");
const pdfToText = which.sync("pdftotext", { nothrow: true });
const generator = new PdfGenerator();
const canRun = Boolean(pdfToText && fs.existsSync(stylesheetPath) && generator.chromeOptions.executablePath);

const describeIfPossible = canRun ? describe : describe.skip;

describeIfPossible("pagination in Chrome", () => {
  let browser;
  let dir;
  let stylesheet;

  beforeAll(async () => {
    stylesheet = fs.readFileSync(stylesheetPath, "utf8");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "2pdf-pagination-"));
    browser = await puppeteer.launch(generator.chromeOptions);
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  // Print a body under the real stylesheet and return, per page, the marker
  // words found on it (markers are ALL-CAPS words with an optional number).
  const printedPages = async (body) => {
    const page = await browser.newPage();
    try {
      await page.setContent(`<html><head><style>${stylesheet}</style></head><body>${body}</body></html>`);
      await generator.markBlocksThatFit(page, true);
      const pdfPath = path.join(dir, "out.pdf");
      await page.pdf({
        path: pdfPath,
        format: "Letter",
        margin: { top: "0.5in", right: "0.5in", bottom: "0.75in", left: "0.5in" },
      });
      const text = execFileSync(pdfToText, ["-layout", pdfPath, "-"], { encoding: "utf8" });
      return text.split("\f").map((pageText) => pageText.match(/\b[A-Z]{3,}\d*\b/g) || []);
    } finally {
      await page.close();
    }
  };

  const filler = (count) => Array.from({ length: count }, () => "<p>filler text</p>").join("");
  const pageOf = (pages, marker) => pages.findIndex((words) => words.includes(marker));

  // Start the block at 25 different heights, enough to cross a page boundary
  const sweep = async (build, check) => {
    for (let count = 20; count < 45; count++) {
      check(await printedPages(build(filler(count))), count);
    }
  };

  test("a heading stays with the block after it", async () => {
    await sweep(
      (before) => `${before}<h3>HEADING</h3><pre>BLOCK\n${"line\n".repeat(12)}</pre>`,
      (pages) => expect(pageOf(pages, "HEADING")).toBe(pageOf(pages, "BLOCK"))
    );
  }, 120000);

  test("a lead-in paragraph stays with the table it introduces", async () => {
    const rows = [1, 2, 3, 4].map((n) => `<tr><td>ROW${n}</td></tr>`).join("");
    await sweep(
      (before) =>
        `${before}<p class="lead-in">LEADIN:</p><table><thead><tr><th>HEAD</th></tr></thead><tbody>${rows}</tbody></table>`,
      (pages) => expect(pageOf(pages, "LEADIN")).toBe(pageOf(pages, "ROW1"))
    );
  }, 120000);

  test("a short table is never split", async () => {
    const rows = [1, 2, 3, 4, 5, 6].map((n) => `<tr><td>ROW${n}</td></tr>`).join("");
    await sweep(
      (before) => `${before}<table><thead><tr><th>HEAD</th></tr></thead><tbody>${rows}</tbody></table>`,
      (pages) => expect(pageOf(pages, "ROW1")).toBe(pageOf(pages, "ROW6"))
    );
  }, 120000);

  test("a long table keeps at least three rows on each side of a break", async () => {
    const count = 40;
    const rows = Array.from({ length: count }, (_, n) => `<tr><td>ROW${n + 1}</td></tr>`).join("");
    await sweep(
      (before) => `${before}<table><thead><tr><th>HEAD</th></tr></thead><tbody>${rows}</tbody></table>`,
      (pages) => {
        const perPage = pages.map((words) => words.filter((word) => /^ROW\d+$/.test(word)).length).filter(Boolean);
        expect(perPage.reduce((sum, n) => sum + n, 0)).toBe(count);
        for (const n of perPage) {
          expect(n).toBeGreaterThanOrEqual(3);
        }
      }
    );
  }, 120000);

  test("a list never leaves one item alone", async () => {
    const items = [1, 2, 3, 4, 5].map((n) => `<li>ITEM${n}</li>`).join("");
    await sweep(
      (before) => `${before}<ul>${items}</ul>`,
      (pages) => {
        const perPage = pages.map((words) => words.filter((word) => /^ITEM\d+$/.test(word)).length).filter(Boolean);
        for (const n of perPage) {
          expect(n).toBeGreaterThanOrEqual(2);
        }
      }
    );
  }, 120000);

  test("an image and its caption stay together, with the heading above them", async () => {
    const image =
      "data:image/svg+xml;utf8," +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#ccc"/></svg>');
    await sweep(
      (before) =>
        `${before}<h3>HEADING</h3><figure class="pdf-figure"><p class="img-block"><img src="${image}" alt=""></p>` +
        `<figcaption><em>CAPTION</em></figcaption></figure><p>AFTER</p>`,
      (pages) => expect(pageOf(pages, "HEADING")).toBe(pageOf(pages, "CAPTION"))
    );
  }, 120000);

  test("measuring tables leaves the viewport as it was", async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1200, height: 800 });
      await page.setContent("<html><body><table><tr><td>x</td></tr></table></body></html>");
      await generator.markBlocksThatFit(page, true);
      expect(page.viewport()).toMatchObject({ width: 1200, height: 800 });
      expect(await page.evaluate(() => window.innerWidth)).toBe(1200);
      expect(await page.evaluate(() => document.documentElement.style.width)).toBe("");
      expect(await page.evaluate(() => document.querySelector("table").className)).toBe("keep-together");
    } finally {
      await page.close();
    }
  }, 60000);
});
