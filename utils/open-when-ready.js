// Opens the web version in a browser once `npm start` is serving.
//
// This lives outside the server on purpose. `npm start` runs the server under
// `node --watch`, which restarts it on every save; an opener inside the server
// would open a new tab each time. This runs once per `npm start` and exits as
// soon as the port answers. Set OPEN_BROWSER=0 to skip.

const { spawn } = require("child_process");

const PORT = process.env.PORT;
const TARGET = `http://localhost:${PORT}/`;
const TIMEOUT_MS = 15000;
const POLL_MS = 250;

// Any HTTP response means the server is up.
async function isUp() {
  try {
    await fetch(`http://localhost:${PORT}/healthz`, { signal: AbortSignal.timeout(POLL_MS * 2) });
    return true;
  } catch (e) {
    return false;
  }
}

(async () => {
  // The server reports a missing PORT itself; stay quiet here.
  if (process.env.OPEN_BROWSER === "0" || !PORT) return;

  const opener =
    process.platform === "darwin"
      ? ["open", [TARGET]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", TARGET]]
        : ["xdg-open", [TARGET]];

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isUp()) {
      spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  console.warn(`[open] Server did not answer within ${TIMEOUT_MS / 1000}s; open ${TARGET} yourself.`);
})();
