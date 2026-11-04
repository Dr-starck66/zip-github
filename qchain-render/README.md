# ASTRA Q-CHAIN v0.6 — Render Free encrypted test lab

The public Git branch stores only AES-256-GCM ciphertext. The original recovered
blockchain source is in a private GitHub branch. The random decryption key is
supplied to the Render service as QCHAIN_BUNDLE_KEY (not in this repository).

- Decryption occurs at runtime, after Docker image build, on an ephemeral filesystem.
- Every start checks AEAD authenticity and original source SHA-256 before execution.
- Four validator processes on one host; NOT four independent virtual machines.
- Read-only /health and /status, no public transaction/signing RPC.
- Render Free sleeps on inactivity and loses local chain state on restart.
- LAB ONLY. Never use for financial assets, identities or production consensus.
- $0 incremental spend intended; select plan=free; no disks or paid data stores.
