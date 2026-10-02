# ASTRA NO-REPEAT GUARD Ω — GLOBAL CONTRACT

## Objective

A previously established user requirement must remain active by default until it is explicitly revoked. The user must not have to repeat it.

## Scope

Applies to past, current, and future web projects that adopt the ASTRA global contract.

## Mandatory workflow

1. Recover applicable prior requirements from memory/context, repository documentation, manifests, guard scripts, deployment configuration, and available project history.
2. Build a deduplicated requirement ledger before making changes.
3. Resolve conflicts using the most recent explicit requirement.
4. Expand scope beyond the reported page: inspect every affected route, component, template, deployment target, and shared primitive.
5. Prefer a centralized reusable implementation over page-specific patches.
6. Every persistent requirement must have at least one machine-verifiable check.
7. A remembered rule without a machine check is UNGUARDED, never PASS.
8. A regression of any previously accepted requirement is FAIL even if the new feature works.
9. Production PASS requires code + guard + build/deploy + public verification where applicable.
10. Never ask the user to repeat information that is already retrievable.

## Required statuses

- PASS: requirement is implemented, guarded, and verified on the relevant target.
- PARTIAL: implemented but not fully propagated or not production-verified.
- FAIL: requirement is violated or a regression exists.
- UNVERIFIED: evidence is insufficient.
- UNGUARDED: requirement exists but no machine check protects it.

## Integration rule for every site

Each repository should include a machine-readable requirement ledger and a build/release guard. New persistent rules must update both the implementation and the ledger/guard in the same change.
