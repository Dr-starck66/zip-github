import express from "express";
import { chromium } from "playwright";
import dns from "node:dns/promises";
import net from "node:net";
import crypto from "node:crypto";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.PORT || 3000);
const API_TOKEN = process.env.API_TOKEN || "";
const MAX_CONCURRENT = Math.max(1, Math.min(4, Number(process.env.MAX_CONCURRENT || 2)));
const SESSION_TTL_MS = Math.max(60_000, Number(process.env.SESSION_TTL_MS || 30 * 60_000));
const MAX_SESSIONS = Math.max(1, Math.min(10, Number(process.env.MAX_SESSIONS || 4)));

let browser;
let active = 0;
const queue = [];
const sessions = new Map();
const dnsCache = new Map();

function sendError(res, status, code, message, details) {
  res.status(status).json({ ok: false, error: { code, message, details } });
}

function auth(req, res, next) {
  if (req.path === "/health") return next();
  if (!API_TOKEN) return sendError(res, 503, "TOKEN_NOT_CONFIGURED", "API_TOKEN is not configured");
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const header = req.headers["x-api-key"];
  if (bearer !== API_TOKEN && header !== API_TOKEN) {
    return sendError(res, 401, "UNAUTHORIZED", "Missing or invalid API token");
  }
  next();
}
app.use(auth);

function parseIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return p;
}
function isBlockedIPv4(ip) {
  const p = parseIPv4(ip);
  if (!p) return true;
  const [a,b,c] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}
function isBlockedIPv6(ip) {
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") ||
    /^fe[89ab]/.test(x) || x.startsWith("2001:db8:");
}
function isBlockedIP(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true;
}

async function resolveHost(hostname) {
  const cached = dnsCache.get(hostname);
  if (cached && cached.expires > Date.now()) return cached.addresses;
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  const addresses = records.map(r => r.address);
  dnsCache.set(hostname, { addresses, expires: Date.now() + 60_000 });
  return addresses;
}

async function assertSafeUrl(value) {
  let u;
  try { u = new URL(value); } catch { throw new Error("Invalid URL"); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http/https URLs are allowed");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "metadata.google.internal") {
    throw new Error("Local/private hosts are blocked");
  }
  if (net.isIP(h)) {
    if (isBlockedIP(h)) throw new Error("Private/reserved IP is blocked");
  } else {
    const addresses = await resolveHost(h);
    if (!addresses.length || addresses.some(isBlockedIP)) throw new Error("Host resolves to a private/reserved IP");
  }
  return u.toString();
}

async function acquire() {
  if (active < MAX_CONCURRENT) { active++; return; }
  await new Promise(resolve => queue.push(resolve));
  active++;
}
function release() {
  active = Math.max(0, active - 1);
  queue.shift()?.();
}

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"]
    });
  }
  return browser;
}

async function guardContext(context) {
  await context.route("**/*", async route => {
    const url = route.request().url();
    if (!/^https?:/i.test(url)) return route.continue();
    try {
      await assertSafeUrl(url);
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}

async function newContext(storageState) {
  const b = await getBrowser();
  const context = await b.newContext({
    storageState: storageState || undefined,
    viewport: { width: 1440, height: 1000 },
    userAgent: process.env.USER_AGENT || undefined
  });
  await guardContext(context);
  return context;
}

function touchSession(s) { s.lastUsed = Date.now(); }

async function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.lastUsed > SESSION_TTL_MS) {
    await s.context.close().catch(() => {});
    sessions.delete(id);
    return null;
  }
  touchSession(s);
  return s;
}

async function withPage(sessionId, fn) {
  await acquire();
  let context, ephemeral = false;
  try {
    if (sessionId) {
      const s = await getSession(sessionId);
      if (!s) throw Object.assign(new Error("Unknown or expired session"), { status: 404, code: "SESSION_NOT_FOUND" });
      context = s.context;
    } else {
      context = await newContext();
      ephemeral = true;
    }
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    try { return await fn(page, context); }
    finally { await page.close().catch(() => {}); }
  } finally {
    if (ephemeral && context) await context.close().catch(() => {});
    release();
  }
}

function locatorFor(page, action) {
  if (action.selector) return page.locator(action.selector).first();
  if (action.label) return page.getByLabel(action.label, { exact: !!action.exact }).first();
  if (action.role) return page.getByRole(action.role, { name: action.name, exact: !!action.exact }).first();
  if (action.text) return page.getByText(action.text, { exact: !!action.exact }).first();
  throw new Error("Action needs selector, label, role/name, or text");
}

async function pagePayload(page, opts = {}) {
  const maxChars = Math.max(1_000, Math.min(500_000, Number(opts.maxChars || 120_000)));
  const includeHtml = opts.html !== false;
  const includeText = opts.text !== false;
  const includeLinks = opts.links !== false;
  const out = {
    url: page.url(),
    title: await page.title().catch(() => ""),
    status: null
  };
  if (includeHtml) out.html = (await page.content()).slice(0, maxChars);
  if (includeText) out.text = (await page.locator("body").innerText().catch(() => "")).slice(0, maxChars);
  if (includeLinks) {
    out.links = await page.locator("a[href]").evaluateAll(as => as.slice(0, 500).map(a => ({
      text: (a.textContent || "").trim().slice(0, 300),
      href: a.href
    }))).catch(() => []);
  }
  out.meta = await page.evaluate(() => ({
    description: document.querySelector('meta[name="description"]')?.content || null,
    robots: document.querySelector('meta[name="robots"]')?.content || null,
    canonical: document.querySelector('link[rel="canonical"]')?.href || null,
    h1: Array.from(document.querySelectorAll("h1")).slice(0, 10).map(x => (x.textContent || "").trim())
  })).catch(() => ({}));
  return out;
}

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "ASTRA CRAWL",
    version: "1.0.0",
    browser: browser?.isConnected() ? "ready" : "cold",
    sessions: sessions.size,
    active,
    queued: queue.length
  });
});

app.post("/scrape", async (req, res) => {
  try {
    const url = await assertSafeUrl(req.body?.url);
    const waitUntil = ["load","domcontentloaded","networkidle","commit"].includes(req.body?.waitUntil) ? req.body.waitUntil : "domcontentloaded";
    const timeout = Math.max(1_000, Math.min(120_000, Number(req.body?.timeout || 45_000)));
    const data = await withPage(req.body?.sessionId, async page => {
      const response = await page.goto(url, { waitUntil, timeout });
      const payload = await pagePayload(page, req.body || {});
      payload.status = response?.status() ?? null;
      return payload;
    });
    res.json({ ok: true, data });
  } catch (e) {
    sendError(res, e.status || 400, e.code || "SCRAPE_FAILED", e.message);
  }
});

app.post("/screenshot", async (req, res) => {
  try {
    const url = await assertSafeUrl(req.body?.url);
    const data = await withPage(req.body?.sessionId, async page => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const format = req.body?.format === "jpeg" ? "jpeg" : "png";
      const buffer = await page.screenshot({
        fullPage: req.body?.fullPage !== false,
        type: format,
        quality: format === "jpeg" ? Math.max(20, Math.min(100, Number(req.body?.quality || 80))) : undefined
      });
      return {
        url: page.url(),
        title: await page.title(),
        mime: format === "jpeg" ? "image/jpeg" : "image/png",
        base64: buffer.toString("base64")
      };
    });
    res.json({ ok: true, data });
  } catch (e) {
    sendError(res, e.status || 400, e.code || "SCREENSHOT_FAILED", e.message);
  }
});

app.post("/session", async (req, res) => {
  try {
    if (sessions.size >= MAX_SESSIONS) return sendError(res, 429, "SESSION_LIMIT", "Maximum persistent sessions reached");
    const context = await newContext(req.body?.storageState);
    const id = crypto.randomUUID();
    sessions.set(id, { context, createdAt: Date.now(), lastUsed: Date.now() });
    res.status(201).json({ ok: true, data: { sessionId: id, expiresInMs: SESSION_TTL_MS } });
  } catch (e) {
    sendError(res, 400, "SESSION_CREATE_FAILED", e.message);
  }
});

app.get("/session/:id/state", async (req, res) => {
  try {
    const s = await getSession(req.params.id);
    if (!s) return sendError(res, 404, "SESSION_NOT_FOUND", "Unknown or expired session");
    const storageState = await s.context.storageState();
    res.json({ ok: true, data: { sessionId: req.params.id, storageState } });
  } catch (e) {
    sendError(res, 400, "SESSION_STATE_FAILED", e.message);
  }
});

app.delete("/session/:id", async (req, res) => {
  const s = sessions.get(req.params.id);
  if (s) await s.context.close().catch(() => {});
  sessions.delete(req.params.id);
  res.json({ ok: true });
});

app.post("/interact", async (req, res) => {
  try {
    const actions = Array.isArray(req.body?.actions) ? req.body.actions.slice(0, 100) : [];
    const data = await withPage(req.body?.sessionId, async page => {
      if (req.body?.url) {
        const url = await assertSafeUrl(req.body.url);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      }
      const results = [];
      for (const action of actions) {
        const type = action?.type;
        if (type === "goto") {
          const url = await assertSafeUrl(action.url);
          const response = await page.goto(url, { waitUntil: action.waitUntil || "domcontentloaded", timeout: Math.min(120_000, action.timeout || 45_000) });
          results.push({ type, url: page.url(), status: response?.status() ?? null });
        } else if (type === "click") {
          await locatorFor(page, action).click({ timeout: action.timeout || 30_000 });
          results.push({ type, ok: true });
        } else if (type === "fill") {
          await locatorFor(page, action).fill(String(action.value ?? ""));
          results.push({ type, ok: true });
        } else if (type === "type") {
          await locatorFor(page, action).pressSequentially(String(action.value ?? ""), { delay: Math.min(500, Math.max(0, Number(action.delay || 0))) });
          results.push({ type, ok: true });
        } else if (type === "press") {
          await locatorFor(page, action).press(String(action.key || "Enter"));
          results.push({ type, ok: true });
        } else if (type === "select") {
          const selected = await locatorFor(page, action).selectOption(action.value);
          results.push({ type, selected });
        } else if (type === "check") {
          await locatorFor(page, action).check();
          results.push({ type, ok: true });
        } else if (type === "uncheck") {
          await locatorFor(page, action).uncheck();
          results.push({ type, ok: true });
        } else if (type === "hover") {
          await locatorFor(page, action).hover();
          results.push({ type, ok: true });
        } else if (type === "wait") {
          if (action.ms != null) await page.waitForTimeout(Math.min(30_000, Math.max(0, Number(action.ms))));
          else await locatorFor(page, action).waitFor({ state: action.state || "visible", timeout: action.timeout || 30_000 });
          results.push({ type, ok: true });
        } else if (type === "scroll") {
          await page.mouse.wheel(Number(action.x || 0), Number(action.y || 700));
          results.push({ type, ok: true });
        } else {
          throw new Error(`Unsupported action type: ${type}`);
        }
      }
      const payload = await pagePayload(page, req.body?.return || {});
      payload.actions = results;
      if (req.body?.return?.screenshot) {
        const image = await page.screenshot({ fullPage: !!req.body.return.fullPage });
        payload.screenshot = { mime: "image/png", base64: image.toString("base64") };
      }
      return payload;
    });
    res.json({ ok: true, data });
  } catch (e) {
    sendError(res, e.status || 400, e.code || "INTERACT_FAILED", e.message);
  }
});

app.get("/docs", (_req, res) => {
  res.type("text/plain").send(`ASTRA CRAWL 1.0

Auth: Authorization: Bearer <API_TOKEN>  (or x-api-key)

GET  /health
POST /scrape       {"url":"https://example.com"}
POST /screenshot   {"url":"https://example.com","fullPage":true}
POST /session      {"storageState": optionalPlaywrightStorageState}
GET  /session/:id/state
DELETE /session/:id
POST /interact     {"sessionId":"...","url":"https://example.com","actions":[...]}

Interact action types:
goto, click, fill, type, press, select, check, uncheck, hover, wait, scroll

Locator fields:
selector OR label OR role+name OR text
`);
});

setInterval(async () => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) {
    if (s.lastUsed < cutoff) {
      await s.context.close().catch(() => {});
      sessions.delete(id);
    }
  }
}, 60_000).unref();

async function shutdown() {
  for (const [, s] of sessions) await s.context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ASTRA CRAWL listening on :${PORT}`);
});
