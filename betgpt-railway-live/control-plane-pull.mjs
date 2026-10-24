import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";

const repo = "Dr-starck66/zip-github";
const dir = "betgpt-railway-live";
const files = [
  "source-manifest.json",
  ".astra-green-release.json",
  "source-gate.mjs",
  "astra-deploy-trigger-firewall.mjs",
  "astra-deploy-trigger-firewall.json",
  "bootstrap.mjs",
];

async function fetchText(url, headers = {}) {
  let last = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "ASTRA-Control-Plane-Pull/1.0",
          "Cache-Control": "no-cache",
          ...headers,
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
      return await response.text();
    } catch (error) {
      last = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw last ?? new Error("control-plane fetch failed");
}

// Resolve a real commit SHA before fetching the control plane. The anonymous
// GitHub REST endpoint can return HTTP 403 when its shared rate limit is hit.
// For this PUBLIC repository only, fall back to the authenticated-by-TLS Git
// smart protocol, keeping all subsequent raw files pinned to the same SHA.
let controllerSha = "";
try {
  const commitPayload = JSON.parse(
    await fetchText(`https://api.github.com/repos/${repo}/commits/main`, {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    }),
  );
  controllerSha = String(commitPayload.sha || "").trim().toLowerCase();
} catch (error) {
  if (!/HTTP (?:403|429)\\b/.test(String(error))) throw error;
  const ref = execFileSync("git", [
    "-c", "credential.helper=",
    "ls-remote", "--exit-code",
    `https://github.com/${repo}.git`, "refs/heads/main",
  ], {
    encoding: "utf8",
    timeout: 20000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
  const match = /^([a-f0-9]{40})\\s+refs\\/heads\\/main$/.exec(ref);
  if (!match) throw new Error("ASTRA_CONTROL_PLANE_PULL_FAIL: unverified git main ref");
  controllerSha = match[1];
  console.log("ASTRA_CONTROL_PLANE_SHA_GIT_FALLBACK", controllerSha);
}
if (!/^[a-f0-9]{40}$/.test(controllerSha)) {
  throw new Error("ASTRA_CONTROL_PLANE_PULL_FAIL: invalid controller SHA");
}

for (const file of files) {
  const text = await fetchText(
    `https://raw.githubusercontent.com/${repo}/${controllerSha}/${dir}/${file}`,
  );
  await fs.writeFile(file, text);
}

const manifest = JSON.parse(await fs.readFile("source-manifest.json", "utf8"));
const green = JSON.parse(await fs.readFile(".astra-green-release.json", "utf8"));
const sourceSha = String(manifest.sourceSha || "").trim().toLowerCase();

if (!/^[a-f0-9]{40}$/.test(sourceSha)) {
  throw new Error("ASTRA_CONTROL_PLANE_PULL_FAIL: invalid source SHA");
}
if (
  green.greenVerified !== true ||
  green.controller !== "ASTRA_SAFE_BETGPT_PROMOTION" ||
  String(green.sourceSha || "").trim().toLowerCase() !== sourceSha ||
  String(green.promotionKey || "").toLowerCase() !==
    `${String(manifest.sourceRepo || "")}@${sourceSha}`.toLowerCase()
) {
  throw new Error("ASTRA_CONTROL_PLANE_PULL_FAIL: GREEN marker/manifest mismatch");
}

await fs.writeFile(
  ".astra-control-plane-lock.json",
  JSON.stringify(
    {
      schema: "astra-control-plane-lock/v1",
      controllerRepo: repo,
      controllerSha,
      sourceRepo: manifest.sourceRepo,
      sourceSha,
      railwayDeploymentId: process.env.RAILWAY_DEPLOYMENT_ID || null,
      pulledAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);

console.log(
  "ASTRA_CONTROL_PLANE_PULL_PASS",
  JSON.stringify({
    controllerRepo: repo,
    controllerSha,
    sourceRepo: manifest.sourceRepo,
    sourceSha,
    railwayDeploymentId: process.env.RAILWAY_DEPLOYMENT_ID || null,
  }),
);
