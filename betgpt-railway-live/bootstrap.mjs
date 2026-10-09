import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import extract from "extract-zip";

/**
 * ASTRA RAILWAY SINGLE-FLIGHT
 * The immutable source SHA comes only from source-manifest.json.
 * Railway environment variables are deliberately ignored so variable changes
 * cannot fan out into duplicate deployments.
 */
const manifestPath = path.resolve("source-manifest.json");
if (!fs.existsSync(manifestPath)) throw new Error("ASTRA_SINGLEFLIGHT_FAIL: source-manifest.json missing");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const sourceRepo = String(manifest.sourceRepo || "").trim();
const sourceRevision = String(manifest.sourceSha || "").trim();

if (!/^[-_.A-Za-z0-9]+\/[-_.A-Za-z0-9]+$/.test(sourceRepo)) {
  throw new Error("ASTRA_SINGLEFLIGHT_FAIL: invalid sourceRepo");
}
if (!/^[a-f0-9]{40}$/i.test(sourceRevision)) {
  throw new Error("ASTRA_SINGLEFLIGHT_FAIL: invalid immutable sourceSha");
}

const sourceUrl = `https://codeload.github.com/${sourceRepo}/zip/${sourceRevision}`;
const res = await fetch(sourceUrl, {
  headers: {
    "User-Agent": "BetGPT-Railway-SingleFlight/1.0",
    Accept: "application/zip",
  },
});
if (!res.ok) throw new Error(`BetGPT source download failed: ${res.status}`);

const zip = Buffer.from(await res.arrayBuffer());
if (zip.length < 100_000) throw new Error(`BetGPT source archive unexpectedly small: ${zip.length}`);
const archiveSha256 = crypto.createHash("sha256").update(zip).digest("hex");

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

// Railway Ereferer ownership proof: emitted into the real runtime artifact,
// even when the application release train is pinned to an earlier GREEN SHA.
const erefererToken = "<!-- 5dfb8c2d03070322faa31530c814e2f1 -->";
const erefererPage = path.join(appDir, "public", "ereferer-verification.html");
fs.mkdirSync(path.dirname(erefererPage), { recursive: true });
fs.writeFileSync(
  erefererPage,
  `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow"><title>BetGPT - Ereferer</title></head>
<body>
  ${erefererToken}
  <p>Vérification de propriété du domaine betgpt.live.</p>
</body></html>
`,
);
const appRootRoute = path.join(appDir, "src", "routes", "__root.tsx");
if (fs.existsSync(appRootRoute)) {
  let root = fs.readFileSync(appRootRoute, "utf8");
  if (!root.includes(erefererToken)) {
    const markerNode = `<span hidden dangerouslySetInnerHTML={{ __html: "${erefererToken}" }} />`;
    if (!root.includes("<body>")) throw new Error("EREFERER_ROOT_PROOF_FAILED: missing SSR body");
    root = root.replace("<body>", `<body>\n        ${markerNode}`);
    fs.writeFileSync(appRootRoute, root);
  }
}
console.log("EREFERER_RAILWAY_ARTIFACT_PASS", JSON.stringify({ page: erefererPage, token: erefererToken }));

const revisionPath = path.join(appDir, "public", "astra-revision.json");
fs.mkdirSync(path.dirname(revisionPath), { recursive: true });
fs.writeFileSync(
  revisionPath,
  JSON.stringify(
    {
      schema: "astra-public-route-revision/v2",
      sourceRepo,
      sourceSha: sourceRevision,
      deploymentKey: `${sourceRepo}@${sourceRevision}`,
      archiveSha256,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);

console.log(
  "BETGPT_SOURCE_OK",
  JSON.stringify({
    source: sourceUrl,
    sourceRepo,
    sourceRevision,
    deploymentKey: `${sourceRepo}@${sourceRevision}`,
    bytes: zip.length,
    sha256: archiveSha256,
  }),
);
