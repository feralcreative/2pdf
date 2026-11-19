/**
 * Web Converter
 *
 * Turns one uploaded Markdown buffer into a PDF buffer by running the same
 * ToPdf pipeline as the CLI, in sandboxed mode, inside a throwaway directory.
 *
 * Conversions run one at a time. Each launches its own Chrome, and a server
 * that launched one per request would fall over under a handful of uploads.
 *
 * Each conversion runs in its own child process (web/worker.js), so one that
 * hangs or balloons can be killed outright, Chrome included, and nothing
 * (Marked's global extension list, for one) builds up between uploads.
 */

const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const { fork } = require("child_process");

const WORKER_PATH = path.join(__dirname, "worker.js");
const DEFAULT_TIMEOUT_MS = 90 * 1000;
const DEFAULT_MAX_PDF_BYTES = 50 * 1024 * 1024;
const WORKER_MEMORY_MB = 512;

class QueueFullError extends Error {
  constructor() {
    super("Too many conversions are waiting");
    this.name = "QueueFullError";
  }
}

class ConversionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConversionError";
  }
}

class WebConverter {
  constructor(options = {}) {
    this.configPath = options.configPath || null;
    this.maxWaiting = options.maxWaiting || 8;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.maxPdfBytes = options.maxPdfBytes || DEFAULT_MAX_PDF_BYTES;
    this.workerPath = options.workerPath || WORKER_PATH;
    this.waiting = 0;
    this.tail = Promise.resolve();
  }

  /**
   * Reduces an uploaded file name to a safe Markdown file name. The name only
   * decides what the PDF is called; it never reaches a path outside the
   * conversion's own directory.
   */
  safeInputName(name) {
    const base = path
      .basename(String(name || "").replace(/\\/g, "/"))
      .replace(/\.(md|markdown)$/i, "")
      .replace(/[^A-Za-z0-9._ -]/g, "_")
      .replace(/^[.\s]+/, "")
      .slice(0, 100)
      .trim();
    return `${base || "document"}.md`;
  }

  /**
   * Queues a conversion. Resolves with { pdf, filename }; rejects with
   * QueueFullError or ConversionError.
   */
  convert(markdown, name) {
    if (this.waiting >= this.maxWaiting) {
      return Promise.reject(new QueueFullError());
    }
    this.waiting++;
    const run = this.tail.then(() => this.convertNow(markdown, name));
    // The queue moves on whether this one worked or not.
    this.tail = run.then(
      () => {},
      () => {}
    );
    return run.finally(() => {
      this.waiting--;
    });
  }

  /**
   * Runs one job in a worker process and resolves with ToPdf's result object.
   * The worker leads its own process group, so killing the group on timeout
   * takes Chrome down with it.
   */
  runWorker(job) {
    return new Promise((resolve, reject) => {
      const child = fork(this.workerPath, [], {
        detached: true,
        execArgv: [`--max-old-space-size=${WORKER_MEMORY_MB}`],
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        // The worker gets no credentials: only what Chrome and Node need to start.
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          LANG: process.env.LANG,
          TOPDF_CHROME_NO_SANDBOX: process.env.TOPDF_CHROME_NO_SANDBOX,
          PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR,
          PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
        },
      });

      let settled = false;
      const killGroup = () => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (e) {
          // Already gone.
        }
      };
      const finish = (settle, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        settle(value);
      };

      const timer = setTimeout(() => {
        killGroup();
        finish(reject, new ConversionError(`Conversion timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      child.once("message", (result) => {
        finish(resolve, result);
        killGroup();
      });
      child.once("error", (error) => finish(reject, new ConversionError(error.message)));
      child.once("exit", (code, signal) => {
        // Sweep up a Chrome the worker may have left behind.
        killGroup();
        finish(reject, new ConversionError(`Worker exited before finishing (${signal || code})`));
      });
      child.send(job);
    });
  }

  async convertNow(markdown, name) {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "2pdf-web-"));
    try {
      const inputPath = path.join(workDir, this.safeInputName(name));
      await fs.writeFile(inputPath, markdown);

      const result = await this.runWorker({ inputPath, configPath: this.configPath });
      if (!result || !result.success) {
        throw new ConversionError((result && result.error) || "Conversion failed");
      }

      // Belt and braces: the PDF must be inside this conversion's directory.
      const outputPath = path.resolve(result.fullPath);
      if (path.dirname(outputPath) !== path.resolve(workDir)) {
        throw new ConversionError("Conversion wrote outside its directory");
      }
      const { size } = await fs.stat(outputPath);
      if (size > this.maxPdfBytes) {
        throw new ConversionError(`PDF is too large (${size} bytes)`);
      }
      return { pdf: await fs.readFile(outputPath), filename: path.basename(outputPath) };
    } finally {
      await fs.remove(workDir);
    }
  }
}

module.exports = WebConverter;
module.exports.QueueFullError = QueueFullError;
module.exports.ConversionError = ConversionError;
