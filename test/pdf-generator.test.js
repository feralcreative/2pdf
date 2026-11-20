const PdfGenerator = require("../src/pdf-generator");

describe("PdfGenerator", () => {
  describe("browser choice", () => {
    const saved = process.env.PUPPETEER_EXECUTABLE_PATH;

    afterEach(() => {
      if (saved === undefined) {
        delete process.env.PUPPETEER_EXECUTABLE_PATH;
      } else {
        process.env.PUPPETEER_EXECUTABLE_PATH = saved;
      }
    });

    test("leaves the browser to Puppeteer when PUPPETEER_EXECUTABLE_PATH is set", () => {
      process.env.PUPPETEER_EXECUTABLE_PATH = "/opt/some/chrome";

      expect(new PdfGenerator().chromeOptions.executablePath).toBeUndefined();
    });

    test("only ever picks a system Chrome from its own list otherwise", () => {
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
      const chosen = new PdfGenerator().chromeOptions.executablePath;

      expect([
        undefined,
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
      ]).toContain(chosen);
    });
  });
});
