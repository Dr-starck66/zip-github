import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const chunksDir = path.join(root, "chunks");
const appDir = path.join(root, "app");
const archivePath = path.join(root, "runtime.tar.gz");

const parts = fs.readdirSync(chunksDir)
  .filter((name) => name.endsWith(".b64"))
  .sort();

if (!parts.length) throw new Error("BetGPT bootstrap: no archive chunks found");

const base64 = parts.map((name) => fs.readFileSync(path.join(chunksDir, name), "utf8")).join("");
const archive = Buffer.from(base64, "base64");
if (archive.length < 100000) throw new Error("BetGPT bootstrap: archive unexpectedly small");

fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });
fs.writeFileSync(archivePath, archive);

execFileSync("tar", ["-xzf", archivePath, "-C", appDir], { stdio: "inherit" });

if (!fs.existsSync(path.join(appDir, "package.json"))) {
  throw new Error("BetGPT bootstrap: package.json missing after extraction");
}

console.log("BETGPT_BOOTSTRAP_OK", JSON.stringify({ parts: parts.length, bytes: archive.length }));
