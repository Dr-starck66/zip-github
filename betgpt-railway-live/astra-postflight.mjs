#!/usr/bin/env node
import process from "node:process";

const base = String(process.env.ASTRA_PUBLIC_BASE || "https://betgpt.live").replace(/\/$/, "");
const expectedSha = String(process.env.ASTRA_EXPECTED_SHA || "").trim().toLowerCase();
const timeoutMs = Number(process.env.ASTRA_HTTP_TIMEOUT_MS || 10000);
const sitemapConcurrency = Math.max(1, Math.min(32, Number(process.env.ASTRA_SITEMAP_CONCURRENCY || 16)));
const sitemapMaxUrls = Math.max(1, Number(process.env.ASTRA_SITEMAP_MAX_URLS || 3000));

if (!/^[a-f0-9]{40}$/.test(expectedSha)) {
  throw new Error("ASTRA_POSTFLIGHT_BLOCKED: ASTRA_EXPECTED_SHA must be a 40-char commit SHA");
}

function assert(condition, message) {
  if (!condition) throw new Error("ASTRA_POSTFLIGHT_FAIL: " + message);
}

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeUrl(value) {
  const u = new URL(value);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString().replace(/\/$/, "");
}

function attr(tag, name) {
  const re = new RegExp("\\b" + name + "\\s*=\\s*([\\\"'])(.*?)\\1", "i");
  return tag.match(re)?.[2] || "";
}

function hasNoindex(html) {
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  return metas.some((tag) => {
    const name = attr(tag, "name").toLowerCase();
    const content = attr(tag, "content").toLowerCase();
    return (name === "robots" || name === "googlebot") && /(^|[,\s])noindex([,\s]|$)/i.test(content);
  });
}

function canonicalHref(html) {
  const links = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of links) {
    const rel = attr(tag, "rel").toLowerCase().split(/\s+/);
    if (rel.includes("canonical")) return attr(tag, "href");
  }
  return "";
}

async function requestUrl(url, accept, redirect = "follow", attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        redirect,
        headers: {
          "User-Agent": "ASTRA-Release-Control-Plane/2.0",
          Accept: accept || "*/*",
          "Cache-Control": "no-cache"
        },
        signal: controller.signal
      });
      const body = await res.text();
      return {
        url,
        status: res.status,
        ok: res.ok,
        contentType: res.headers.get("content-type") || "",
        location: res.headers.get("location") || "",
        finalUrl: res.url,
        body
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function request(pathname, accept) {
  return requestUrl(base + pathname, accept, "follow", 2);
}

const revision = await request("/astra-revision.json", "application/json");
assert(revision.ok, "revision endpoint HTTP " + revision.status);
let revisionJson;
try {
  revisionJson = JSON.parse(revision.body);
} catch {
  throw new Error("ASTRA_POSTFLIGHT_FAIL: revision endpoint is not valid JSON");
}
assert(
  String(revisionJson.sourceSha || "").toLowerCase() === expectedSha,
  "public revision mismatch expected=" + expectedSha + " actual=" + (revisionJson.sourceSha || "(missing)")
);

const home = await request("/", "text/html");
assert(home.status === 200, "home HTTP " + home.status);
assert(/<title[\s>]/i.test(home.body), "home missing title");
assert(!hasNoindex(home.body), "home unexpectedly noindex");
const homeCanonical = canonicalHref(home.body);
assert(homeCanonical && normalizeUrl(homeCanonical) === normalizeUrl(base), "home canonical missing or incorrect");

const robots = await request("/robots.txt", "text/plain");
assert(robots.status === 200, "robots HTTP " + robots.status);
assert(/User-agent:\s*Googlebot/i.test(robots.body), "robots missing Googlebot rules");
assert(new RegExp("Sitemap:\\s*" + base.replace(/[.*+?^$()|[\\]\\]/g, "\\$&") + "/sitemap\\.xml", "i").test(robots.body), "robots missing canonical sitemap");

const sitemap = await request("/sitemap.xml", "application/xml,text/xml");
assert(sitemap.status === 200, "sitemap HTTP " + sitemap.status);
assert(/<urlset\b/i.test(sitemap.body), "sitemap missing urlset");

const urls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/gi)]
  .map((match) => decodeXml(match[1].trim()))
  .filter((url) => url.startsWith(base));

assert(urls.length > 0, "sitemap contains no canonical BetGPT URLs");
assert(urls.length <= sitemapMaxUrls, "sitemap exceeds safety cap " + sitemapMaxUrls);

const uniqueUrls = [...new Set(urls)];
assert(uniqueUrls.length === urls.length, "sitemap contains duplicate loc entries");

const failures = [];
let cursor = 0;

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= uniqueUrls.length) return;
    const url = uniqueUrls[index];

    try {
      const res = await requestUrl(url, "text/html,application/xhtml+xml", "manual", 3);
      if (res.status !== 200) {
        failures.push({ url, reason: "http-status", status: res.status, location: res.location });
        continue;
      }

      const isHtml = /text\/html|application\/xhtml\+xml/i.test(res.contentType) || /<html\b/i.test(res.body);
      if (!isHtml) {
        failures.push({ url, reason: "non-html-indexable-response", contentType: res.contentType });
        continue;
      }

      if (hasNoindex(res.body)) {
        failures.push({ url, reason: "noindex" });
        continue;
      }

      const canonical = canonicalHref(res.body);
      if (!canonical) {
        failures.push({ url, reason: "missing-canonical" });
        continue;
      }

      let normalizedCanonical;
      let normalizedExpected;
      try {
        normalizedCanonical = normalizeUrl(new URL(canonical, url).toString());
        normalizedExpected = normalizeUrl(url);
      } catch {
        failures.push({ url, reason: "invalid-canonical", canonical });
        continue;
      }

      if (normalizedCanonical !== normalizedExpected) {
        failures.push({ url, reason: "canonical-mismatch", canonical: normalizedCanonical, expected: normalizedExpected });
      }
    } catch (error) {
      failures.push({ url, reason: "request-error", error: String(error?.message || error) });
    }
  }
}

await Promise.all(Array.from({ length: Math.min(sitemapConcurrency, uniqueUrls.length) }, () => worker()));

if (failures.length) {
  console.error("ASTRA_INDEXABILITY_PUBLIC_GATE_FAIL", JSON.stringify({
    audited: uniqueUrls.length,
    failed: failures.length,
    sample: failures.slice(0, 50)
  }));
  process.exit(1);
}
console.log("ASTRA_INDEXABILITY_PUBLIC_GATE_PASS", JSON.stringify({ audited: uniqueUrls.length, failed: 0 }));

const health = await request("/health", "application/json");
assert(health.status === 200, "health HTTP " + health.status);
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
  sitemapUrlsAudited: uniqueUrls.length,
  health: health.status
}));
