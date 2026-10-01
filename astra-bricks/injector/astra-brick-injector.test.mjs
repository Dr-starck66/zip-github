import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runInjector } from "./astra-brick-injector.mjs";

const repoRoot = path.resolve(new URL("../../", import.meta.url).pathname);
const brickRoot = path.join(repoRoot, "astra-bricks", "stream-resilience-guard");

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "astra-brick-injector-"));
  mkdirSync(path.join(dir, "config"), { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "echo ok" } }, null, 2) + "\n");
  writeFileSync(
    path.join(dir, "config", "astra-never-fail-build-guard.json"),
    JSON.stringify({ requiredChecks: [{ id: "base", command: "echo base" }] }, null, 2) + "\n",
  );
  writeFileSync(
    path.join(dir, "config", "astra-release-gate.json"),
    JSON.stringify({ preflightCommands: ["echo base"], pipelines: { editorial: { commands: ["echo editorial"] } } }, null, 2) + "\n",
  );
  return dir;
}

test("installs, verifies, remains idempotent, detects drift and rolls back", () => {
  const target = fixture();
  try {
    const originalPackage = readFileSync(path.join(target, "package.json"), "utf8");
    const applied = runInjector({ command: "apply", brick: brickRoot, target, force: false });
    assert.equal(applied.status, "INSTALLED");

    const verified = runInjector({ command: "verify", brick: brickRoot, target, force: false });
    assert.equal(verified.status, "PASS");

    const second = runInjector({ command: "apply", brick: brickRoot, target, force: false });
    assert.equal(second.status, "ALREADY_COMPLIANT");

    const protectedFile = path.join(target, "scripts", "lib", "astra-stream-resilience.mjs");
    writeFileSync(protectedFile, readFileSync(protectedFile, "utf8") + "\n// local drift\n");

    assert.throws(
      () => runInjector({ command: "verify", brick: brickRoot, target, force: false }),
      /ASTRA_BRICK_VERIFY_FAIL/,
    );
    assert.throws(
      () => runInjector({ command: "apply", brick: brickRoot, target, force: false }),
      /ASTRA_BRICK_DRIFT_BLOCKED/,
    );

    writeFileSync(protectedFile, readFileSync(path.join(brickRoot, "lib", "astra-stream-resilience.mjs"), "utf8"));
    const rolled = runInjector({ command: "rollback", brick: brickRoot, target, force: false });
    assert.equal(rolled.status, "ROLLED_BACK");
    assert.equal(readFileSync(path.join(target, "package.json"), "utf8"), originalPackage);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("plan reports changes without mutating target", () => {
  const target = fixture();
  try {
    const before = readFileSync(path.join(target, "package.json"), "utf8");
    const plan = runInjector({ command: "plan", brick: brickRoot, target, force: false });
    assert.equal(plan.status, "CHANGES_REQUIRED");
    assert.equal(readFileSync(path.join(target, "package.json"), "utf8"), before);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
