#!/usr/bin/env node
import process from "node:process";

const base = String(process.env.ASTRA_PUBLIC_BASE || "https://betgpt.live").replace(/\/$/, "");
const expectedSha = String(process.env.ASTRA_EXPECTED_SHA || "").trim().toLowerCase();
const timeoutMs = Number(process.env.ASTRA_HTTP_TIMEOUT_MS || 10000);

if (!/^[a-f0-9]{40}$/.test(expectedSha)) {
  throw new Error("ASTRA_POSTFLIGHT_BLOCKED: ASTRA_EXPECTED_SHA must be a 40-char commit SHA");
}

async function request(path, accept = "*/*") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      redirect: "follow",
      headers: {
        "User-Agent": "ASTRA-Release-Control-Plane/1.0",
        Accept: accept,
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });
    const body = await res.text();
    return {
      path,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type") || "",
      finalUrl: res.url,
      body,
    };
  } finally {
    clearTimeout(timer);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASTRA_POSTFLIGHT_FAIL: ${message}`);
}

const revision = await request("/astra-revision.json", "application/json");
assert(revision.ok, `revision endpoint HTTP ${revision.status}`);
let revisionJson;
try {
  revisionJson = JSON.parse(revision.body);
} catch {
  throw new Error("ASTRA_POSTFLIGHT_FAIL: revision endpoint is not valid JSON");
}
assert(
  String(revisionJson.sourceSha || "").toLowerCase() === expectedSha,
  `public revision mismatch expected=${expectedSha} actual=${revisionJson.sourceSha || "(missing)"}`,
);

const home = await request("/", "text/html");
assert(home.status === 200, `home HTTP ${home.status}`);
assert(/<title[\s>]/i.test(home.body), "home missing title");
assert(/rel=["']canonical["'][^>]*href=["']https:\/\/betgpt\.live\/?["']/i.test(home.body) ||
       /href=["']https:\/\/betgpt\.live\/?["'][^>]*rel=["']canonical["']/i.test(home.body),
       "home canonical missing or not betgpt.live");
assert(!/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(home.body),
       "home unexpectedly noindex");

const robots = await request("/robots.txt", "text/plain");
assert(robots.status === 200, `robots HTTP ${robots.status}`);
assert(/User-agent:\s*Googlebot/i.test(robots.body), "robots missing Googlebot rules");
assert(/Sitemap:\s*https:\/\/betgpt\.live\/sitemap\.xml/i.test(robots.body), "robots missing canonical sitemap");

const sitemap = await request("/sitemap.xml", "application/xml,text/xml");
assert(sitemap.status === 200, `sitemap HTTP ${sitemap.status}`);
assert(/<urlset\b/i.test(sitemap.body), "sitemap missing urlset");
assert(/<loc>https:\/\/betgpt\.live(?:\/|<)/i.test(sitemap.body), "sitemap missing canonical BetGPT URLs");
assert(!/noindex/i.test(sitemap.body), "sitemap unexpectedly contains noindex marker");

const health = await request("/health", "application/json");
assert(health.status === 200, `health HTTP ${health.status}`);
let healthJson;
try {
  healthJson = JSON.parse(health.body);
} catch {
  throw new Error("ASTRA_POSTFLIGHT_FAIL: health endpoint is not valid JSON");
}
assert(healthJson.ok === true, "health endpoint does not report ok=true");
assert(healthJson.service === "betgpt", "health endpoint does not identify BetGPT");

console.log("ASTRA_RELEASE_CONTROL_PLANE_POSTFLIGHT_PASS", JSON.stringify({
  base,
  sourceSha: expectedSha,
  home: home.status,
  robots: robots.status,
  sitemap: sitemap.status,
  health: health.status,
}));
