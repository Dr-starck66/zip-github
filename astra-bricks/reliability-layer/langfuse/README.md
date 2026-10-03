# Langfuse adapter

ASTRA uses Railway native tracing immediately and keeps Langfuse optional.

Current upstream Langfuse accepts OpenTelemetry traces at:

`POST /api/public/otel/v1/traces`

Direct OpenTelemetry exporters must use the current Langfuse ingestion contract.
Do not mark Langfuse PASS merely because credentials exist. Runtime proof requires
a successful trace ingestion plus a retrievable observation/trace.

Expected environment variables:

- `LANGFUSE_BASE_URL`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`

Until those are configured and an ingestion probe succeeds, the project adapter
must report Langfuse as `UNCONFIGURED` or `UNVERIFIED`.
