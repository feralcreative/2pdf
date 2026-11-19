/**
 * 2pdf Web Server
 *
 * A drop page and one endpoint: POST a Markdown file, get the PDF back. Uses
 * Node's built-in http server and nothing else. See docs/web.md.
 *
 * Access is enforced here, on every convert request. The page's sign-in state
 * (web/public/app.js) only decides what to show.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const GoogleAuth = require("./auth");
const WebConverter = require("./convert");

const { AuthError } = GoogleAuth;
const { QueueFullError } = WebConverter;

const PUBLIC_DIR = path.join(__dirname, "public");
const STATIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/app.css": ["app.css", "text/css; charset=utf-8"],
};
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_WAITING_PER_PERSON = 2;

// Google Identity Services needs its script, its iframe, and its stylesheet.
const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "frame-src https://accounts.google.com/gsi/",
  "connect-src 'self' https://accounts.google.com/gsi/",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": PAGE_CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Cache-Control": "no-store",
};

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Reads settings from the environment and refuses unsafe combinations: the
 * server never runs without sign-in unless it is bound to this machine only.
 */
function loadSettings(env = process.env, argv = process.argv) {
  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT is not set. Start the web version with `npm start`, or set PORT.");
  }

  const host = env.HOST || "127.0.0.1";
  const clientId = (env.GOOGLE_CLIENT_ID || "").trim();
  // --dev means "run without sign-in when no client ID is configured".
  const authDisabled = !clientId && (env.AUTH_DISABLED === "1" || argv.includes("--dev"));

  if (!clientId && !authDisabled) {
    throw new Error("GOOGLE_CLIENT_ID is not set. Sign-in is required unless AUTH_DISABLED=1 on 127.0.0.1.");
  }
  if (authDisabled && !LOOPBACK_HOSTS.has(host)) {
    throw new Error(`Refusing to run without sign-in on ${host}. Sign-in can only be off on 127.0.0.1.`);
  }

  const allowedDomains = splitList(env.ALLOWED_DOMAINS);
  if (!authDisabled && allowedDomains.length === 0) {
    throw new Error("ALLOWED_DOMAINS is not set. List the Google Workspace domains that may sign in.");
  }
  const maxBodyBytes = Number(env.MAX_BODY_BYTES) > 0 ? Number(env.MAX_BODY_BYTES) : DEFAULT_MAX_BODY_BYTES;

  return {
    port,
    host,
    clientId,
    authDisabled,
    allowedDomains,
    allowedSubs: splitList(env.ALLOWED_SUBS),
    configPath: env.TOPDF_WEB_CONFIG || null,
    maxBodyBytes,
  };
}

function sendJson(response, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    ...extraHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(request.headers["content-length"]);
    if (declared > maxBytes) {
      reject(Object.assign(new Error("Body too large"), { status: 413 }));
      return;
    }
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("Body too large"), { status: 413 }));
        request.pause();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

/**
 * Builds the server. `auth` and `converter` can be passed in for tests.
 */
function createServer(settings, parts = {}) {
  const converter = parts.converter || new WebConverter({ configPath: settings.configPath });
  const auth =
    parts.auth ||
    (settings.authDisabled
      ? null
      : new GoogleAuth({
          clientId: settings.clientId,
          allowedDomains: settings.allowedDomains,
          allowedSubs: settings.allowedSubs,
        }));
  const waitingByPerson = new Map();

  function serveStatic(response, pathname) {
    const [file, contentType] = STATIC_FILES[pathname];
    fs.readFile(path.join(PUBLIC_DIR, file), (error, content) => {
      if (error) {
        sendJson(response, 500, { error: `${file} is missing. Run \`npm run web:css\` if it is the stylesheet.` });
        return;
      }
      response.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": contentType, "Content-Length": content.length });
      response.end(content);
    });
  }

  // A browser on another site must not be able to drive this endpoint. The
  // bearer token already stops that when sign-in is on; this covers the
  // local no-sign-in mode, where there is no token to withhold.
  function sameOrigin(request) {
    const origin = request.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === request.headers.host;
    } catch (e) {
      return false;
    }
  }

  async function handleConvert(request, response, url) {
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: "Cross-site requests are not allowed." });
      return;
    }
    // text/markdown is not a "simple" content type, so a cross-site page
    // cannot send it without a preflight this server never approves.
    const contentType = (request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (contentType !== "text/markdown") {
      sendJson(response, 415, { error: "Send the Markdown as text/markdown." });
      return;
    }

    let person = { sub: "local", email: "local" };
    if (auth) {
      const match = /^Bearer (.+)$/.exec(request.headers.authorization || "");
      try {
        person = await auth.verify(match ? match[1] : "");
      } catch (error) {
        if (!(error instanceof AuthError)) throw error;
        console.log(`[web] sign-in refused: ${error.message}`);
        sendJson(response, 401, { error: "Sign in with your work Google account." });
        return;
      }
    }

    const name = url.searchParams.get("name") || "document.md";
    if (!/\.(md|markdown)$/i.test(name)) {
      sendJson(response, 415, { error: "Only .md and .markdown files can be converted." });
      return;
    }

    const waiting = waitingByPerson.get(person.sub) || 0;
    if (waiting >= MAX_WAITING_PER_PERSON) {
      sendJson(response, 429, { error: "Wait for your other conversions to finish." }, { "Retry-After": "10" });
      return;
    }
    waitingByPerson.set(person.sub, waiting + 1);

    try {
      const markdown = await readBody(request, settings.maxBodyBytes);
      if (markdown.length === 0) {
        sendJson(response, 400, { error: "The file is empty." });
        return;
      }

      const started = Date.now();
      const { pdf, filename } = await converter.convert(markdown, name);
      console.log(`[web] converted ${markdown.length} bytes for ${person.sub} in ${Date.now() - started}ms`);

      response.writeHead(200, {
        ...SECURITY_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Length": pdf.length,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      });
      response.end(pdf);
    } catch (error) {
      if (error.status === 413) {
        // Stop reading whatever is left of the oversized upload.
        response.once("finish", () => request.destroy());
        sendJson(response, 413, { error: `The file is larger than ${Math.floor(settings.maxBodyBytes / 1024)} KB.` });
      } else if (error instanceof QueueFullError) {
        sendJson(response, 503, { error: "The converter is busy. Try again in a minute." }, { "Retry-After": "30" });
      } else {
        // The pipeline's own message can hold server paths, so it stays in the log.
        console.error("[web] conversion failed:", error.stack || error);
        sendJson(response, 500, { error: "That file could not be converted." });
      }
    } finally {
      const left = (waitingByPerson.get(person.sub) || 1) - 1;
      if (left > 0) waitingByPerson.set(person.sub, left);
      else waitingByPerson.delete(person.sub);
    }
  }

  const server = http.createServer((request, response) => {
    let url;
    try {
      url = new URL(request.url, "http://localhost");
    } catch (e) {
      // A request target the URL parser rejects must not take the server down.
      sendJson(response, 400, { error: "Bad request." });
      return;
    }
    const route = `${request.method} ${url.pathname}`;

    if (request.method === "GET" && STATIC_FILES[url.pathname]) {
      serveStatic(response, url.pathname);
    } else if (route === "GET /healthz") {
      sendJson(response, 200, { ok: true });
    } else if (route === "GET /api/config") {
      sendJson(response, 200, { signIn: !settings.authDisabled, clientId: settings.clientId });
    } else if (route === "POST /api/convert") {
      handleConvert(request, response, url).catch((error) => {
        console.error("[web] request failed:", error.stack || error);
        if (!response.headersSent) sendJson(response, 500, { error: "Something went wrong." });
        else response.destroy();
      });
    } else {
      sendJson(response, 404, { error: "Not found." });
    }
  });

  // An upload is at most a couple of megabytes; a client that takes longer
  // than this to send one is not uploading a document.
  server.headersTimeout = 10 * 1000;
  server.requestTimeout = 30 * 1000;
  return server;
}

if (require.main === module) {
  // fetch, AbortSignal.timeout, JWK import, and --watch all need a current Node.
  if (Number(process.versions.node.split(".")[0]) < 20) {
    console.error(`[web] The web version needs Node 20 or newer; this is ${process.version}.`);
    process.exit(1);
  }
  let settings;
  try {
    settings = loadSettings();
  } catch (error) {
    console.error(`[web] ${error.message}`);
    process.exit(1);
  }
  const server = createServer(settings);
  server.listen(settings.port, settings.host, () => {
    console.log(`[web] 2pdf is listening at http://localhost:${settings.port}/`);
    console.log(
      settings.authDisabled
        ? "[web] Sign-in is OFF (local only)."
        : `[web] Sign-in is on for ${settings.allowedDomains.join(", ")}.`
    );
  });
}

module.exports = { createServer, loadSettings };
