import fs from "node:fs/promises";

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

const commitPayload = JSON.parse(
  await fetchText(`https://api.github.com/repos/${repo}/commits/main`, {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }),
);
const controllerSha = String(commitPayload.sha || "").trim().toLowerCase();
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
