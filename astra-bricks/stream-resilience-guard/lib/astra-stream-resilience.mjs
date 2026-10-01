import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ASTRA_STREAM_RESILIENCE_SCHEMA = "astra-stream-resilience/v1";

const DEFAULT_TRANSIENT_PATTERNS = [
  /stream cache expired/i,
  /stream[^\n]*expired/i,
  /cache[^\n]*expired/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /EAI_AGAIN/i,
  /socket hang up/i,
  /fetch failed/i,
  /network[^\n]*(?:reset|timeout|temporar)/i,
  /temporarily unavailable/i,
  /connection closed/i,
];

function errorText(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function isTransientStreamError(error) {
  const text = errorText(error);
  return DEFAULT_TRANSIENT_PATTERNS.some((pattern) => pattern.test(text));
}

export function computeBackoffMs(attempt, baseMs = 500, capMs = 15_000) {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(capMs, baseMs * 2 ** exponent);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FileCheckpointStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
  }

  load() {
    try {
      return JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  save(snapshot) {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    renameSync(tmp, this.filePath);
  }

  clear() {
    rmSync(this.filePath, { force: true });
  }
}

function serializable(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new Error("ASTRA_STREAM_RESULT_NOT_SERIALIZABLE");
  }
}

async function runWithTimeout(run, timeoutMs, context) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => run({ ...context, signal: controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error("ASTRA_STREAM_STEP_TIMEOUT"));
          reject(new Error(`ASTRA_STREAM_STEP_TIMEOUT after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function blankSnapshot(key, version) {
  return {
    schema: ASTRA_STREAM_RESILIENCE_SCHEMA,
    key,
    version,
    status: "RUNNING",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    resumedSteps: 0,
    retriedSteps: 0,
    steps: {},
  };
}

/**
 * Run a workflow that can survive transient stream/cache/network failures.
 *
 * Contract:
 * - every step id is stable;
 * - side-effecting steps MUST be idempotent for the same workflow key;
 * - step results MUST be JSON-serializable if later steps depend on them;
 * - fatal/business-logic errors are never silently retried.
 */
export async function runResumableWorkflow({
  key,
  version = "1",
  checkpointPath = path.join("artifacts", "resilience", `${key}.json`),
  steps,
  maxAttempts = 4,
  timeoutMs = 30_000,
  backoffBaseMs = 500,
  classifyTransient = isTransientStreamError,
  onEvent = () => {},
}) {
  if (!key || !Array.isArray(steps) || !steps.length) {
    throw new Error("ASTRA_STREAM_CONFIG_ERROR");
  }

  const ids = steps.map((step) => String(step.id || "").trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error("ASTRA_STREAM_STEP_IDS_INVALID");
  }

  const store = new FileCheckpointStore(checkpointPath);
  const previous = store.load();
  const snapshot =
    previous?.schema === ASTRA_STREAM_RESILIENCE_SCHEMA &&
    previous?.key === key &&
    previous?.version === version
      ? previous
      : blankSnapshot(key, version);

  snapshot.status = "RUNNING";
  snapshot.updatedAt = new Date().toISOString();
  snapshot.completedAt = null;
  store.save(snapshot);

  const results = new Map();
  let usedCheckpoint = false;
  let usedRetry = false;

  for (const step of steps) {
    const id = String(step.id);
    const fingerprint = String(step.fingerprint ?? version);
    const saved = snapshot.steps[id];

    if (saved?.status === "PASS" && saved?.fingerprint === fingerprint) {
      usedCheckpoint = true;
      snapshot.resumedSteps = Number(snapshot.resumedSteps || 0) + 1;
      results.set(id, saved.result ?? null);
      onEvent({ type: "STEP_RESUMED", id, attempt: saved.attempts || 1 });
      continue;
    }

    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      onEvent({ type: "STEP_START", id, attempt });
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();

      try {
        const result = serializable(
          await runWithTimeout(step.run, Number(step.timeoutMs ?? timeoutMs), {
            key,
            version,
            id,
            attempt,
            results,
          }),
        );

        snapshot.steps[id] = {
          status: "PASS",
          fingerprint,
          attempts: attempt,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedMs,
          result,
        };
        if (attempt > 1) {
          usedRetry = true;
          snapshot.retriedSteps = Number(snapshot.retriedSteps || 0) + 1;
        }
        snapshot.updatedAt = new Date().toISOString();
        store.save(snapshot);
        results.set(id, result);
        onEvent({ type: attempt > 1 ? "STEP_RECOVERED" : "STEP_PASS", id, attempt });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const transient = Boolean(classifyTransient(error));
        snapshot.steps[id] = {
          status: transient ? "RETRYABLE_FAIL" : "FAIL",
          fingerprint,
          attempts: attempt,
          startedAt,
          failedAt: new Date().toISOString(),
          durationMs: Date.now() - startedMs,
          transient,
          error: errorText(error),
        };
        snapshot.updatedAt = new Date().toISOString();
        store.save(snapshot);
        onEvent({ type: transient ? "STEP_RETRYABLE_FAIL" : "STEP_FAIL", id, attempt, error: errorText(error) });

        if (!transient || attempt >= maxAttempts) break;
        usedRetry = true;
        await sleep(computeBackoffMs(attempt, backoffBaseMs));
      }
    }

    if (lastError) {
      snapshot.status = "FAIL";
      snapshot.failedStep = id;
      snapshot.failedAt = new Date().toISOString();
      snapshot.updatedAt = snapshot.failedAt;
      store.save(snapshot);
      const wrapped = new Error(`ASTRA_STREAM_RESILIENCE_FAIL step=${id}: ${errorText(lastError)}`);
      wrapped.cause = lastError;
      throw wrapped;
    }
  }

  snapshot.status = usedCheckpoint || usedRetry ? "RESUMED" : "PASS";
  snapshot.completedAt = new Date().toISOString();
  snapshot.updatedAt = snapshot.completedAt;
  store.save(snapshot);
  onEvent({ type: "WORKFLOW_PASS", status: snapshot.status });

  return {
    status: snapshot.status,
    checkpointPath: store.filePath,
    resumed: usedCheckpoint,
    retried: usedRetry,
    results: Object.fromEntries(results),
  };
}
