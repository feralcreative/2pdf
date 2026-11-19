/**
 * Request Guard
 *
 * Decides what Chrome may load while rendering an untrusted document (the
 * `sandboxed` option, used by the web version). The rendered HTML file itself
 * and data: URLs pass straight through. Images, fonts, and stylesheets over
 * https are fetched here in Node, from an address that has been checked to be
 * public, and handed back to Chrome. Everything else is aborted.
 *
 * Fetching in Node rather than letting Chrome do it is what stops DNS
 * rebinding: the address that was checked is the address that is connected to.
 */

const dns = require("dns");
const https = require("https");
const net = require("net");

const ALLOWED_RESOURCE_TYPES = new Set(["image", "font", "stylesheet"]);
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;
const MAX_FETCHES_PER_DOCUMENT = 50;
// All remote files of one document together, so buffered responses cannot
// add up to more memory than this however many load at once.
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
// A fixed, generic browser identity: enough for font services to answer with
// modern formats, without telling a remote server which Chrome this host runs.
const FETCH_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Every range that is not the public internet: private, loopback, link-local
// (which holds the cloud metadata address 169.254.169.254), CGNAT, multicast,
// and the reserved and documentation blocks.
const NON_PUBLIC_SUBNETS = [
  ["0.0.0.0", 8, "ipv4"],
  ["10.0.0.0", 8, "ipv4"],
  ["100.64.0.0", 10, "ipv4"],
  ["127.0.0.0", 8, "ipv4"],
  ["169.254.0.0", 16, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.0.0.0", 24, "ipv4"],
  ["192.0.2.0", 24, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["198.18.0.0", 15, "ipv4"],
  ["198.51.100.0", 24, "ipv4"],
  ["203.0.113.0", 24, "ipv4"],
  ["224.0.0.0", 3, "ipv4"],
  // IPv6 is allowed only inside global unicast space (2000::/3, checked
  // separately), so loopback, NAT64, unique-local, link-local, site-local,
  // and multicast are refused without being listed. These are the special
  // blocks that sit inside 2000::/3.
  ["2001::", 23, "ipv6"], // IETF protocol assignments, Teredo, benchmarking
  ["2001:db8::", 32, "ipv6"], // documentation
  ["2002::", 16, "ipv6"], // 6to4, which wraps an arbitrary IPv4 address
  ["3fff::", 20, "ipv6"], // documentation
];

class RequestGuard {
  constructor(allowedFileUrl, options = {}) {
    this.allowedFileUrl = new URL(allowedFileUrl).href;
    this.lookup = options.lookup || ((hostname) => dns.promises.lookup(hostname, { all: true }));
    this.maxFetches = options.maxFetches || MAX_FETCHES_PER_DOCUMENT;
    this.maxTotalBytes = options.maxTotalBytes || MAX_TOTAL_BYTES;
    this.fetchCount = 0;
    this.totalBytes = 0;

    this.blockList = new net.BlockList();
    for (const [address, prefix, family] of NON_PUBLIC_SUBNETS) {
      this.blockList.addSubnet(address, prefix, family);
    }
    this.globalUnicast = new net.BlockList();
    this.globalUnicast.addSubnet("2000::", 3, "ipv6");
  }

  /**
   * "allow" lets Chrome load it, "fetch" means this class fetches it on
   * Chrome's behalf, and "deny" aborts it.
   */
  classify(url, resourceType) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return "deny";
    }

    if (parsed.protocol === "data:") return "allow";
    if (parsed.protocol === "file:") return parsed.href === this.allowedFileUrl ? "allow" : "deny";
    if (parsed.protocol !== "https:") return "deny";
    if (parsed.port !== "" || parsed.username !== "" || parsed.password !== "") return "deny";
    if (!ALLOWED_RESOURCE_TYPES.has(resourceType)) return "deny";
    return "fetch";
  }

  isPublicAddress(address) {
    // An IPv4 address wrapped in IPv6 is judged as the IPv4 address it is.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    const bare = mapped ? mapped[1] : address;

    if (net.isIPv4(bare)) return !this.blockList.check(bare, "ipv4");
    if (net.isIPv6(bare)) {
      // The hex form of a mapped address (::ffff:7f00:1) is refused outright.
      if (/^::ffff:/i.test(bare)) return false;
      return this.globalUnicast.check(bare, "ipv6") && !this.blockList.check(bare, "ipv6");
    }
    return false;
  }

  /**
   * Resolves a hostname and returns one address to connect to, or null when
   * any of its addresses is not public.
   */
  async resolvePublic(hostname) {
    const bare = hostname.replace(/^\[|\]$/g, "");
    let addresses;
    try {
      addresses = await this.lookup(bare);
    } catch (e) {
      return null;
    }
    if (!Array.isArray(addresses) || addresses.length === 0) return null;
    if (!addresses.every((entry) => this.isPublicAddress(entry.address))) return null;
    return addresses[0];
  }

  /**
   * GETs one https URL from a pinned address. Resolves with
   * { status, headers, body }; never follows a redirect itself.
   */
  requestOnce(parsed, pinned, requestHeaders) {
    return new Promise((resolve, reject) => {
      const family = pinned.family || (net.isIPv6(pinned.address) ? 6 : 4);
      const request = https.get(
        {
          host: parsed.hostname.replace(/^\[|\]$/g, ""),
          servername: net.isIP(parsed.hostname.replace(/^\[|\]$/g, "")) ? undefined : parsed.hostname,
          port: 443,
          path: parsed.pathname + parsed.search,
          headers: requestHeaders,
          timeout: FETCH_TIMEOUT_MS,
          // Connect to the address that was checked, whatever DNS says now.
          lookup: (_hostname, options, callback) => {
            if (options && options.all) {
              callback(null, [{ address: pinned.address, family }]);
            } else {
              callback(null, pinned.address, family);
            }
          },
        },
        (response) => {
          const chunks = [];
          let size = 0;
          response.on("data", (chunk) => {
            size += chunk.length;
            this.totalBytes += chunk.length;
            if (size > MAX_RESPONSE_BYTES || this.totalBytes > this.maxTotalBytes) {
              request.destroy(new Error("Response too large"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) });
          });
          response.on("error", reject);
        }
      );
      request.on("timeout", () => request.destroy(new Error("Request timed out")));
      request.on("error", reject);
    });
  }

  /**
   * Fetches a URL for Chrome, re-checking every redirect hop. Resolves with
   * { status, contentType, body }, or null when the URL or a hop is refused.
   */
  async fetch(url, resourceType, chromeHeaders = {}) {
    if (this.fetchCount >= this.maxFetches) return null;
    this.fetchCount++;

    if (this.totalBytes >= this.maxTotalBytes) return null;
    const requestHeaders = { accept: chromeHeaders.accept || "*/*", "user-agent": FETCH_USER_AGENT };

    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (this.classify(current, resourceType) !== "fetch") return null;
      const parsed = new URL(current);
      const pinned = await this.resolvePublic(parsed.hostname);
      if (!pinned) return null;

      const response = await this.requestOnce(parsed, pinned, requestHeaders);
      const location = response.headers.location;
      if (response.status >= 300 && response.status < 400 && location) {
        current = new URL(location, current).href;
        continue;
      }
      return {
        status: response.status,
        contentType: response.headers["content-type"] || "application/octet-stream",
        body: response.body,
      };
    }
    return null;
  }

  /**
   * Puppeteer `request` event handler. Always settles the request, so a
   * refused or failed load can never leave the page hanging.
   */
  async handle(request) {
    try {
      const verdict = this.classify(request.url(), request.resourceType());
      if (verdict === "allow") {
        await request.continue();
        return;
      }
      if (verdict === "fetch") {
        const fetched = await this.fetch(request.url(), request.resourceType(), request.headers());
        if (fetched) {
          await request.respond({
            status: fetched.status,
            headers: { "content-type": fetched.contentType, "access-control-allow-origin": "*" },
            body: fetched.body,
          });
          return;
        }
      }
      await request.abort("blockedbyclient");
    } catch (e) {
      try {
        await request.abort("failed");
      } catch (abortError) {
        // The request was already settled or the page is gone.
      }
    }
  }
}

module.exports = RequestGuard;
