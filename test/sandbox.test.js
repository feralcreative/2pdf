const crypto = require("crypto");
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
