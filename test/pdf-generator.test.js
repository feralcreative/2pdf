const path = require("path");
const { execFileSync } = require("child_process");
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

    // Puppeteer reads the variable when it is first loaded, so this has to be
    // asked of a fresh process that starts with it set. Any file that exists
    // will do as the browser: nothing is launched.
    test("Puppeteer then launches the browser the variable names", () => {
      const script = `
        const PdfGenerator = require(${JSON.stringify(path.join(__dirname, "..", "src", "pdf-generator"))});
        const puppeteer = require("puppeteer");
        const own = new PdfGenerator().chromeOptions.executablePath || null;
        process.stdout.write("RESULT" + JSON.stringify({ own, launches: puppeteer.executablePath() }));
      `;
      const output = execFileSync(process.execPath, ["-e", script], {
        env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: process.execPath },
        encoding: "utf8",
      });

      expect(JSON.parse(output.split("RESULT")[1])).toEqual({ own: null, launches: process.execPath });
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
