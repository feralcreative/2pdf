const crypto = require("crypto");
const GoogleAuth = require("../web/auth");

const { AuthError } = GoogleAuth;
const CLIENT_ID = "client-123.apps.googleusercontent.com";
const NOW = 1800000000000;

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "key-1", use: "sig", alg: "RS256" };

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function sign(claims, { key = privateKey, header = { alg: "RS256", kid: "key-1", typ: "JWT" } } = {}) {
  const input = `${encode(header)}.${encode(claims)}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(input), key).toString("base64url");
  return `${input}.${signature}`;
}

const goodClaims = (overrides = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  sub: "1234567890",
  email: "Person@Example.com",
  email_verified: true,
  hd: "example.com",
  name: "A Person",
  iat: NOW / 1000 - 10,
  exp: NOW / 1000 + 3600,
  ...overrides,
});

function makeAuth(options = {}) {
  return new GoogleAuth({
    clientId: CLIENT_ID,
    allowedDomains: ["example.com"],
    fetchKeys: jest.fn().mockResolvedValue({ keys: [jwk], ttlMs: 3600000 }),
    now: () => NOW,
    ...options,
  });
}

describe("GoogleAuth", () => {
  describe("constructor", () => {
    test("should need a client ID and a domain", () => {
      expect(() => new GoogleAuth({ allowedDomains: ["example.com"] })).toThrow();
      expect(() => new GoogleAuth({ clientId: CLIENT_ID, allowedDomains: [] })).toThrow();
    });
  });

  describe("verify", () => {
    test("should accept a valid staff token", async () => {
      await expect(makeAuth().verify(sign(goodClaims()))).resolves.toEqual({
        sub: "1234567890",
        email: "person@example.com",
        name: "A Person",
      });
    });

    test.each([
      ["a wrong audience", { aud: "someone-else.apps.googleusercontent.com" }],
      ["a wrong issuer", { iss: "https://evil.example" }],
      ["an expired token", { exp: NOW / 1000 - 3600 }],
      ["a token from the future", { iat: NOW / 1000 + 3600 }],
      ["an unverified email", { email_verified: false }],
      ["a string email_verified", { email_verified: "true" }],
      ["a personal account with no hd", { hd: undefined, email: "person@gmail.com" }],
      ["another Workspace domain", { hd: "other.com", email: "person@other.com" }],
      ["a staff hd with an outside email", { email: "person@other.com" }],
      ["an outside hd with a staff email", { hd: "other.com" }],
      ["a lookalike domain", { hd: "example.com.evil.io", email: "person@example.com.evil.io" }],
      ["a missing subject", { sub: "" }],
      ["a missing expiry", { exp: undefined }],
    ])("should refuse %s", async (_label, overrides) => {
      await expect(makeAuth().verify(sign(goodClaims(overrides)))).rejects.toBeInstanceOf(AuthError);
    });

    test("should refuse a token signed with another key", async () => {
      await expect(makeAuth().verify(sign(goodClaims(), { key: other.privateKey }))).rejects.toThrow(/signature/);
    });

    test("should refuse a tampered payload", async () => {
      const [header, , signature] = sign(goodClaims()).split(".");
      const forged = `${header}.${encode(goodClaims({ email: "boss@example.com" }))}.${signature}`;
      await expect(makeAuth().verify(forged)).rejects.toThrow(/signature/);
    });

    test("should refuse the none algorithm and HMAC", async () => {
      const unsigned = `${encode({ alg: "none", kid: "key-1" })}.${encode(goodClaims())}.AAAA`;
      await expect(makeAuth().verify(unsigned)).rejects.toThrow(/algorithm/);

      // The classic confusion attack: HS256 keyed with the public key.
      const header = encode({ alg: "HS256", kid: "key-1" });
      const input = `${header}.${encode(goodClaims())}`;
      const mac = crypto
        .createHmac("sha256", publicKey.export({ type: "spki", format: "pem" }))
        .update(input)
        .digest("base64url");
      await expect(makeAuth().verify(`${input}.${mac}`)).rejects.toThrow(/algorithm/);
    });

    test("should refuse malformed, empty, and oversized tokens", async () => {
      const auth = makeAuth();
      for (const token of ["", "abc", "a.b", "a.b.c.d", "!!.??.**", undefined, null, 42, "a".repeat(9000)]) {
        await expect(auth.verify(token)).rejects.toBeInstanceOf(AuthError);
      }
      await expect(auth.verify(`${encode([1])}.${encode(goodClaims())}.AAAA`)).rejects.toBeInstanceOf(AuthError);
    });

    test("should refuse an unknown key and not refetch on every request", async () => {
      const auth = makeAuth();
      const token = sign(goodClaims(), { header: { alg: "RS256", kid: "key-unknown" } });
      await expect(auth.verify(token)).rejects.toThrow(/Unknown signing key/);
      await expect(auth.verify(token)).rejects.toThrow(/Unknown signing key/);
      expect(auth.fetchKeys).toHaveBeenCalledTimes(1);
    });

    test("should ignore keys that are not for signing", async () => {
      const auth = makeAuth({ fetchKeys: jest.fn().mockResolvedValue({ keys: [{ ...jwk, use: "enc" }], ttlMs: 1000 }) });
      await expect(auth.verify(sign(goodClaims()))).rejects.toThrow(/Unknown signing key/);
    });

    test("should fail closed when the keys cannot be fetched, without retrying per request", async () => {
      const auth = makeAuth({ fetchKeys: jest.fn().mockRejectedValue(new Error("offline")) });
      await expect(auth.verify(sign(goodClaims()))).rejects.toBeInstanceOf(AuthError);
      await expect(auth.verify(sign(goodClaims()))).rejects.toBeInstanceOf(AuthError);
      expect(auth.fetchKeys).toHaveBeenCalledTimes(1);
    });

    test("should never use keys past their lifetime", async () => {
      let now = NOW;
      const fetchKeys = jest
        .fn()
        .mockResolvedValueOnce({ keys: [jwk], ttlMs: 1000 })
        .mockRejectedValue(new Error("offline"));
      const auth = makeAuth({ fetchKeys, now: () => now });
      await expect(auth.verify(sign(goodClaims()))).resolves.toBeTruthy();
      now += 120000;
      await expect(auth.verify(sign(goodClaims()))).rejects.toBeInstanceOf(AuthError);
    });

    test("should fetch keys once for simultaneous requests", async () => {
      const auth = makeAuth();
      await Promise.all([auth.verify(sign(goodClaims())), auth.verify(sign(goodClaims()))]);
      expect(auth.fetchKeys).toHaveBeenCalledTimes(1);
    });

    test("should enforce the subject allowlist when one is set", async () => {
      const allowed = makeAuth({ allowedSubs: ["1234567890"] });
      const denied = makeAuth({ allowedSubs: ["999"] });
      await expect(allowed.verify(sign(goodClaims()))).resolves.toBeTruthy();
      await expect(denied.verify(sign(goodClaims()))).rejects.toThrow(/allowlist/);
    });
  });
});
