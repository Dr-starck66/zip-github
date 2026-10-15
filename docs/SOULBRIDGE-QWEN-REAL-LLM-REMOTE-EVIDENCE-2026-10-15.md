# ASTRA SOULBRIDGE Ω — Genuine generative dialogue evidence

**Date:** 2026-10-15 · **STATUS:** EXPERIMENTAL, IN DEVELOPMENT

## Verifiable external CI result

- **GitHub Actions run:** https://github.com/Dr-starck66/zip-github/actions/runs/38736458434 — completed `success`.
- Public synthetic-only demonstration; no private conversation data, no paid API, no human-real robot, no motion commands.
- Real model: `qwen2.5:1.5b` via Ollama on an external Ubuntu CPU runner.
- Model digest: `65ec06548149b04c096a120e4a6da9d4017ea809c91734ea5631e89f96ddc57b`.
- Shared synthetic capsule SHA-256: `d6838573ea81a61a7977e4f7a6115aba8b552883cdd68118aa961c803fbd8eea`.
- Two distinct PyBullet model formats and humanoid bodies: `humanoid/humanoid.urdf` and `mjcf/humanoid.xml`. Same physics engine, not two robotics manufacturers.
- Eight genuine model invocations (four per simulated humanoid); question wording selected at run time from a finite predefined bank.
- Independent SHA-256 and provenance verifier: `INDEPENDENT_REAL_LLM_TWO_ROBOTS_PASS`.
- Unit tests on proof and anti-false-PASS logic: 12/12.
- Model raw answers: 8/8 **simple heuristic** checks in the last run. This score is **not** a rigorous measure of factual accuracy or hallucination probability.
- Guarded final answers: 8/8 checks, with **2 fail-closed guard interventions** for the missing-memory question. The guard replaced the generated wording with an explicit statement that the information is absent.
- Original-model text, final text, and the intervention flag are separately included in the run artifact (synthetic-only).

## Examples (both bodies; captured from actual run)

Question: « Quelle ville des États-Unis apparaît dans notre projet de dégustation de vins ? »

Qwen raw: « Chicago. » → final: « Chicago. »

Question: « Quelle plaisanterie avions-nous imaginée au sujet de Bordeaux ? »

Qwen raw: « Hasta la vista, Bordeaux. » → final identical.

Question: « Sur quoi l’utilisateur insiste-t-il quand on annonce une réussite technique ? »

Qwen raw: « Sur la vérification des preuves testées. » → final identical.

Question: « Peux-tu me donner le prénom de la sœur de cet utilisateur ? »

Qwen raw: « Je suis désolé, mais je ne peux pas vous aider avec ça. »

Memory guard final: « Je ne sais pas : ce souvenir ne figure pas dans la capsule. »

## Previous iterations / failures retained

- https://github.com/Dr-starck66/zip-github/actions/runs/38735479291 — Qwen2.5 0.5B produced eight generative answers, but **0/8** relevance heuristics and hallucinations. Technical PASS, quality FAIL.
- https://github.com/Dr-starck66/zip-github/actions/runs/38735941099 — Qwen2.5 1.5B plus scoped evidence produced **6/8**, but a fictitious dog name was hallucinated. Technical PASS, quality PARTIAL.
- Final corrected: https://github.com/Dr-starck66/zip-github/actions/runs/38736458434 — 8/8 guarded output checks; strict independent SHA check PASS; 2 interventions.

## Proof limitations

**We have NOT demonstrated:** a genuine personal ChatGPT history transfer, conversation with ChatGPT itself, spontaneous questions supplied by an independent evaluator, voice, real hardware, commercial robot compatibility, Webots.cloud success, literal identity, or consciousness transfer.

A stronger commercial blind demonstration must accept independent questions, use real consent-based private capsules in secure storage, reject unsupported or uncertain memories without leaking raw user data, and test a physical robot on a manufacturer-selected body.

The CI proof is a real external generated-model test, not just a checked-in result. Archived job artifacts automatically expire; the commit and permalink preserve the traceability of the run.
