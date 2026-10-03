# ASTRA RELIABILITY LAYER Ω

Common reliability control plane for Dr Starck projects.

## Purpose

This brick standardizes four failure-prone surfaces without making application availability depend on them:

1. **Gatus** — black-box proof: HTTP status, JSON content and response-time assertions.
2. **LiteLLM** — optional OpenAI-compatible model gateway for retries / routing across local model endpoints.
3. **Trigger.dev** — durable long-running proof jobs with retries.
4. **Langfuse / OpenTelemetry** — optional trace sink. Railway native tracing remains the first zero-configuration trace layer.

## Truth contract

- Observability is **fail-open for the application** and **fail-closed for claims**.
- A missing Gatus/LiteLLM/Trigger/Langfuse credential is reported as `UNCONFIGURED`, never PASS.
- HTTP 200 alone is never enough for a proof gate: expected JSON/body assertions are required.
- Existing app health endpoints stay independent of this layer so monitoring cannot take production down.
- No secret is committed here. Runtime configuration comes only from environment variables.

## Environment contract

- `ASTRA_GATUS_URL` optional Gatus UI/API base.
- `ASTRA_LLM_GATEWAY_BASE` optional LiteLLM-compatible base.
- `ASTRA_LLM_GATEWAY_TOKEN` optional gateway bearer token.
- `TRIGGER_SECRET_KEY` optional Trigger.dev credential.
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` optional Langfuse configuration.
- Project-specific public URLs are supplied to Gatus as `BETGPT_URL`, `AFFILHUNT_URL`, `ASTRA_BUILDER_URL`.

## Deployment policy

This directory is a reusable brick, not a declaration that any external service is running.
Runtime activation is proven separately in each project and reported as PASS / PARTIAL / UNVERIFIED.
