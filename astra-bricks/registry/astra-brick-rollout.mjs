#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { runInjector } from "../injector/astra-brick-injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultLibrary = path.resolve(here, "../..");

function parseArgs(argv) {
  const args = {
    command: argv[2] || "verify",
    library: defaultLibrary,
    force: false,
    runGuards: true,
  };
  for (let i = 3; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--profile") args.profile = argv[++i];
    else if (token === "--target") args.target = argv[++i];
    else if (token === "--library") args.library = argv[++i];
    else if (token === "--force") args.force = true;
    else if (token === "--no-guards") args.runGuards = false;
    else if (token === "--json") args.json = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!["plan", "apply", "verify"].includes(args.command)) {
    throw new Error("ASTRA_ROLLOUT_COMMAND_INVALID");
  }
  if (!args.profile || !args.target) {
    throw new Error(
      "Usage: astra-brick-rollout.mjs plan|apply|verify --profile <name> --target <dir> [--library <dir>] [--force] [--no-guards] [--json]",
    );
  }
  return args;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function loadRegistry(library) {
  const file = path.join(library, "astra-bricks", "registry", "registry.json");
  if (!existsSync(file)) throw new Error(`ASTRA_BRICK_REGISTRY_MISSING ${file}`);
  const registry = readJson(file);
  if (registry.schema !== "astra-brick-registry/v1") {
    throw new Error("ASTRA_BRICK_REGISTRY_INVALID");
  }
  return registry;
}

function guardCommand(manifest) {
  return String(manifest.requiredGateCommand || "").trim();
}

function runGuard(command, targetRoot) {
  if (!command) return { status: "SKIPPED", command: null };
  const run = spawnSync(command, {
    cwd: targetRoot,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, ASTRA_BRICK_ROLLOUT_ACTIVE: "1" },
  });
  return {
    status: run.status === 0 ? "PASS" : "FAIL",
    command,
    exitCode: typeof run.status === "number" ? run.status : 1,
    stdout: String(run.stdout || "").slice(-4000),
    stderr: String(run.stderr || "").slice(-4000),
  };
}

function classifyPlan(result) {
  if (result.status === "COMPLIANT" || result.status === "PASS") return "PASS";
  if (result.status === "CHANGES_REQUIRED") return "CHANGES_REQUIRED";
  return result.status;
}

export function runRollout(args) {
  const library = path.resolve(args.library || defaultLibrary);
  const target = path.resolve(args.target);
  const registry = loadRegistry(library);
  const profile = registry.profiles?.[args.profile];
  if (!profile || !Array.isArray(profile.bricks) || !profile.bricks.length) {
    throw new Error(`ASTRA_ROLLOUT_PROFILE_INVALID ${args.profile}`);
  }

  const report = {
    schema: "astra-brick-rollout-report/v1",
    profile: args.profile,
    command: args.command,
    target,
    generatedAt: new Date().toISOString(),
    status: "RUNNING",
    bricks: [],
  };

  for (const brickId of profile.bricks) {
    const reg = registry.bricks?.[brickId];
    if (!reg) throw new Error(`ASTRA_ROLLOUT_BRICK_UNKNOWN ${brickId}`);
    if (reg.status !== "PROVEN") {
      throw new Error(`ASTRA_ROLLOUT_BRICK_NOT_PROVEN ${brickId} status=${reg.status}`);
    }

    const brickRoot = path.join(library, reg.path);
    const manifestPath = path.join(brickRoot, "brick.json");
    if (!existsSync(manifestPath)) throw new Error(`ASTRA_ROLLOUT_MANIFEST_MISSING ${brickId}`);
    const manifest = readJson(manifestPath);

    if (args.command === "plan") {
      const result = runInjector({ command: "plan", brick: brickRoot, target, force: args.force });
      report.bricks.push({
        id: brickId,
        version: manifest.version,
        status: classifyPlan(result),
        injector: result,
      });
      continue;
    }

    if (args.command === "verify") {
      const result = runInjector({ command: "verify", brick: brickRoot, target, force: args.force });
      const guard = args.runGuards ? runGuard(guardCommand(manifest), target) : { status: "SKIPPED", command: null };
      if (guard.status === "FAIL") {
        const error = new Error(`ASTRA_ROLLOUT_GUARD_FAIL ${brickId}`);
        error.guard = guard;
        throw error;
      }
      report.bricks.push({
        id: brickId,
        version: manifest.version,
        status: "PASS",
        injector: result,
        guard,
      });
      continue;
    }

    let applied = null;
    try {
      applied = runInjector({ command: "apply", brick: brickRoot, target, force: args.force });
      const verified = runInjector({ command: "verify", brick: brickRoot, target, force: args.force });
      const guard = args.runGuards ? runGuard(guardCommand(manifest), target) : { status: "SKIPPED", command: null };
      if (guard.status === "FAIL") {
        throw Object.assign(new Error(`ASTRA_ROLLOUT_GUARD_FAIL ${brickId}`), { guard });
      }
      report.bricks.push({
        id: brickId,
        version: manifest.version,
        status: applied.status === "ALREADY_COMPLIANT" ? "PASS" : "UPDATED",
        injector: applied,
        verified,
        guard,
      });
    } catch (error) {
      if (applied && applied.status !== "ALREADY_COMPLIANT") {
        try {
          const rollback = runInjector({ command: "rollback", brick: brickRoot, target, force: false });
          report.bricks.push({
            id: brickId,
            version: manifest.version,
            status: "ROLLED_BACK",
            reason: error?.message || String(error),
            rollback,
          });
        } catch (rollbackError) {
          report.bricks.push({
            id: brickId,
            version: manifest.version,
            status: "ROLLBACK_FAIL",
            reason: error?.message || String(error),
            rollbackError: rollbackError?.message || String(rollbackError),
          });
        }
      }
      throw error;
    }
  }

  if (args.command === "plan") {
    report.status = report.bricks.every((brick) => brick.status === "PASS") ? "PASS" : "CHANGES_REQUIRED";
  } else {
    report.status = report.bricks.every((brick) => ["PASS", "UPDATED"].includes(brick.status)) ? "PASS" : "FAIL";
  }

  if (args.command === "apply") {
    const evidence = path.join(target, ".astra", "rollout-report.json");
    mkdirSync(path.dirname(evidence), { recursive: true });
    writeFileSync(evidence, JSON.stringify(report, null, 2) + "\n", "utf8");
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv);
    const report = runRollout(args);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(
      `ASTRA_BRICK_ROLLOUT_${report.status} profile=${report.profile} command=${report.command} bricks=${report.bricks.length}`,
    );
    if (report.status === "CHANGES_REQUIRED" && args.command !== "plan") process.exit(2);
  } catch (error) {
    console.error(error?.message || String(error));
    if (error?.guard) console.error(JSON.stringify(error.guard, null, 2));
    process.exit(1);
  }
}
