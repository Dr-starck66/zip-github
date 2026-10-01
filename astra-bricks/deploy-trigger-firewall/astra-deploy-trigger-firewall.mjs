import process from "node:process";

function fail(code, details = "") {
  const suffix = details ? ` ${details}` : "";
  throw new Error(`ASTRA_DEPLOY_TRIGGER_FIREWALL_BLOCKED: ${code}${suffix}`);
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ASTRA-Deploy-Trigger-Firewall/1.0",
        Accept: "application/vnd.github+json",
        ...headers,
      },
      signal: controller.signal,
    });
    if (!res.ok) fail("verification-http", `${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function assertAuthorizedRailwayTrigger(options = {}) {
  const controllerRepo = String(options.controllerRepo || "Dr-starck66/zip-github");
  const greenPath = String(options.greenPath || "betgpt-railway-live/.astra-green-release.json");
  const manifestPath = String(options.manifestPath || "betgpt-railway-live/source-manifest.json");
  const publicRevisionUrl = String(options.publicRevisionUrl || "https://betgpt.live/astra-revision.json");

  const triggerSha = String(process.env.RAILWAY_GIT_COMMIT_SHA || "").trim().toLowerCase();
  const triggerBranch = String(process.env.RAILWAY_GIT_BRANCH || "").trim();
  const triggerOwner = String(process.env.RAILWAY_GIT_REPO_OWNER || "").trim();
  const triggerName = String(process.env.RAILWAY_GIT_REPO_NAME || "").trim();
  const triggerMessage = String(process.env.RAILWAY_GIT_COMMIT_MESSAGE || "").trim();

  if (!/^[a-f0-9]{40}$/.test(triggerSha)) fail("missing-or-invalid-railway-git-sha");
  if (triggerBranch !== "main") fail("non-main-trigger", `branch=${triggerBranch || "(missing)"}`);

  const expectedController = controllerRepo.toLowerCase();
  const actualController = `${triggerOwner}/${triggerName}`.toLowerCase();
  if (actualController !== expectedController) {
    fail("wrong-controller-repo", `expected=${controllerRepo} actual=${actualController || "(missing)"}`);
  }

  const commit = await fetchJson(`https://api.github.com/repos/${controllerRepo}/commits/${triggerSha}`);
  const changed = new Set((commit.files || []).map((f) => String(f.filename || "")));
  const apiMessage = String(commit.commit?.message || triggerMessage || "").split("\n")[0].trim();

  if (!changed.has(greenPath)) fail("green-token-not-changed", `commit=${triggerSha}`);
  if (!changed.has(manifestPath)) fail("manifest-not-changed", `commit=${triggerSha}`);

  const authorizedMessage =
    /^deploy: promote latest GREEN BetGPT candidate(?:\s|$)/i.test(apiMessage) ||
    /^rollback: restore last GREEN BetGPT release(?:\s|$)/i.test(apiMessage);

  if (!authorizedMessage) fail("unauthorized-controller-commit", `message=${JSON.stringify(apiMessage)}`);

  // Duplicate suppression: if the exact release is already public, a config/manual
  // redeploy is not allowed to rebuild it again.
  try {
    const publicController = new AbortController();
    const timer = setTimeout(() => publicController.abort(), 5000);
    let res;
    try {
      res = await fetch(publicRevisionUrl, {
        headers: {
          "User-Agent": "ASTRA-Deploy-Trigger-Firewall/1.0",
          "Cache-Control": "no-cache",
          Accept: "application/json",
        },
        signal: publicController.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res?.ok) {
      const current = await res.json().catch(() => null);
      const greenRaw = await fetch(
        `https://raw.githubusercontent.com/${controllerRepo}/${triggerSha}/${greenPath}`,
        { headers: { "User-Agent": "ASTRA-Deploy-Trigger-Firewall/1.0" } },
      );
      if (!greenRaw.ok) fail("green-token-fetch-failed", `http=${greenRaw.status}`);
      const green = JSON.parse(await greenRaw.text());
      const targetSha = String(green.sourceSha || "").trim().toLowerCase();
      const liveSha = String(current?.sourceSha || "").trim().toLowerCase();

      if (/^[a-f0-9]{40}$/.test(targetSha) && liveSha === targetSha) {
        fail("duplicate-release-already-public", `sourceSha=${targetSha}`);
      }
    }
  } catch (error) {
    if (String(error?.message || error).startsWith("ASTRA_DEPLOY_TRIGGER_FIREWALL_BLOCKED:")) throw error;
    // Network/public probe uncertainty must not create a false duplicate block.
    console.warn("ASTRA_DEPLOY_TRIGGER_FIREWALL_PUBLIC_PROBE_UNVERIFIED", String(error?.message || error));
  }

  console.log(
    "ASTRA_DEPLOY_TRIGGER_FIREWALL_PASS",
    JSON.stringify({
      controllerRepo,
      triggerSha,
      triggerBranch,
      message: apiMessage,
      changed: [...changed].filter((p) => p === greenPath || p === manifestPath),
    }),
  );

  return { triggerSha, apiMessage };
}
