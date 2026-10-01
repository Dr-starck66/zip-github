#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const LOCK_SCHEMA = "astra-brick-lock/v1";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function readText(file) {
  return readFileSync(file, "utf8");
}
function readJson(file) {
  return JSON.parse(readText(file));
}
function writeJsonAtomic(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}
function normalize(p) {
  return p.split(path.sep).join("/");
}
function parseArgs(argv) {
  const args = { command: argv[2] || "verify", force: false };
  for (let i = 3; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--force") args.force = true;
    else if (token === "--brick") args.brick = argv[++i];
    else if (token === "--target") args.target = argv[++i];
    else if (token === "--json") args.json = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!args.brick || !args.target) {
    throw new Error("Usage: astra-brick-injector.mjs plan|apply|verify|rollback --brick <dir> --target <dir> [--force] [--json]");
  }
  return args;
}
function loadManifest(brickRoot) {
  const file = path.join(brickRoot, "brick.json");
  if (!existsSync(file)) throw new Error(`ASTRA_BRICK_MANIFEST_MISSING ${file}`);
  const manifest = readJson(file);
  if (manifest.schema !== "astra-brick/v1" || !manifest.id || !manifest.version) {
    throw new Error("ASTRA_BRICK_MANIFEST_INVALID");
  }
  return manifest;
}
function loadLock(targetRoot) {
  const file = path.join(targetRoot, ".astra", "brick-lock.json");
  if (!existsSync(file)) return { schema: LOCK_SCHEMA, bricks: {} };
  const lock = readJson(file);
  if (lock.schema !== LOCK_SCHEMA || typeof lock.bricks !== "object") {
    throw new Error("ASTRA_BRICK_LOCK_INVALID");
  }
  return lock;
}
function fileState(source, target) {
  const expected = readText(source);
  const expectedHash = sha256(expected);
  if (!existsSync(target)) return { status: "MISSING", expectedHash, currentHash: null };
  const current = readText(target);
  const currentHash = sha256(current);
  return { status: currentHash === expectedHash ? "MATCH" : "DRIFT", expectedHash, currentHash };
}
function getPointer(root, pointer) {
  const parts = String(pointer || "")
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  let node = root;
  for (const part of parts) {
    if (node == null || !(part in node)) return { exists: false, value: undefined };
    node = node[part];
  }
  return { exists: true, value: node };
}
function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function arrayHas(arr, spec) {
  if (!Array.isArray(arr)) return false;
  if (spec.matchKey && spec.value && typeof spec.value === "object") {
    return arr.some((item) => item && typeof item === "object" && item[spec.matchKey] === spec.value[spec.matchKey] && sameJson(item, spec.value));
  }
  return arr.some((item) => sameJson(item, spec.value));
}
function arrayConflict(arr, spec) {
  if (!Array.isArray(arr) || !spec.matchKey || !spec.value || typeof spec.value !== "object") return null;
  return arr.find((item) => item && typeof item === "object" && item[spec.matchKey] === spec.value[spec.matchKey] && !sameJson(item, spec.value)) || null;
}
function ensureArray(root, pointer, spec, force) {
  const parts = pointer.split("/").slice(1);
  let node = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!(key in node)) node[key] = {};
    node = node[key];
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error(`ASTRA_BRICK_JSON_POINTER_INVALID ${pointer}`);
  }
  const key = parts.at(-1);
  if (!Array.isArray(node[key])) node[key] = [];
  const arr = node[key];
  if (arrayHas(arr, spec)) return false;
  const conflict = arrayConflict(arr, spec);
  if (conflict && !force) {
    throw new Error(`ASTRA_BRICK_JSON_CONFLICT path=${spec.path} pointer=${pointer} matchKey=${spec.matchKey}`);
  }
  if (conflict) {
    const index = arr.indexOf(conflict);
    arr[index] = spec.value;
  } else {
    arr.push(spec.value);
  }
  return true;
}
function collectPlan(manifest, brickRoot, targetRoot) {
  const files = Object.entries(manifest.installTargets || {}).map(([sourceRel, targetRel]) => {
    const source = path.join(brickRoot, sourceRel);
    const target = path.join(targetRoot, targetRel);
    if (!existsSync(source)) throw new Error(`ASTRA_BRICK_SOURCE_MISSING ${sourceRel}`);
    return { sourceRel, targetRel, ...fileState(source, target) };
  });

  const packagePath = path.join(targetRoot, "package.json");
  const scripts = [];
  for (const [name, command] of Object.entries(manifest.requiredScripts || {})) {
    if (!existsSync(packagePath)) {
      scripts.push({ name, command, status: "PACKAGE_MISSING" });
      continue;
    }
    const pkg = readJson(packagePath);
    const current = pkg.scripts?.[name];
    scripts.push({
      name,
      command,
      current: current ?? null,
      status: current === command ? "MATCH" : current == null ? "MISSING" : "DRIFT",
    });
  }

  const jsonEnsures = (manifest.jsonArrayEnsures || []).map((spec) => {
    const file = path.join(targetRoot, spec.path);
    if (!existsSync(file)) return { ...spec, status: spec.optional ? "OPTIONAL_MISSING" : "FILE_MISSING" };
    const json = readJson(file);
    const got = getPointer(json, spec.pointer);
    if (!got.exists || !Array.isArray(got.value)) return { ...spec, status: "MISSING" };
    if (arrayHas(got.value, spec)) return { ...spec, status: "MATCH" };
    if (arrayConflict(got.value, spec)) return { ...spec, status: "DRIFT" };
    return { ...spec, status: "MISSING" };
  });

  return { files, scripts, jsonEnsures };
}
function compliant(plan) {
  return (
    plan.files.every((x) => x.status === "MATCH") &&
    plan.scripts.every((x) => x.status === "MATCH") &&
    plan.jsonEnsures.every((x) => x.status === "MATCH" || x.status === "OPTIONAL_MISSING")
  );
}
function backupFile(targetRoot, backupRoot, rel, entries) {
  const source = path.join(targetRoot, rel);
  if (existsSync(source)) {
    const dest = path.join(backupRoot, "files", rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    cpSync(source, dest);
    entries.push({ path: rel, existed: true });
  } else {
    entries.push({ path: rel, existed: false });
  }
}
function applyBrick({ manifest, brickRoot, targetRoot, force }) {
  const before = collectPlan(manifest, brickRoot, targetRoot);
  if (compliant(before)) return { status: "ALREADY_COMPLIANT", plan: before };

  const lock = loadLock(targetRoot);
  const previous = lock.bricks[manifest.id] || null;
  const installedHashes = previous?.files || {};

  for (const item of before.files) {
    if (item.status !== "DRIFT") continue;
    const knownInstalled = installedHashes[item.targetRel];
    const safeUpgrade = knownInstalled && knownInstalled === item.currentHash;
    if (!safeUpgrade && !force) {
      throw new Error(`ASTRA_BRICK_DRIFT_BLOCKED ${item.targetRel}`);
    }
  }
  for (const item of before.scripts) {
    if (item.status === "DRIFT" && !force) {
      throw new Error(`ASTRA_BRICK_SCRIPT_CONFLICT ${item.name}`);
    }
  }
  for (const item of before.jsonEnsures) {
    if (item.status === "DRIFT" && !force) {
      throw new Error(`ASTRA_BRICK_JSON_CONFLICT ${item.path} ${item.pointer}`);
    }
  }

  const stamp = new Date().toISOString().replaceAll(":", "-");
  const backupRel = path.join(".astra", "backups", manifest.id, stamp);
  const backupRoot = path.join(targetRoot, backupRel);
  const backupEntries = [];
  const touched = new Set();

  const backupOnce = (rel) => {
    if (touched.has(rel)) return;
    touched.add(rel);
    backupFile(targetRoot, backupRoot, rel, backupEntries);
  };

  for (const item of before.files) {
    if (item.status === "MATCH") continue;
    backupOnce(item.targetRel);
    const source = path.join(brickRoot, item.sourceRel);
    const target = path.join(targetRoot, item.targetRel);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target);
  }

  if ((before.scripts || []).some((x) => x.status !== "MATCH")) {
    const rel = "package.json";
    backupOnce(rel);
    const file = path.join(targetRoot, rel);
    if (!existsSync(file)) throw new Error("ASTRA_BRICK_PACKAGE_JSON_REQUIRED");
    const pkg = readJson(file);
    pkg.scripts ||= {};
    for (const [name, command] of Object.entries(manifest.requiredScripts || {})) {
      if (pkg.scripts[name] && pkg.scripts[name] !== command && !force) {
        throw new Error(`ASTRA_BRICK_SCRIPT_CONFLICT ${name}`);
      }
      pkg.scripts[name] = command;
    }
    writeJsonAtomic(file, pkg);
  }

  for (const spec of manifest.jsonArrayEnsures || []) {
    const file = path.join(targetRoot, spec.path);
    if (!existsSync(file)) {
      if (spec.optional) continue;
      throw new Error(`ASTRA_BRICK_JSON_FILE_REQUIRED ${spec.path}`);
    }
    const json = readJson(file);
    const beforeText = JSON.stringify(json);
    const changed = ensureArray(json, spec.pointer, spec, force);
    if (changed) {
      backupOnce(spec.path);
      writeJsonAtomic(file, json);
    } else if (beforeText !== JSON.stringify(json)) {
      throw new Error("ASTRA_BRICK_INTERNAL_JSON_MUTATION");
    }
  }

  const after = collectPlan(manifest, brickRoot, targetRoot);
  if (!compliant(after)) throw new Error("ASTRA_BRICK_APPLY_VERIFY_FAIL");

  const files = {};
  for (const item of after.files) files[item.targetRel] = item.expectedHash;

  const backupManifest = {
    schema: "astra-brick-backup/v1",
    brickId: manifest.id,
    version: manifest.version,
    createdAt: new Date().toISOString(),
    entries: backupEntries,
  };
  writeJsonAtomic(path.join(backupRoot, "backup.json"), backupManifest);

  lock.bricks[manifest.id] = {
    version: manifest.version,
    installedAt: new Date().toISOString(),
    canonicalRepo: manifest.canonicalRepo || null,
    canonicalPath: manifest.canonicalPath || null,
    files,
    scripts: manifest.requiredScripts || {},
    lastBackup: normalize(backupRel),
  };
  writeJsonAtomic(path.join(targetRoot, ".astra", "brick-lock.json"), lock);

  return { status: previous ? "UPDATED" : "INSTALLED", plan: after, backup: normalize(backupRel) };
}
function rollbackBrick({ manifest, targetRoot }) {
  const lock = loadLock(targetRoot);
  const entry = lock.bricks[manifest.id];
  if (!entry?.lastBackup) throw new Error(`ASTRA_BRICK_ROLLBACK_MISSING ${manifest.id}`);
  const backupRoot = path.join(targetRoot, entry.lastBackup);
  const backupManifestFile = path.join(backupRoot, "backup.json");
  if (!existsSync(backupManifestFile)) throw new Error("ASTRA_BRICK_BACKUP_MANIFEST_MISSING");
  const backup = readJson(backupManifestFile);
  for (const item of [...backup.entries].reverse()) {
    const target = path.join(targetRoot, item.path);
    if (item.existed) {
      const saved = path.join(backupRoot, "files", item.path);
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(saved, target);
    } else {
      rmSync(target, { force: true });
    }
  }
  delete lock.bricks[manifest.id];
  writeJsonAtomic(path.join(targetRoot, ".astra", "brick-lock.json"), lock);
  return { status: "ROLLED_BACK", backup: normalize(entry.lastBackup) };
}

export function runInjector(args) {
  const brickRoot = path.resolve(args.brick);
  const targetRoot = path.resolve(args.target);
  const manifest = loadManifest(brickRoot);
  const plan = collectPlan(manifest, brickRoot, targetRoot);

  if (args.command === "plan") return { status: compliant(plan) ? "COMPLIANT" : "CHANGES_REQUIRED", brick: manifest.id, version: manifest.version, plan };
  if (args.command === "verify") {
    if (!compliant(plan)) {
      const error = new Error("ASTRA_BRICK_VERIFY_FAIL");
      error.plan = plan;
      throw error;
    }
    return { status: "PASS", brick: manifest.id, version: manifest.version, plan };
  }
  if (args.command === "apply") return { brick: manifest.id, version: manifest.version, ...applyBrick({ manifest, brickRoot, targetRoot, force: args.force }) };
  if (args.command === "rollback") return { brick: manifest.id, version: manifest.version, ...rollbackBrick({ manifest, targetRoot }) };
  throw new Error(`Unknown command: ${args.command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv);
    const result = runInjector(args);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`ASTRA_BRICK_INJECTOR_${result.status} brick=${result.brick} version=${result.version}`);
  } catch (error) {
    console.error(error?.message || String(error));
    if (error?.plan) console.error(JSON.stringify(error.plan, null, 2));
    process.exit(1);
  }
}
