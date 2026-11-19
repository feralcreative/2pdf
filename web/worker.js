/**
 * Conversion worker
 *
 * Runs one sandboxed conversion and reports the result to its parent over
 * IPC. web/convert.js starts a fresh worker per upload and kills the whole
 * process group (this process and its Chrome) when it runs too long.
 */

const { ToPdf } = require("../src/index");

process.once("message", async (job) => {
  let result;
  try {
    result = await new ToPdf({
      sandboxed: true,
      configPath: job.configPath || null,
      openAfterGeneration: false,
    }).convert(job.inputPath);
  } catch (error) {
    result = { success: false, error: error.message };
  }
  // The parent ends this process once it has the result.
  process.send(result);
});

// If the server goes away, take this process group (this worker and its
// Chrome) down with it. The worker is started as the group's leader.
process.on("disconnect", () => {
  try {
    process.kill(-process.pid, "SIGKILL");
  } catch (e) {
    process.exit(0);
  }
});
