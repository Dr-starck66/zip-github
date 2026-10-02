import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runRollout } from "./astra-brick-rollout.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const library = path.resolve(here, "../..");

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "astra-brick-rollout-"));
  mkdirSync(path.join(dir, "config"), { recursive: true });
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "fixture", private: true, scripts: {} }, null, 2) + "\n",
  );
  writeFileSync(
    path.join(dir, "config", "astra-never-fail-build-guard.json"),
    JSON.stringify({ requiredChecks: [] }, null, 2) + "\n",
  );
  writeFileSync(
    path.join(dir, "config", "astra-release-gate.json"),
    JSON.stringify({ preflightCommands: [], pipelines: { editorial: { commands: [] } } }, null, 2) + "\n",
  );
  return dir;
}

test("profile rollout plans, applies, verifies and writes evidence", () => {
  const target = fixture();
  try {
    const plan = runRollout({
      command: "plan",
      profile: "baseline-node-web-v1",
      target,
      library,
      force: false,
      runGuards: true,
    });
    assert.equal(plan.status, "CHANGES_REQUIRED");

    const applied = runRollout({
      command: "apply",
      profile: "baseline-node-web-v1",
      target,
      library,
      force: false,
      runGuards: true,
    });
    assert.equal(applied.status, "PASS");
    assert.equal(applied.bricks[0].status, "UPDATED");
    assert.equal(applied.bricks[0].guard.status, "PASS");
    assert.ok(existsSync(path.join(target, ".astra", "rollout-report.json")));

    const verified = runRollout({
      command: "verify",
      profile: "baseline-node-web-v1",
      target,
      library,
      force: false,
      runGuards: true,
    });
    assert.equal(verified.status, "PASS");
    assert.equal(verified.bricks[0].status, "PASS");

    const pkg = JSON.parse(readFileSync(path.join(target, "package.json"), "utf8"));
    assert.equal(pkg.scripts["guard:stream-resilience"], "node scripts/astra-stream-resilience-guard.mjs");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("profile verify fails closed on drift", () => {
  const target = fixture();
  try {
    runRollout({
      command: "apply",
      profile: "baseline-node-web-v1",
      target,
      library,
      force: false,
      runGuards: false,
    });

    const file = path.join(target, "scripts", "lib", "astra-stream-resilience.mjs");
    writeFileSync(file, readFileSync(file, "utf8") + "\n// drift\n");

    assert.throws(
      () =>
        runRollout({
          command: "verify",
          profile: "baseline-node-web-v1",
          target,
          library,
          force: false,
          runGuards: false,
        }),
      /ASTRA_BRICK_VERIFY_FAIL/,
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
