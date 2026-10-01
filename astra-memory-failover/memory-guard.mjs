export const STATES = Object.freeze({
  PASS: "PASS",
  PARTIAL: "PARTIAL",
  FAIL: "FAIL",
  UNVERIFIED: "UNVERIFIED",
});

async function safeCall(fn, ...args) {
  if (typeof fn !== "function") return { ok: false, unavailable: true };
  try {
    return { ok: true, value: await fn(...args) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

export async function readWithFailover(adapters = {}) {
  const order = [
    ["native_memory", adapters.nativeRead],
    ["chatgpt_library", adapters.libraryRead],
    ["github_registry", adapters.githubRead],
  ];
  const attempts = [];
  for (const [source, fn] of order) {
    const result = await safeCall(fn);
    attempts.push({ source, ...result });
    if (result.ok && result.value != null) {
      return { state: STATES.PASS, source, value: result.value, attempts };
    }
  }
  return { state: STATES.FAIL, source: null, value: null, attempts };
}

export async function persistWithFailover(rule, adapters = {}) {
  if (!rule || typeof rule !== "object") {
    throw new TypeError("rule must be an object");
  }

  const stores = [
    ["native_memory", adapters.nativeWrite, adapters.nativeRead],
    ["chatgpt_library", adapters.libraryWrite, adapters.libraryRead],
    ["github_registry", adapters.githubWrite, adapters.githubRead],
  ];

  const attempts = [];
  let verified = 0;
  let durableSuccess = 0;

  for (const [store, write, read] of stores) {
    const writeResult = await safeCall(write, rule);
    const entry = { store, write: writeResult };

    if (writeResult.ok) {
      durableSuccess += 1;
      const readResult = await safeCall(read, rule.id);
      entry.readback = readResult;
      if (readResult.ok && readResult.value != null) verified += 1;
    }

    attempts.push(entry);
  }

  if (verified >= 2) return { state: STATES.PASS, verified, durableSuccess, attempts };
  if (verified >= 1) return { state: STATES.PARTIAL, verified, durableSuccess, attempts };
  if (durableSuccess > 0) return { state: STATES.UNVERIFIED, verified, durableSuccess, attempts };
  return { state: STATES.FAIL, verified, durableSuccess, attempts };
}
