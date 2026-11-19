// Stand-in for web/worker.js: reports a failed conversion.
process.once("message", () => {
  process.send({ success: false, error: "boom at /srv/secret/path" });
});
