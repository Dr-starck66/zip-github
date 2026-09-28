import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import extract from "extract-zip";

const parts = [
  "https://duality-x-v02.floot.app/_cdn/static/b8cc583d-59e9-48fa-87ca-b30365c460fa-betgpt-source.part01",
  "https://duality-x-v02.floot.app/_cdn/static/946853dc-20bb-428a-a415-31bb1cf3bc08-betgpt-source.part02"
];
const expected = "8071b5ef909a3ba595109802c98eb47230b70848183c739494c1ecf604608580";

const buffers = [];
for (const url of parts) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed " + res.status + " for " + url);
  buffers.push(Buffer.from(await res.arrayBuffer()));
}

const zip = Buffer.concat(buffers);
const sha = crypto.createHash("sha256").update(zip).digest("hex");
if (sha !== expected) throw new Error("BetGPT source checksum mismatch: " + sha);

const zipPath = path.resolve("betgpt-source.zip");
const extractDir = path.resolve(".betgpt-extract");
const appDir = path.resolve("app");

fs.writeFileSync(zipPath, zip);
fs.rmSync(extractDir, { recursive: true, force: true });
fs.rmSync(appDir, { recursive: true, force: true });
await extract(zipPath, { dir: extractDir });

const sourceDir = path.join(extractDir, "betgpt_master_final");
if (!fs.existsSync(path.join(sourceDir, "package.json"))) {
  throw new Error("BetGPT package.json missing after extraction");
}

fs.renameSync(sourceDir, appDir);
console.log("BETGPT_SOURCE_OK", JSON.stringify({ bytes: zip.length, sha256: sha }));
