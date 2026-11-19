// Stand-in for web/worker.js: writes a small "PDF" beside the input.
const fs = require("fs");
const path = require("path");

process.once("message", (job) => {
  const fullPath = path.join(path.dirname(job.inputPath), path.basename(job.inputPath, ".md") + ".pdf");
  fs.writeFileSync(fullPath, "%PDF-fake " + fs.readFileSync(job.inputPath, "utf8"));
  process.send({ success: true, fullPath });
});
