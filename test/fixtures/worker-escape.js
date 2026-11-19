// Stand-in for web/worker.js: claims a PDF outside the job directory.
const os = require("os");
const path = require("path");

process.once("message", () => {
  process.send({ success: true, fullPath: path.join(os.tmpdir(), "elsewhere.pdf") });
});
