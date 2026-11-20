const crypto = require("crypto");
const os = require("os");
const path = require("path");
const fs = require("fs-extra");
const ConfigManager = require("../src/config-manager");
const { ToPdf } = require("../src/index");

describe("ToPdf", () => {
  describe("sandboxed options", () => {
    test("should never open or keep debug files when sandboxed", () => {
      const toPdf = new ToPdf({ sandboxed: true, debug: true, openAfterGeneration: true });
      expect(toPdf.options.openAfterGeneration).toBe(false);
      expect(toPdf.options.debug).toBe(false);
    });

  });

  describe("safeOutputName", () => {
    const toPdf = new ToPdf({ sandboxed: true });

    test("should keep a plain PDF name", () => {
      expect(toPdf.safeOutputName("Q3 Report.pdf")).toBe("Q3 Report.pdf");
    });

    test("should strip directories and shell characters", () => {
      expect(toPdf.safeOutputName("../../etc/cron.d/x.pdf")).toBe("x.pdf");
      expect(toPdf.safeOutputName("C:\\Users\\x\\evil.pdf")).toBe("evil.pdf");
      expect(toPdf.safeOutputName('a"; rm -rf ~; ".pdf')).toBe("a__ rm -rf __ _.pdf");
      expect(toPdf.safeOutputName("..pdf")).toBe("document.pdf");
      expect(toPdf.safeOutputName("/.pdf")).toBe("document.pdf");
    });
  });

  describe("isBundledLogoName", () => {
    const toPdf = new ToPdf({ sandboxed: true });

    test("should accept a plain image file name", () => {
      expect(toPdf.isBundledLogoName("logo-feral.svg")).toBe(true);
      expect(toPdf.isBundledLogoName("logo-acmpls.png")).toBe(true);
    });

    test("should refuse paths and other file types", () => {
      for (const logo of ["/etc/passwd", "../../etc/passwd", "sub/logo.svg", "..svg", "logo.svg/", "notes.txt", ".env"]) {
        expect(toPdf.isBundledLogoName(logo)).toBe(false);
      }
    });
  });

  describe("resolveLogoPath", () => {
    let root;
    let installDir;
    let docDir;
    let bundledDir;

    beforeEach(async () => {
      root = await fs.mkdtemp(path.join(os.tmpdir(), "2pdf-logo-"));
      installDir = path.join(root, "install");
      docDir = path.join(root, "docs");
      bundledDir = path.join(installDir, "public", "assets", "images");
      await fs.ensureDir(bundledDir);
      await fs.ensureDir(path.join(docDir, "img"));
    });

    afterEach(async () => {
      await fs.remove(root);
    });

    const make = (options = {}) => {
      const toPdf = new ToPdf(options);
      toPdf.scriptDir = installDir;
      return toPdf;
    };

    test("a bare name is the bundled logo when one exists, even with a file of that name beside the document", async () => {
      await fs.writeFile(path.join(bundledDir, "logo.svg"), "<svg/>");
      await fs.writeFile(path.join(docDir, "logo.svg"), "<svg/>");

      expect(await make().resolveLogoPath("logo.svg", docDir)).toBe(path.join(bundledDir, "logo.svg"));
    });

    test("a bare name falls back to the document's directory when nothing bundled has that name", async () => {
      await fs.writeFile(path.join(docDir, "client.svg"), "<svg/>");

      expect(await make().resolveLogoPath("client.svg", docDir)).toBe(path.join(docDir, "client.svg"));
    });

    test("a bare name found nowhere stays the bundled path", async () => {
      expect(await make().resolveLogoPath("missing.svg", docDir)).toBe(path.join(bundledDir, "missing.svg"));
    });

    test("a relative path is relative to the document", async () => {
      await fs.writeFile(path.join(bundledDir, "logo.svg"), "<svg/>");

      expect(await make().resolveLogoPath("./logo.svg", docDir)).toBe(path.join(docDir, "logo.svg"));
      expect(await make().resolveLogoPath("img/logo.svg", docDir)).toBe(path.join(docDir, "img", "logo.svg"));
    });

    test("an absolute path is used as given", async () => {
      expect(await make().resolveLogoPath("/somewhere/logo.svg", docDir)).toBe("/somewhere/logo.svg");
    });

    test("sandboxed runs only ever name a bundled logo", async () => {
      await fs.writeFile(path.join(docDir, "client.svg"), "<svg/>");
      const sandboxed = make({ sandboxed: true });

      expect(await sandboxed.resolveLogoPath("client.svg", docDir)).toBe(path.join(bundledDir, "client.svg"));
      for (const logo of ["./client.svg", "img/logo.svg", "../install/x.svg", "/etc/passwd", path.join(docDir, "client.svg")]) {
        expect(await sandboxed.resolveLogoPath(logo, docDir)).toBeNull();
      }
    });
  });

  describe("applyContentSecurityPolicy", () => {
    const toPdf = new ToPdf({ sandboxed: true });
    const page = (body) => `<!DOCTYPE html>\n<html>\n<head>\n<title>t</title>\n</head>\n<body>\n${body}\n</body>\n</html>`;

    test("should allow only the last script, by hash", () => {
      const html = page("<script>alert(1)</script><p>hi</p>\n<script>\nwrapper();\n</script>");
      const hash = crypto.createHash("sha256").update("\nwrapper();\n", "utf8").digest("base64");
      const result = toPdf.applyContentSecurityPolicy(html);
      expect(result).toContain(`script-src 'sha256-${hash}'`);
      expect(result).toContain("default-src 'none'");
      expect(result.indexOf("Content-Security-Policy")).toBeLessThan(result.indexOf("<title>"));
    });

    test("should allow no script at all when the page has none", () => {
      expect(toPdf.applyContentSecurityPolicy(page("<p>hi</p>"))).toContain("script-src 'none'");
    });
  });
});

describe("ConfigManager", () => {
  describe("getAutomaticTokens sandboxed", () => {
    test("should blank the tokens that describe the machine", () => {
      const tokens = new ConfigManager("/srv/2pdf", "/srv/work", { sandboxed: true }).getAutomaticTokens();
      expect(tokens.HOSTNAME).toBe("");
      expect(tokens.USERNAME).toBe("");
      expect(tokens.PWD).toBe("");
      expect(tokens.SCRIPT_DIR).toBe("");
      expect(tokens.YEAR).toMatch(/^\d{4}$/);
    });

    test("should keep them outside sandboxed mode", () => {
      const tokens = new ConfigManager("/srv/2pdf", "/srv/work").getAutomaticTokens();
      expect(tokens.PWD).toBe("/srv/work");
      expect(tokens.SCRIPT_DIR).toBe("/srv/2pdf");
    });
  });
});
