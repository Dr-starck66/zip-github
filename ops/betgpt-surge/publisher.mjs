import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { execFileSync, execSync } from "node:child_process";
import extract from "extract-zip";

let state = { phase: "boot", ok: false };
console.log("PUBLISHER_BOOT", JSON.stringify({node: process.version, port: process.env.PORT || 8080}));
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(state));
});
server.listen(Number(process.env.PORT || 8080), "0.0.0.0");

const log = (tag, value) => console.log(tag, JSON.stringify(value));
const token = (process.env.SURGE_TOKEN || "").trim();
const expected = "8071b5ef909a3ba595109802c98eb47230b70848183c739494c1ecf604608580";
const parts = [
  "https://duality-x-v02.floot.app/_cdn/static/b8cc583d-59e9-48fa-87ca-b30365c460fa-betgpt-source.part01",
  "https://duality-x-v02.floot.app/_cdn/static/946853dc-20bb-428a-a415-31bb1cf3bc08-betgpt-source.part02"
];

async function main() {
  if (!token) throw new Error("SURGE_TOKEN missing");

  state = { phase: "surge-auth", ok: false };
  const auth = "Basic " + Buffer.from("token:" + token).toString("base64");
  const accountRes = await fetch("https://surge.surge.sh/account", {
    headers: { authorization: auth }
  });
  const accountText = await accountRes.text();
  let account = {};
  try { account = JSON.parse(accountText); } catch {}
  log("SURGE_ACCOUNT", {
    status: accountRes.status,
    email: account.email || null,
    plan: account.plan?.name || null
  });
  if (!accountRes.ok) throw new Error("Surge token rejected: HTTP " + accountRes.status);

  const work = "/tmp/betgpt-surge";
  const extractDir = path.join(work, "src");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });

  state = { phase: "source-download", ok: false };
  const buffers = [];
  for (const url of parts) {
    console.log("PUBLISHER_PHASE", "source-fetch", url);
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error("Source download failed: HTTP " + res.status);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }
  const zip = Buffer.concat(buffers);
  const sha = crypto.createHash("sha256").update(zip).digest("hex");
  log("BETGPT_SOURCE", { bytes: zip.length, sha256: sha, match: sha === expected });
  if (sha !== expected) throw new Error("BetGPT source checksum mismatch");

  const zipPath = path.join(work, "source.zip");
  fs.writeFileSync(zipPath, zip);
  await extract(zipPath, { dir: extractDir });

  const root = path.join(extractDir, "betgpt_master_final");
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) throw new Error("BetGPT package.json missing");

  const editorialFunctionsPath = path.join(root, "src/lib/editorial.functions.ts");
  if (fs.existsSync(editorialFunctionsPath)) console.log("EDITORIAL_FUNCTIONS_SOURCE\n" + fs.readFileSync(editorialFunctionsPath, "utf8") + "\nEDITORIAL_FUNCTIONS_END");

  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  log("BETGPT_PACKAGE", { name: pkg.name || null, scripts: pkg.scripts || {} });

  state = { phase: "npm-ci", ok: false };
  execSync("npm ci --include=dev", { cwd: root, stdio: "inherit", timeout: 300000 });

  if (!pkg.scripts?.build) throw new Error("No npm build script in BetGPT source");
  state = { phase: "build", ok: false };
  execSync("npm run build", { cwd: root, stdio: "inherit", timeout: 300000 });

  const candidates = [
    "dist",
    "build",
    "out",
    ".output/public",
    "dist/client",
    "public"
  ].map((p) => path.join(root, p));
  const publishDir = candidates.find((d) => fs.existsSync(path.join(d, "index.html")));
  if (!publishDir) throw new Error("No static build directory containing index.html");

  fs.copyFileSync(path.join(publishDir, "index.html"), path.join(publishDir, "200.html"));
  log("BETGPT_PUBLISH_DIR", { publishDir });

  const surgeBin = path.resolve("node_modules/.bin/surge");
  const surgeEnv = {
    ...process.env,
    SURGE_LOGIN: account.email || "",
    SURGE_TOKEN: token
  };

  const fallbacks = [
    "betgpt-live.surge.sh",
    "betgpt-dr-starck.surge.sh",
    "betgpt-live-66.surge.sh"
  ];

  let liveDomain = null;
  let lastFailure = "";
  for (const domain of fallbacks) {
    try {
      state = { phase: "publish-surge", domain, ok: false };
      const output = execFileSync(surgeBin, [publishDir, domain], {
        env: surgeEnv,
        encoding: "utf8",
        timeout: 180000,
        stdio: ["ignore", "pipe", "pipe"]
      });
      log("SURGE_PUBLISH", { domain, output: output.slice(-4000) });
      liveDomain = domain;
      break;
    } catch (error) {
      lastFailure = String(error.stdout || "") + String(error.stderr || "");
      log("SURGE_PUBLISH_FAIL", { domain, error: lastFailure.slice(-2000) });
    }
  }
  if (!liveDomain) throw new Error("All Surge fallback domains failed: " + lastFailure.slice(-500));

  let customOutput = "";
  try {
    state = { phase: "publish-custom", domain: "betgpt.live", ok: false };
    customOutput = execFileSync(surgeBin, [publishDir, "https://betgpt.live"], {
      env: surgeEnv,
      encoding: "utf8",
      timeout: 180000,
      stdio: ["ignore", "pipe", "pipe"]
    });
    log("SURGE_CUSTOM", { output: customOutput.slice(-5000) });
  } catch (error) {
    customOutput = String(error.stdout || "") + String(error.stderr || "");
    log("SURGE_CUSTOM_FAIL", { error: customOutput.slice(-5000) });
  }

  state = {
    phase: "done",
    ok: true,
    live: "https://" + liveDomain,
    custom: "https://betgpt.live",
    customOutput: customOutput.slice(-1500)
  };
  log("PUBLISHER_DONE", state);
}

main().catch((error) => {
  state = { phase: "error", ok: false, error: String(error?.message || error) };
  console.error("PUBLISHER_ERROR", state.error);
});
