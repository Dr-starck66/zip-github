import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  FileCheckpointStore,
  isTransientStreamError,
  runResumableWorkflow,
} from "./lib/astra-stream-resilience.mjs";

function tempCheckpoint(name) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "astra-stream-resilience-"));
  return { dir, file: path.join(dir, `${name}.json`) };
}

test("classifies Stream cache expired as transient", () => {
  assert.equal(isTransientStreamError(new Error("Stream cache expired")), true);
  assert.equal(isTransientStreamError(new Error("business rule violated")), false);
});

test("recovers automatically from Stream cache expired without rerunning completed work", async () => {
  const { dir, file } = tempCheckpoint("retry");
  let firstCalls = 0;
  let secondCalls = 0;
  try {
    const result = await runResumableWorkflow({
      key: "retry",
      checkpointPath: file,
      backoffBaseMs: 1,
      steps: [
        {
          id: "prepare",
          run: async () => {
            firstCalls += 1;
            return { prepared: true };
          },
        },
        {
          id: "stream",
          run: async () => {
            secondCalls += 1;
            if (secondCalls === 1) throw new Error("Stream cache expired");
            return { recovered: true };
          },
        },
      ],
    });

    assert.equal(result.status, "RESUMED");
    assert.equal(firstCalls, 1);
    assert.equal(secondCalls, 2);

    const checkpoint = new FileCheckpointStore(file).load();
    assert.equal(checkpoint.steps.prepare.status, "PASS");
    assert.equal(checkpoint.steps.stream.status, "PASS");
    assert.equal(checkpoint.status, "RESUMED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("restarts from the last durable checkpoint after process-level failure", async () => {
  const { dir, file } = tempCheckpoint("restart");
  let prepareCalls = 0;
  let streamCalls = 0;
  try {
    await assert.rejects(
      () =>
        runResumableWorkflow({
          key: "restart",
          checkpointPath: file,
          maxAttempts: 1,
          backoffBaseMs: 1,
          steps: [
            {
              id: "prepare",
              run: async () => {
                prepareCalls += 1;
                return { token: "durable" };
              },
            },
            {
              id: "stream",
              run: async () => {
                streamCalls += 1;
                throw new Error("Stream cache expired");
              },
            },
          ],
        }),
      /ASTRA_STREAM_RESILIENCE_FAIL/,
    );

    const resumed = await runResumableWorkflow({
      key: "restart",
      checkpointPath: file,
      backoffBaseMs: 1,
      steps: [
        {
          id: "prepare",
          run: async () => {
            prepareCalls += 1;
            return { token: "should-not-run" };
          },
        },
        {
          id: "stream",
          run: async ({ results }) => {
            streamCalls += 1;
            assert.deepEqual(results.get("prepare"), { token: "durable" });
            return { recovered: true };
          },
        },
      ],
    });

    assert.equal(resumed.status, "RESUMED");
    assert.equal(prepareCalls, 1);
    assert.equal(streamCalls, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails closed on non-transient errors instead of retrying them", async () => {
  const { dir, file } = tempCheckpoint("fatal");
  let calls = 0;
  try {
    await assert.rejects(
      () =>
        runResumableWorkflow({
          key: "fatal",
          checkpointPath: file,
          maxAttempts: 5,
          backoffBaseMs: 1,
          steps: [
            {
              id: "business-rule",
              run: async () => {
                calls += 1;
                throw new Error("business rule violated");
              },
            },
          ],
        }),
      /ASTRA_STREAM_RESILIENCE_FAIL/,
    );
    assert.equal(calls, 1);
    assert.equal(new FileCheckpointStore(file).load().status, "FAIL");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
