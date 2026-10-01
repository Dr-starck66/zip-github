// BETGPT_SOURCE_REF 92d191889abc4ed5f0929450b8a6b89351cf8532
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import extract from "extract-zip";

// Railway watches this path; resolve the exact BetGPT revision before downloading it.
const revisionRes = await fetch("https://api.github.com/repos/Dr-starck66/betgpt-railway/commits/main", {
  headers: { "User-Agent": "BetGPT-Railway-Bootstrap/3.0", Accept: "application/vnd.github+json" },
});
if (!revisionRes.ok) throw new Error(`BetGPT revision lookup failed: ${revisionRes.status}`);
const revisionJson = await revisionRes.json();
const sourceRevision = String(revisionJson.sha || "").trim();
if (!/^[a-f0-9]{40}$/i.test(sourceRevision)) throw new Error("BetGPT revision is invalid");
const sourceUrl = `https://codeload.github.com/Dr-starck66/betgpt-railway/zip/${sourceRevision}`;
const res = await fetch(sourceUrl, {
  headers: {
    "User-Agent": "BetGPT-Railway-Bootstrap/2.0",
    Accept: "application/zip",
  },
});
if (!res.ok) throw new Error(`BetGPT source download failed: ${res.status}`);

const zip = Buffer.from(await res.arrayBuffer());
if (zip.length < 100_000) throw new Error(`BetGPT source archive unexpectedly small: ${zip.length}`);
const sha = crypto.createHash("sha256").update(zip).digest("hex");

const zipPath = path.resolve("betgpt-source.zip");
const extractDir = path.resolve(".betgpt-extract");
const appDir = path.resolve("app");

fs.writeFileSync(zipPath, zip);
fs.rmSync(extractDir, { recursive: true, force: true });
fs.rmSync(appDir, { recursive: true, force: true });
await extract(zipPath, { dir: extractDir });

const candidates = fs
  .readdirSync(extractDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(extractDir, entry.name));
const sourceDir = candidates.find((dir) => fs.existsSync(path.join(dir, "package.json")));
if (!sourceDir) throw new Error("BetGPT package.json missing after GitHub archive extraction");

fs.renameSync(sourceDir, appDir);
const revisionPath = path.join(appDir, "public", "astra-revision.json");
fs.mkdirSync(path.dirname(revisionPath), { recursive: true });
fs.writeFileSync(
  revisionPath,
  JSON.stringify({ schema: "astra-public-route-revision/v1", sourceSha: sourceRevision, generatedAt: new Date().toISOString() }, null, 2) + "\n",
);
console.log("BETGPT_SOURCE_OK", JSON.stringify({ source: sourceUrl, sourceRevision, bytes: zip.length, sha256: sha }));
