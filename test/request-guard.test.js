const RequestGuard = require("../src/request-guard");

const ALLOWED = "file:///tmp/2pdf-1/styled.html";
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("RequestGuard", () => {
  describe("classify", () => {
    const guard = new RequestGuard(ALLOWED, { lookup: publicLookup });

    test("should allow the rendered HTML file and nothing else on disk", () => {
      expect(guard.classify(ALLOWED, "document")).toBe("allow");
      expect(guard.classify("file:///etc/passwd", "image")).toBe("deny");
      expect(guard.classify("file:///tmp/2pdf-1/../../etc/passwd", "image")).toBe("deny");
      expect(guard.classify("file:///tmp/2pdf-1/other.html", "document")).toBe("deny");
    });

    test("should allow data URLs", () => {
      expect(guard.classify("data:image/png;base64,AAAA", "image")).toBe("allow");
    });

    test("should fetch https images, fonts, and stylesheets", () => {
      expect(guard.classify("https://example.com/a.png", "image")).toBe("fetch");
      expect(guard.classify("https://fonts.gstatic.com/s/inter.woff2", "font")).toBe("fetch");
      expect(guard.classify("https://fonts.googleapis.com/css2?family=Inter", "stylesheet")).toBe("fetch");
    });

    test("should deny https for scripts, frames, and fetches", () => {
      expect(guard.classify("https://example.com/a.js", "script")).toBe("deny");
      expect(guard.classify("https://example.com/", "document")).toBe("deny");
      expect(guard.classify("https://example.com/api", "fetch")).toBe("deny");
      expect(guard.classify("https://example.com/api", "xhr")).toBe("deny");
    });

    test("should deny plain http, other schemes, ports, and credentials", () => {
      expect(guard.classify("http://example.com/a.png", "image")).toBe("deny");
      expect(guard.classify("ftp://example.com/a.png", "image")).toBe("deny");
      expect(guard.classify("blob:null/1234", "image")).toBe("deny");
      expect(guard.classify("https://example.com:8443/a.png", "image")).toBe("deny");
      expect(guard.classify("https://user:pw@example.com/a.png", "image")).toBe("deny");
      expect(guard.classify("not a url", "image")).toBe("deny");
    });
  });

  describe("isPublicAddress", () => {
    const guard = new RequestGuard(ALLOWED, { lookup: publicLookup });

    test("should accept public addresses", () => {
      expect(guard.isPublicAddress("93.184.216.34")).toBe(true);
      expect(guard.isPublicAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
    });

    test("should reject private, loopback, link-local, and metadata addresses", () => {
      for (const address of [
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.1",
        "192.168.1.4",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "::1",
        "::",
        "fc00::1",
        "fe80::1",
        "::ffff:127.0.0.1",
        "::ffff:7f00:1",
        "64:ff9b::a00:1",
        "64:ff9b:1::a00:1",
        "100::1",
        "2001:2::1",
        "2001:db8::1",
        "2002:a00:1::1",
        "3fff::1",
        "5f00::1",
        "fec0::1",
        "ff02::1",
        "not-an-address",
      ]) {
        expect(guard.isPublicAddress(address)).toBe(false);
      }
    });
  });

  describe("resolvePublic", () => {
    test("should return an address when every address is public", async () => {
      const guard = new RequestGuard(ALLOWED, { lookup: publicLookup });
      expect(await guard.resolvePublic("example.com")).toEqual({ address: "93.184.216.34", family: 4 });
    });

    test("should refuse a host with any private address", async () => {
      const guard = new RequestGuard(ALLOWED, {
        lookup: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.5", family: 4 },
        ],
      });
      expect(await guard.resolvePublic("rebind.example")).toBeNull();
    });

    test("should refuse when the lookup fails or is empty", async () => {
      const failing = new RequestGuard(ALLOWED, {
        lookup: async () => {
          throw new Error("ENOTFOUND");
        },
      });
      const empty = new RequestGuard(ALLOWED, { lookup: async () => [] });
      expect(await failing.resolvePublic("nope.example")).toBeNull();
      expect(await empty.resolvePublic("nope.example")).toBeNull();
    });
  });

  describe("fetch", () => {
    test("should refuse a private host without connecting", async () => {
      const guard = new RequestGuard(ALLOWED, { lookup: async () => [{ address: "127.0.0.1", family: 4 }] });
      guard.requestOnce = jest.fn();
      expect(await guard.fetch("https://internal.example/a.png", "image")).toBeNull();
      expect(guard.requestOnce).not.toHaveBeenCalled();
    });

    test("should re-check every redirect hop", async () => {
      const guard = new RequestGuard(ALLOWED, { lookup: publicLookup });
      guard.requestOnce = jest.fn().mockResolvedValue({
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
        body: Buffer.alloc(0),
      });
      expect(await guard.fetch("https://example.com/a.png", "image")).toBeNull();
      expect(guard.requestOnce).toHaveBeenCalledTimes(1);
    });

    test("should return the body of a successful fetch", async () => {
      const guard = new RequestGuard(ALLOWED, { lookup: publicLookup });
      guard.requestOnce = jest.fn().mockResolvedValue({
        status: 200,
        headers: { "content-type": "image/png" },
        body: Buffer.from("png"),
      });
      expect(await guard.fetch("https://example.com/a.png", "image")).toEqual({
        status: 200,
        contentType: "image/png",
        body: Buffer.from("png"),
      });
    });

    test("should send a fixed user agent, not Chrome's", async () => {
      const guard = new RequestGuard(ALLOWED, { lookup: publicLookup });
      guard.requestOnce = jest.fn().mockResolvedValue({ status: 200, headers: {}, body: Buffer.alloc(0) });
      await guard.fetch("https://example.com/a.png", "image", { "user-agent": "HeadlessChrome/999" });
      expect(guard.requestOnce.mock.calls[0][2]["user-agent"]).not.toContain("999");
    });

    test("should stop once the document's byte budget is spent", async () => {
      const guard = new RequestGuard(ALLOWED, { lookup: publicLookup, maxTotalBytes: 10 });
      guard.requestOnce = jest.fn();
      guard.totalBytes = 10;
      expect(await guard.fetch("https://example.com/a.png", "image")).toBeNull();
      expect(guard.requestOnce).not.toHaveBeenCalled();
    });

    test("should stop after the per-document fetch limit", async () => {
      const guard = new RequestGuard(ALLOWED, { lookup: publicLookup, maxFetches: 1 });
      guard.requestOnce = jest.fn().mockResolvedValue({ status: 200, headers: {}, body: Buffer.alloc(0) });
      expect(await guard.fetch("https://example.com/1.png", "image")).not.toBeNull();
      expect(await guard.fetch("https://example.com/2.png", "image")).toBeNull();
    });
  });

  describe("handle", () => {
    const fakeRequest = (url, type) => ({
      url: () => url,
      resourceType: () => type,
      headers: () => ({}),
      continue: jest.fn().mockResolvedValue(),
      respond: jest.fn().mockResolvedValue(),
      abort: jest.fn().mockResolvedValue(),
    });

    test("should continue the rendered file and abort other files", async () => {
      const guard = new RequestGuard(ALLOWED, { lookup: publicLookup });
      const ok = fakeRequest(ALLOWED, "document");
      const bad = fakeRequest("file:///etc/passwd", "image");
      await guard.handle(ok);
      await guard.handle(bad);
      expect(ok.continue).toHaveBeenCalled();
      expect(bad.abort).toHaveBeenCalledWith("blockedbyclient");
    });

    test("should abort when the fetch throws", async () => {
      const guard = new RequestGuard(ALLOWED, { lookup: publicLookup });
      guard.fetch = jest.fn().mockRejectedValue(new Error("boom"));
      const request = fakeRequest("https://example.com/a.png", "image");
      await guard.handle(request);
      expect(request.abort).toHaveBeenCalledWith("failed");
    });
  });
});
