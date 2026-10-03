import { retry, task } from "@trigger.dev/sdk";

type ProofPayload = {
  name: string;
  url: string;
  expectedService?: string;
  timeoutMs?: number;
};

export const astraProofGate = task({
  id: "astra-proof-gate",
  retry: { maxAttempts: 5 },
  run: async (payload: ProofPayload) => {
    const started = Date.now();
    const response = await retry.fetch(payload.url, {
      signal: AbortSignal.timeout(payload.timeoutMs ?? 15000),
      retry: { maxAttempts: 3 },
      headers: { accept: "application/json" },
    });
    const raw = await response.text();
    let body: any = null;
    try { body = JSON.parse(raw); } catch {}

    const contentOk =
      body?.ok === true &&
      (!payload.expectedService || body?.service === payload.expectedService);

    const status = response.ok && contentOk ? "PASS" : "FAIL";
    const evidence = {
      status,
      name: payload.name,
      httpStatus: response.status,
      contentOk,
      latencyMs: Date.now() - started,
      bodyPreview: raw.slice(0, 300),
      checkedAt: new Date().toISOString(),
    };

    if (status !== "PASS") {
      throw new Error("ASTRA_PROOF_GATE_FAIL " + JSON.stringify(evidence));
    }
    return evidence;
  },
});
