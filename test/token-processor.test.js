/**
 * Token Processor Tests
 */

const TokenProcessor = require("../src/token-processor");
const ConfigManager = require("../src/config-manager");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");

describe("TokenProcessor", () => {
  let tokenProcessor;
  let configManager;

  beforeEach(() => {
    configManager = new ConfigManager(__dirname, process.cwd());
    tokenProcessor = new TokenProcessor(configManager);
  });

  describe("hasToken", () => {
    test("should detect tokens in content", () => {
      const content = "Hello {{NAME}}, today is {{DATE}}";
      expect(tokenProcessor.hasToken(content, "NAME")).toBe(true);
      expect(tokenProcessor.hasToken(content, "DATE")).toBe(true);
      expect(tokenProcessor.hasToken(content, "MISSING")).toBe(false);
    });
  });

  describe("replaceToken", () => {
    test("should replace simple tokens", () => {
      const content = "Hello {{NAME}}!";
      const result = tokenProcessor.replaceToken(content, "NAME", "World");
      expect(result).toBe("Hello World!");
    });

    test("should replace multiple occurrences", () => {
      const content = "{{NAME}} says hello to {{NAME}}";
      const result = tokenProcessor.replaceToken(content, "NAME", "Alice");
      expect(result).toBe("Alice says hello to Alice");
    });

    test("should handle special characters in values", () => {
      const content = "Path: {{PATH}}";
      const result = tokenProcessor.replaceToken(content, "PATH", "/path/with/special$chars");
      expect(result).toBe("Path: /path/with/special$chars");
    });
  });

  describe("findRemainingTokens", () => {
    test("should find unprocessed tokens", () => {
      const content = "Hello {{NAME}}, today is {{DATE}}, version {{VERSION}}";
      const tokens = tokenProcessor.findRemainingTokens(content);
      expect(tokens).toEqual(["{{NAME}}", "{{DATE}}", "{{VERSION}}"]);
    });

    test("should return empty array when no tokens", () => {
      const content = "Hello World, no tokens here";
      const tokens = tokenProcessor.findRemainingTokens(content);
      expect(tokens).toEqual([]);
    });
  });

  describe("processTokens", () => {
    let tempDir;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "2pdf-test-"));
    });

    afterEach(async () => {
      await fs.remove(tempDir);
    });

    const writeInput = async (content) => {
      const inputPath = path.join(tempDir, "input.md");
      await fs.writeFile(inputPath, content);
      return inputPath;
    };

    test("should process automatic tokens when config is empty", async () => {
      const inputPath = await writeInput("Generated on {{DATE}} by {{USERNAME}}");

      const result = await tokenProcessor.processTokens(inputPath, {});

      // Automatic tokens are documented as always available, so an empty config
      // must not short-circuit them.
      expect(result).toMatch(/Generated on \d{4}-\d{2}-\d{2} by \w+/);
      expect(result).not.toContain("{{DATE}}");
      expect(result).not.toContain("{{USERNAME}}");
    });

    test("should process config tokens", async () => {
      const inputPath = await writeInput("Created by {{DEVELOPER_NAME}} at {{COMPANY_NAME}}");

      const result = await tokenProcessor.processTokens(inputPath, {
        DEVELOPER_NAME: "John Doe",
        COMPANY_NAME: "Acme Corp",
      });

      expect(result).toBe("Created by John Doe at Acme Corp");
    });

    test("should leave tokens inside code blocks alone", async () => {
      const inputPath = await writeInput('Use {{DATE}} here.\n\n```bash\necho "{{DATE}}"\n```\n');

      const result = await tokenProcessor.processTokens(inputPath, {});

      expect(result).toMatch(/Use \d{4}-\d{2}-\d{2} here\./);
      expect(result).toContain('echo "{{DATE}}"');
    });
  });
});
