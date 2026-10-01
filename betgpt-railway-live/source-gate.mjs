import { assertAuthorizedRailwayTrigger } from "./astra-deploy-trigger-firewall.mjs";
import fs from "node:fs";
import path from "node:path";

const manifestPath = path.resolve("source-manifest.json");
const greenPath = path.resolve(".astra-green-release.json");

const triggerFirewallConfig = JSON.parse(fs.readFileSync(path.resolve("astra-deploy-trigger-firewall.json"), "utf8"));
await assertAuthorizedRailwayTrigger(triggerFirewallConfig);

if (!fs.existsSync(manifestPath)) {
  throw new Error("ASTRA_SINGLEFLIGHT_BLOCKED: source-manifest.json missing");
}
if (!fs.existsSync(greenPath)) {
  throw new Error("ASTRA_GREEN_RELEASE_BLOCKED: .astra-green-release.json missing");
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const green = JSON.parse(fs.readFileSync(greenPath, "utf8"));
const repoName = String(manifest.sourceRepo || "").trim();
const sha = String(manifest.sourceSha || "").trim();

if (!/^[-_.A-Za-z0-9]+\/[-_.A-Za-z0-9]+$/.test(repoName)) {
  throw new Error("ASTRA_SINGLEFLIGHT_BLOCKED: invalid sourceRepo");
}
if (!/^[a-f0-9]{40}$/i.test(sha)) {
  throw new Error("ASTRA_SINGLEFLIGHT_BLOCKED: sourceSha must be an immutable 40-char commit SHA");
}

if (green.schema !== "astra-green-release/v1") {
  throw new Error("ASTRA_GREEN_RELEASE_BLOCKED: invalid release marker schema");
}
if (green.greenVerified !== true) {
  throw new Error("ASTRA_GREEN_RELEASE_BLOCKED: candidate is not GREEN");
}
if (String(green.sourceRepo || "") !== repoName || String(green.sourceSha || "").toLowerCase() !== sha.toLowerCase()) {
  throw new Error("ASTRA_GREEN_RELEASE_BLOCKED: marker/manifest source mismatch");
}
if (String(green.promotionKey || "").toLowerCase() !== `${repoName}@${sha}`.toLowerCase()) {
  throw new Error("ASTRA_GREEN_RELEASE_BLOCKED: promotionKey mismatch");
}

const bootstrap =
  green.controller === "ASTRA_BOOTSTRAP_FROM_SUCCESSFUL_PRODUCTION" &&
  typeof green.bootstrapFromRailwayDeploymentId === "string" &&
  green.bootstrapFromRailwayDeploymentId.length > 10;

if (!bootstrap) {
  if (green.controller !== "ASTRA_SAFE_BETGPT_PROMOTION") {
    throw new Error("ASTRA_GREEN_RELEASE_BLOCKED: unauthorized promotion controller");
  }
  const runId = Number(green.workflowRunId);
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    throw new Error("ASTRA_GREEN_RELEASE_BLOCKED: missing workflowRunId");
  }

  const runRes = await fetch(`https://api.github.com/repos/${repoName}/actions/runs/${runId}`, {
    headers: {
      "User-Agent": "ASTRA-Green-Release-Gate/1.0",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!runRes.ok) {
    throw new Error(`ASTRA_GREEN_RELEASE_BLOCKED: workflow proof lookup failed: ${runRes.status}`);
  }
  const run = await runRes.json();
  const runPath = String(run.path || "");
  if (
    String(run.head_sha || "").toLowerCase() !== sha.toLowerCase() ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    String(run.head_branch || "") !== "main" ||
    !runPath.endsWith("/astra-never-fail.yml")
  ) {
    throw new Error("ASTRA_GREEN_RELEASE_BLOCKED: workflow proof is not a successful candidate gate for this SHA");
  }
}

const verify = await fetch(`https://api.github.com/repos/${repoName}/commits/${sha}`, {
  headers: {
    "User-Agent": "ASTRA-Railway-SingleFlight/2.0",
    Accept: "application/vnd.github+json",
  },
});
if (!verify.ok) {
  throw new Error(`ASTRA_SINGLEFLIGHT_BLOCKED: source commit verification failed: ${verify.status}`);
}
const commit = await verify.json();
if (String(commit.sha || "").toLowerCase() !== sha.toLowerCase()) {
  throw new Error("ASTRA_SINGLEFLIGHT_BLOCKED: source SHA mismatch");
}

const lock = {
  schema: "astra-railway-singleflight-lock/v2",
  sourceRepo: repoName,
  sourceSha: sha,
  deploymentKey: `${repoName}@${sha}`,
  greenController: green.controller,
  workflowRunId: green.workflowRunId ?? null,
  verifiedAt: new Date().toISOString(),
};
fs.writeFileSync(path.resolve(".astra-deploy-lock.json"), JSON.stringify(lock, null, 2) + "\n");
console.log("ASTRA_GREEN_RELEASE_PASS", JSON.stringify(lock));
