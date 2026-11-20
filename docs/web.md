# Web Version

Updated: 2026-11-18

A drop page and one endpoint: sign in with Google, drop a Markdown file, get the PDF. It lives in `web/` and runs the same `ToPdf` pipeline as the CLI, in sandboxed mode. It uses Node's built-in `http` server and adds no dependencies.

It needs Node 22 or newer, the same as the CLI (`engines` in `package.json`). `web/` is not part of the installed package; run it from a checkout.

## Running it locally

```bash
npm start
```

That compiles `web/styles/app.scss`, watches it, runs `web/server.js` under `node --watch` on port 1646, and opens `http://localhost:1646/` once the port answers. `npm run start:no-open` skips the browser. Port 1646 is this repo's entry (`2pdf`) in Port Roulette.

`npm start` passes `--dev`, which means: when `GOOGLE_CLIENT_ID` is not set, run with sign-in off. Sign-in can only be off while the server listens on `127.0.0.1`; any other `HOST` refuses to start.

## Settings

All from the environment. None is a secret.

| Variable | Meaning |
| --- | --- |
| `PORT` | Required. `npm start` sets 1646. |
| `HOST` | Address to listen on. Default `127.0.0.1`. |
| `GOOGLE_CLIENT_ID` | OAuth client ID (type "Web application") whose authorized JavaScript origins include the site's origin. Required unless sign-in is off. |
| `ALLOWED_DOMAINS` | Comma-separated Google Workspace domains that may sign in. Required when sign-in is on. |
| `ALLOWED_SUBS` | Optional comma-separated Google subject IDs. When set, only those people get in. |
| `AUTH_DISABLED` | `1` turns sign-in off. Honored only on `127.0.0.1`, and ignored when a client ID is set. |
| `TOPDF_WEB_CONFIG` | Optional path to a `2pdf.config` whose tokens uploads may use. Everything in it is readable by anyone who can upload, and replaced values are written to the log, so it must hold nothing private. |
| `MAX_BODY_BYTES` | Upload limit. Default 2 MB. |
| `TOPDF_CHROME_NO_SANDBOX` | `1` runs Chrome without its process sandbox. See Hosting. |

## Endpoints

| Route | What it does |
| --- | --- |
| `GET /` | The drop page (`web/public/`). |
| `GET /healthz` | `{"ok":true}`. |
| `GET /api/config` | Whether sign-in is on, and the client ID. |
| `POST /api/convert?name=<file>.md` | Body is the raw Markdown, `Content-Type: text/markdown`, with `Authorization: Bearer <Google ID token>` when sign-in is on. Answers with the PDF. |

Errors are JSON, `{"error": "…"}`: 400 empty file, 401 not signed in, 403 cross-site request, 413 too large, 415 wrong type, 429 more than two conversions waiting for one person, 503 queue full, 500 conversion failed. The pipeline's own error text stays in the server log because it can contain paths.

## How an upload is handled

1. `web/server.js` checks the origin, the content type, and the Google token, in that order, before it reads the body.
2. `web/convert.js` writes the upload into a fresh `2pdf-web-XXXXXX` directory and queues it. One conversion runs at a time; eight may wait.
3. Each conversion runs in its own child process (`web/worker.js`) with a 512 MB heap and a 90-second limit. The worker leads its own process group, so a timeout kills it and its Chrome together. The worker's environment holds only what Node and Chrome need to start.
4. The PDF is read back (50 MB limit), the directory is removed, and the PDF is sent.

## Sandboxed mode

`new ToPdf({ sandboxed: true })` treats the input as hostile. The CLI never sets it. What changes:

- **No scripts.** The rendered page gets a Content Security Policy whose only allowed script is the wrapper's own, matched by hash. Raw `<script>` tags, `onerror=` handlers, and anything injected through a title or a setting are inert.
- **Guarded requests.** Chrome's same-origin rules stay on, and every request goes through `src/request-guard.js`. The rendered HTML file and `data:` URLs pass. Images, fonts, and stylesheets over `https:` on port 443 are fetched in Node from an address checked to be public, then handed to Chrome; the address checked is the address connected to, and each redirect hop is checked again. Everything else is aborted: other `file:` URLs, `http:`, frames, fetches, and private, loopback, and link-local addresses. A document may load at most 50 remote files, 10 MB each and 40 MB in all, and remote servers see a fixed generic user agent. IPv6 is allowed only in global unicast space.
- **Chrome's process sandbox stays on.**
- **Paths.** `<!-- filename: -->` is reduced to a plain file name, and `<!-- logo: -->` must be a plain `.svg` or `.png` name inside `public/assets/images/`.
- **Tokens.** `{{HOSTNAME}}`, `{{USERNAME}}`, `{{PWD}}`, and `{{SCRIPT_DIR}}` are empty, and no `2pdf.config` is searched for.
- **Footer.** The title and disclosure are HTML-escaped.
- **Never opens the PDF, never keeps debug files.**

`<!-- sequential-output: -->` still rewrites its source, which here is the throwaway copy, so the version number never advances on the web.

## What it does not do

- **Pictures from your computer.** One Markdown file per request. Images must be `https:` links or data URIs.
- **HTML input, custom stylesheets, single-page mode.**
- **Stop a signed-in person from making the server fetch a public URL.** Only `GET`, only images, fonts, and stylesheets, and never a private address, but it is still a request from the server, and the remote site sees the server's address.
- **Cancel a conversion when the browser disconnects.** It runs to the end or to the 90-second limit. The queue and per-person limits bound the cost.
- **Hide its temp path from relative links.** A relative link in a document is resolved against the throwaway directory, so the PDF's link can show a path like `/tmp/2pdf-XXXXXX/`.
- **Run on Windows.** Killing a stuck conversion relies on POSIX process groups.

## Sign-in

The page uses Google Identity Services and keeps the ID token in memory only. `web/auth.js` verifies it with Node's `crypto` against Google's published keys: RS256 only, signature first, then issuer, audience, expiry, `email_verified`, and both the `hd` claim and the email's domain against `ALLOWED_DOMAINS`. A personal Gmail account has no `hd` and is refused. People are identified by Google's `sub`, never by email.

Google recommends a maintained library for this check. This one is hand-written because the web version was built with no new dependencies; `test/web-auth.test.js` covers the known attacks (wrong audience, `alg: none`, HMAC with the public key, tampered payload, lookalike domains). Swapping in `google-auth-library` is a contained change to `web/auth.js`.

## Hosting

Not decided, and nothing here deploys it. Whatever hosts it must provide:

- HTTPS in front of the server, and `HOST=0.0.0.0` behind it.
- Node 20 or newer, Chrome, and both stylesheets compiled at build time (`pdf.scss` per the README, and `npm run web:css`), since compiled CSS is not in git.
- A non-root user, so Chrome's sandbox can run. If the platform cannot run it, `TOPDF_CHROME_NO_SANDBOX=1` turns it off, and a Chrome bug is then one step from the server. Only do that inside a container that holds no credentials.
- No service-account keys or other secrets in the server's environment, and outbound traffic limited to the public internet if the platform can do it.
- One instance, or a per-instance queue: the queue lives in memory.

This repo is public, so brand assets and licensed fonts must not be added to the drop page here.
