# Mythos Astra Ω — Proof Pack V2

Generated: 2026-09-26

## Verified PASS
### Source integrity
- `engine.js` parses successfully as JavaScript.
- `app.js` parses successfully as JavaScript.
- Engine reports version `2.0.0`.
- Benchmark runner is executable outside the UI with a VM sandbox.

### Regression benchmark
Independent execution performed after the final verdict-function replacement:

| Case | Expected | Actual | Score |
|---|---|---|---:|
| Faux déploiement | FAIL | FAIL | 23 |
| Preuve faible | PARTIAL | PARTIAL | 40 |
| Audit robuste | PASS | PASS | 95 |
| Certitude sans source | FAIL | FAIL | 18 |
| Logs seuls | PARTIAL | PARTIAL | 41 |
| Sources sans contre-test | PARTIAL | PARTIAL | 62 |
| Reproduction forte | PASS | PASS | 79 |
| Affirmation courte | FAIL | FAIL | 29 |

**Result: 8 / 8 = 100% on the embedded regression suite.**

Important: this means 100% agreement with the eight defined regression cases. It does **not** mean 100% factual accuracy or universal reliability.

### Product files
- UI / product shell
- separated audit engine
- Evidence Graph renderer
- export and share logic
- security notes
- OpenAPI target contract
- investor / valuation dossier
- sales brief
- executable Node self-test
- GitHub Actions regression workflow

## PARTIAL / not independently confirmed
### Public hosting
The source is committed to the GitHub Pages repository under `mythos-astra-omega/`. External HTTP confirmation from the assistant environment was unavailable, so public-hosting status must not be labeled PASS from this evidence alone.

### GitHub Actions
The workflow file has been created. No completed workflow run was visible immediately after creation. CI therefore remains PARTIAL until a run is observed.

### Commercial valuation
No external buyer, LOI, paid pilot, or revenue has been evidenced. A 50,000 € asking price can be supported by packaging, IP, replacement cost and strategic fit, but a 50,000 € market valuation is not proven by the software alone.

## False-Pass history
1. First benchmark: 4/8.
2. First calibration: 5/8.
3. Patch audit found the final verdict function had not actually changed.
4. Function replaced wholesale.
5. Final benchmark: 8/8.

This history is intentionally retained as evidence that the protocol detects failures in its own development process.
