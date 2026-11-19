const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const WebConverter = require("../web/convert");

const { QueueFullError, ConversionError } = WebConverter;
const fixture = (name) => path.join(__dirname, "fixtures", name);
const leftovers = async () => (await fs.readdir(os.tmpdir())).filter((name) => name.startsWith("2pdf-web-"));

describe("WebConverter", () => {
  describe("safeInputName", () => {
    const converter = new WebConverter();

    test("should keep a plain name and force the .md extension", () => {
      expect(converter.safeInputName("Notes v2.md")).toBe("Notes v2.md");
      expect(converter.safeInputName("readme.markdown")).toBe("readme.md");
    });

    test("should strip directories, dots, and odd characters", () => {
      expect(converter.safeInputName("../../etc/passwd.md")).toBe("passwd.md");
      expect(converter.safeInputName("..\\..\\boot.md")).toBe("boot.md");
      expect(converter.safeInputName(".hidden.md")).toBe("hidden.md");
      expect(converter.safeInputName("a;b|c.md")).toBe("a_b_c.md");
      expect(converter.safeInputName("")).toBe("document.md");
      expect(converter.safeInputName(undefined)).toBe("document.md");
    });
  });

  describe("convert", () => {
    test("should return the PDF and clean up its directory", async () => {
      const before = await leftovers();
      const converter = new WebConverter({ workerPath: fixture("worker-ok.js") });
      const result = await converter.convert(Buffer.from("# Hi"), "hello.md");
      expect(result.filename).toBe("hello.pdf");
      expect(result.pdf.toString()).toBe("%PDF-fake # Hi");
      expect(await leftovers()).toEqual(before);
    });

    test("should run queued conversions in order", async () => {
      const converter = new WebConverter({ workerPath: fixture("worker-ok.js") });
      const results = await Promise.all([
        converter.convert(Buffer.from("one"), "1.md"),
        converter.convert(Buffer.from("two"), "2.md"),
      ]);
      expect(results.map((result) => result.filename)).toEqual(["1.pdf", "2.pdf"]);
    });

    test("should refuse work when the queue is full", async () => {
      const converter = new WebConverter({ workerPath: fixture("worker-ok.js"), maxWaiting: 1 });
      const first = converter.convert(Buffer.from("one"), "1.md");
      await expect(converter.convert(Buffer.from("two"), "2.md")).rejects.toBeInstanceOf(QueueFullError);
      await first;
      await expect(converter.convert(Buffer.from("three"), "3.md")).resolves.toBeTruthy();
    });

    test("should kill a worker that runs too long, then carry on", async () => {
      const before = await leftovers();
      const hanging = new WebConverter({ workerPath: fixture("worker-hang.js"), timeoutMs: 300 });
      await expect(hanging.convert(Buffer.from("x"), "x.md")).rejects.toThrow(/timed out/);
      expect(await leftovers()).toEqual(before);
    });

    test("should reject a failed conversion", async () => {
      const converter = new WebConverter({ workerPath: fixture("worker-fail.js") });
      await expect(converter.convert(Buffer.from("x"), "x.md")).rejects.toBeInstanceOf(ConversionError);
    });

    test("should refuse a PDF written outside the job directory", async () => {
      const converter = new WebConverter({ workerPath: fixture("worker-escape.js") });
      await expect(converter.convert(Buffer.from("x"), "x.md")).rejects.toThrow(/outside its directory/);
    });

    test("should refuse an oversized PDF", async () => {
      const converter = new WebConverter({ workerPath: fixture("worker-ok.js"), maxPdfBytes: 5 });
      await expect(converter.convert(Buffer.from("# Hi"), "hello.md")).rejects.toThrow(/too large/);
    });
  });
});
