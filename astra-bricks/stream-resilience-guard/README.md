# ASTRA STREAM RESILIENCE GUARD Ω

Canonical reusable ASTRA brick.

Purpose: prevent transient stream/cache/network failures from forcing a whole workflow to restart.

Core contract:
- atomic checkpoint after each successful step;
- resume compatible completed steps;
- retry only transient failures, including `Stream cache expired`;
- bounded timeout and exponential backoff;
- idempotency required for side effects;
- fail closed on semantic/business errors.

Proof standard:
1. classify `Stream cache expired` as transient;
2. recover without replaying completed work;
3. resume after process-level restart;
4. do not retry non-transient business failures;
5. execute the guard inside mandatory release gates.

BetGPT proof:
- exact recovery workflow run: 36936238046 — SUCCESS;
- main Never-Fail gate run: 36938023994 — SUCCESS.

Status: PROVEN / reusable / fail-closed.
