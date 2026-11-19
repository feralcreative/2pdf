const { createServer, loadSettings } = require("../web/server");
const GoogleAuth = require("../web/auth");
const WebConverter = require("../web/convert");

const baseSettings = { authDisabled: true, clientId: "", maxBodyBytes: 1024, configPath: null };
const fakeConverter = () => ({
  convert: jest.fn().mockResolvedValue({ pdf: Buffer.from("%PDF-1.4 fake"), filename: "Résumé v2.pdf" }),
});
const fakeAuth = {
  verify: async (token) => {
    if (token === "good") return { sub: "sub-1", email: "a@example.com" };
    throw new GoogleAuth.AuthError("nope");
  },
};

describe("web server", () => {
  let server;
  let base;
  let converter;

  async function start(settings = baseSettings, parts = {}) {
    converter = parts.converter || fakeConverter();
    server = createServer(settings, { converter, auth: parts.auth });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }

  const post = (body, { headers = {}, name = "notes.md" } = {}) =>
    fetch(`${base}/api/convert?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "Content-Type": "text/markdown", ...headers },
      body,
    });

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (server) await new Promise((resolve) => server.close(resolve));
    server = null;
  });

  describe("loadSettings", () => {
    test("should need a port", () => {
      expect(() => loadSettings({}, [])).toThrow(/PORT/);
    });

    test("should refuse to start without sign-in settings", () => {
      expect(() => loadSettings({ PORT: "1646" }, [])).toThrow(/GOOGLE_CLIENT_ID/);
      expect(() => loadSettings({ PORT: "1646", GOOGLE_CLIENT_ID: "id" }, [])).toThrow(/ALLOWED_DOMAINS/);
    });

    test("should only turn sign-in off on this machine", () => {
      expect(loadSettings({ PORT: "1646", AUTH_DISABLED: "1" }, []).authDisabled).toBe(true);
      expect(loadSettings({ PORT: "1646" }, ["--dev"]).authDisabled).toBe(true);
      expect(() => loadSettings({ PORT: "1646", AUTH_DISABLED: "1", HOST: "0.0.0.0" }, [])).toThrow(/Refusing/);
    });

    test("should keep sign-in on whenever a client ID is set", () => {
      const settings = loadSettings(
        { PORT: "1646", GOOGLE_CLIENT_ID: "id", ALLOWED_DOMAINS: "a.com, b.com", AUTH_DISABLED: "1" },
        ["--dev"]
      );
      expect(settings.authDisabled).toBe(false);
      expect(settings.allowedDomains).toEqual(["a.com", "b.com"]);
    });
  });

  describe("routes", () => {
    test("should answer the health check and send security headers", async () => {
      await start();
      const response = await fetch(`${base}/healthz`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    });

    test("should serve the drop page and 404 everything else", async () => {
      await start();
      const page = await fetch(`${base}/`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("<title>2pdf</title>");
      expect((await fetch(`${base}/../package.json`)).status).toBe(404);
      expect((await fetch(`${base}/api/convert`)).status).toBe(404);
    });

    test("should survive a request target the URL parser rejects", async () => {
      await start();
      const net = require("net");
      const reply = await new Promise((resolve) => {
        const socket = net.connect(server.address().port, "127.0.0.1", () => {
          socket.write("GET //example.com:99999/ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
        });
        let data = "";
        socket.on("data", (chunk) => (data += chunk));
        socket.on("close", () => resolve(data));
      });
      expect(reply).toMatch(/^HTTP\/1\.1 400/);
      expect((await fetch(`${base}/healthz`)).status).toBe(200);
    });

    test("should report whether sign-in is on", async () => {
      await start({ ...baseSettings, authDisabled: false, clientId: "id" }, { auth: fakeAuth });
      expect(await (await fetch(`${base}/api/config`)).json()).toEqual({ signIn: true, clientId: "id" });
    });
  });

  describe("POST /api/convert", () => {
    test("should return the PDF with a safely encoded file name", async () => {
      await start();
      const response = await post("# Hi");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''R%C3%A9sum%C3%A9%20v2.pdf");
      expect(await response.text()).toBe("%PDF-1.4 fake");
      expect(converter.convert).toHaveBeenCalledWith(Buffer.from("# Hi"), "notes.md");
    });

    test("should refuse other content types, file types, and empty files", async () => {
      await start();
      expect((await post("# Hi", { headers: { "Content-Type": "text/plain" } })).status).toBe(415);
      expect((await post("# Hi", { name: "page.html" })).status).toBe(415);
      expect((await post("")).status).toBe(400);
      expect(converter.convert).not.toHaveBeenCalled();
    });

    test("should refuse a body over the limit", async () => {
      await start();
      expect((await post("x".repeat(2048))).status).toBe(413);
      expect(converter.convert).not.toHaveBeenCalled();
    });

    test("should refuse a request from another site", async () => {
      await start();
      expect((await post("# Hi", { headers: { Origin: "https://evil.example" } })).status).toBe(403);
      expect((await post("# Hi", { headers: { Origin: base } })).status).toBe(200);
    });

    test("should require a valid token when sign-in is on", async () => {
      await start({ ...baseSettings, authDisabled: false, clientId: "id" }, { auth: fakeAuth });
      expect((await post("# Hi")).status).toBe(401);
      expect((await post("# Hi", { headers: { Authorization: "Bearer bad" } })).status).toBe(401);
      expect(converter.convert).not.toHaveBeenCalled();
      expect((await post("# Hi", { headers: { Authorization: "Bearer good" } })).status).toBe(200);
    });

    test("should hide the pipeline's error message", async () => {
      const failing = { convert: jest.fn().mockRejectedValue(new WebConverter.ConversionError("boom at /srv/secret")) };
      await start(baseSettings, { converter: failing });
      const response = await post("# Hi");
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("/srv/secret");
    });

    test("should answer 503 when the queue is full", async () => {
      const full = { convert: jest.fn().mockRejectedValue(new WebConverter.QueueFullError()) };
      await start(baseSettings, { converter: full });
      expect((await post("# Hi")).status).toBe(503);
    });

    test("should limit how many conversions one person has waiting", async () => {
      let release;
      const gate = new Promise((resolve) => (release = resolve));
      const slow = { convert: jest.fn(() => gate.then(() => ({ pdf: Buffer.from("x"), filename: "x.pdf" }))) };
      await start(baseSettings, { converter: slow });
      const first = post("# 1");
      const second = post("# 2");
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect((await post("# 3")).status).toBe(429);
      release();
      expect((await first).status).toBe(200);
      expect((await second).status).toBe(200);
    });
  });
});
