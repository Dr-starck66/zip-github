import fs from "node:fs";
import path from "node:path";

const manifestPath = path.resolve("source-manifest.json");
if (!fs.existsSync(manifestPath)) {
  throw new Error("ASTRA_SINGLEFLIGHT_FAIL: source-manifest.json missing");
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const repoName = String(manifest.sourceRepo || "").trim();
const sha = String(manifest.sourceSha || "").trim();

if (!/^[-_.A-Za-z0-9]+\/[-_.A-Za-z0-9]+$/.test(repoName)) {
  throw new Error("ASTRA_SINGLEFLIGHT_FAIL: invalid sourceRepo");
}
if (!/^[a-f0-9]{40}$/i.test(sha)) {
  throw new Error("ASTRA_SINGLEFLIGHT_FAIL: sourceSha must be an immutable 40-char commit SHA");
}

const verify = await fetch(`https://api.github.com/repos/${repoName}/commits/${sha}`, {
  headers: {
    "User-Agent": "ASTRA-Railway-SingleFlight/1.0",
    Accept: "application/vnd.github+json",
  },
});
if (!verify.ok) {
  throw new Error(`ASTRA_SINGLEFLIGHT_FAIL: source commit verification failed: ${verify.status}`);
}
const commit = await verify.json();
if (String(commit.sha || "").toLowerCase() !== sha.toLowerCase()) {
  throw new Error("ASTRA_SINGLEFLIGHT_FAIL: source SHA mismatch");
}

const lock = {
  schema: "astra-railway-singleflight-lock/v1",
  sourceRepo: repoName,
  sourceSha: sha,
  deploymentKey: `${repoName}@${sha}`,
  verifiedAt: new Date().toISOString(),
};
fs.writeFileSync(path.resolve(".astra-deploy-lock.json"), JSON.stringify(lock, null, 2) + "\n");
console.log("ASTRA_SINGLEFLIGHT_PASS", JSON.stringify(lock));
