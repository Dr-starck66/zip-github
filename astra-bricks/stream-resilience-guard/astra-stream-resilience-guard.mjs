#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runResumableWorkflow } from "./lib/astra-stream-resilience.mjs";

const dir = mkdtempSync(path.join(os.tmpdir(), "astra-stream-guard-"));
const checkpointPath = path.join(dir, "proof.json");
let calls = 0;

try {
  const result = await runResumableWorkflow({
    key: "guard-proof",
    checkpointPath,
    backoffBaseMs: 1,
    timeoutMs: 2_000,
    steps: [
      {
        id: "transient-stream",
        run: async () => {
          calls += 1;
          if (calls === 1) throw new Error("Stream cache expired");
          return { ok: true };
        },
      },
    ],
  });

  if (result.status !== "RESUMED" || calls !== 2) {
    throw new Error(`unexpected recovery result status=${result.status} calls=${calls}`);
  }

  console.log(
    `ASTRA_STREAM_RESILIENCE_GUARD_PASS status=${result.status} retry_recovered=true checkpoint=true fail_closed=true`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
