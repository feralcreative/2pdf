/**
 * Google Auth
 *
 * Verifies a Google ID token (the credential Google Identity Services hands
 * the drop page) with Node's crypto and Google's published signing keys, then
 * checks that it belongs to a member of an allowed Workspace domain.
 *
 * The page's own check in web/public/app.js only decides what to show; this
 * file is the gate. Keep the two in step.
 */

const crypto = require("crypto");

const GOOGLE_KEYS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const MAX_TOKEN_LENGTH = 8192;
const CLOCK_SKEW_SECONDS = 60;
const DEFAULT_KEY_TTL_MS = 60 * 60 * 1000;
const MIN_REFETCH_INTERVAL_MS = 60 * 1000;

class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthError";
  }
}

async function fetchGoogleKeys() {
  const response = await fetch(GOOGLE_KEYS_URL, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Google key fetch failed: ${response.status}`);
  const maxAge = /max-age=(\d+)/.exec(response.headers.get("cache-control") || "");
  const body = await response.json();
  return { keys: body.keys || [], ttlMs: maxAge ? Number(maxAge[1]) * 1000 : DEFAULT_KEY_TTL_MS };
}

class GoogleAuth {
  constructor(options = {}) {
    if (!options.clientId) throw new Error("GoogleAuth needs a clientId");
    this.clientId = options.clientId;
    this.allowedDomains = new Set((options.allowedDomains || []).map((domain) => domain.toLowerCase()));
    if (this.allowedDomains.size === 0) throw new Error("GoogleAuth needs at least one allowed domain");
    this.allowedSubs = options.allowedSubs && options.allowedSubs.length ? new Set(options.allowedSubs) : null;
    this.fetchKeys = options.fetchKeys || fetchGoogleKeys;
    this.now = options.now || (() => Date.now());

    this.keys = new Map();
    this.keysExpireAt = 0;
    this.lastFetchAt = 0;
    this.loading = null;
  }

  // One fetch at a time, however many requests are waiting on it.
  loadKeys() {
    if (!this.loading) {
      this.loading = this.loadKeysNow().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  async loadKeysNow() {
    const { keys, ttlMs } = await this.fetchKeys();
    // Signing keys only: RSA, for signatures, and RS256 where the key says.
    const usable = (Array.isArray(keys) ? keys : []).filter(
      (key) =>
        key &&
        typeof key.kid === "string" &&
        key.kty === "RSA" &&
        (key.use === undefined || key.use === "sig") &&
        (key.alg === undefined || key.alg === "RS256")
    );
    this.keys = new Map(usable.map((key) => [key.kid, key]));
    this.lastFetchAt = this.now();
    this.keysExpireAt = this.lastFetchAt + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_KEY_TTL_MS);
  }

  /**
   * Returns the signing key for a key ID, refreshing the cached set when it
   * has expired or (at most once a minute) when the ID is unknown.
   */
  async keyFor(kid) {
    const expired = this.now() >= this.keysExpireAt;
    const mayRefetch = this.now() - this.lastFetchAt >= MIN_REFETCH_INTERVAL_MS;
    if (expired || !this.keys.has(kid)) {
      if (this.loading) {
        // Another request is already fetching; share its result.
        await this.loading;
      } else if (mayRefetch) {
        // Stamp the attempt first, so a failing fetch is not retried per request.
        this.lastFetchAt = this.now();
        await this.loadKeys();
      }
    }
    // Keys past their lifetime are never used, even when the refresh failed.
    if (this.now() >= this.keysExpireAt) return null;
    return this.keys.get(kid) || null;
  }

  decodeSegment(segment) {
    const value = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Not an object");
    return value;
  }

  /**
   * Resolves with { sub, email, name } for a valid staff token and throws
   * AuthError for anything else.
   */
  async verify(token) {
    if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
      throw new AuthError("Missing or oversized token");
    }
    const parts = token.split(".");
    // Node's base64url decoder skips characters it does not know; refuse them here.
    if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
      throw new AuthError("Malformed token");
    }

    let header;
    let claims;
    try {
      header = this.decodeSegment(parts[0]);
      claims = this.decodeSegment(parts[1]);
    } catch (e) {
      throw new AuthError("Malformed token");
    }

    // RS256 only: never let the token choose a weaker or keyless algorithm.
    if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid === "") {
      throw new AuthError("Unsupported token algorithm");
    }

    let jwk;
    try {
      jwk = await this.keyFor(header.kid);
    } catch (e) {
      throw new AuthError("Could not load Google signing keys");
    }
    if (!jwk) throw new AuthError("Unknown signing key");

    let signatureValid = false;
    try {
      const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
      signatureValid = crypto.verify(
        "RSA-SHA256",
        Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"),
        publicKey,
        Buffer.from(parts[2], "base64url")
      );
    } catch (e) {
      signatureValid = false;
    }
    if (!signatureValid) throw new AuthError("Bad token signature");

    const nowSeconds = Math.floor(this.now() / 1000);
    if (!GOOGLE_ISSUERS.has(claims.iss)) throw new AuthError("Wrong issuer");
    if (claims.aud !== this.clientId) throw new AuthError("Wrong audience");
    if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS <= nowSeconds) {
      throw new AuthError("Token expired");
    }
    if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) {
      throw new AuthError("Token not yet valid");
    }
    if (typeof claims.sub !== "string" || claims.sub === "") throw new AuthError("Token has no subject");
    if (claims.email_verified !== true) throw new AuthError("Email not verified");

    // Both the Workspace domain claim and the address must be on a staff
    // domain. `hd` is absent on personal Gmail accounts, which fails here.
    const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
    const emailDomain = email.includes("@") ? email.slice(email.lastIndexOf("@") + 1) : "";
    const hostedDomain = typeof claims.hd === "string" ? claims.hd.toLowerCase() : "";
    if (!this.allowedDomains.has(hostedDomain) || !this.allowedDomains.has(emailDomain)) {
      throw new AuthError("Not a staff account");
    }

    // People are keyed by Google's stable subject ID, never by email.
    if (this.allowedSubs && !this.allowedSubs.has(claims.sub)) {
      throw new AuthError("Not on the allowlist");
    }

    return { sub: claims.sub, email, name: typeof claims.name === "string" ? claims.name : "" };
  }
}

module.exports = GoogleAuth;
module.exports.AuthError = AuthError;
