# ASTRA LAUNCH VIDEO Ω

Canonical reusable ASTRA brick inspired by the core idea behind `latent-spaces/brag`: a finished project should immediately become a short shareable launch video.

## One-command contract

After injection into a Node project:

```bash
npm run launch:video -- --url https://example.com --name "My Project" --tagline "Built. Proven. Ready." --out dist/launch-video
```

The command captures the real deployed product with Playwright (when capture mode is used), builds a three-scene storyboard, renders social variants with FFmpeg and refuses PASS unless each output passes the proof gate.

Default outputs:
- `*-landscape.mp4` — 1920×1080
- `*-vertical.mp4` — 1080×1920
- `*-square.mp4` — 1080×1080
- per-video `*.proof.json`
- `launch-video-report.json`

## Proof gate

PASS requires:
- video stream present;
- exact expected resolution;
- ≥24 fps;
- duration within tolerance;
- audio stream present;
- no prolonged black interval;
- minimum file size;
- expected scene manifest complete;
- mutation tests prove that missing audio, wrong resolution and black-video faults are detected.

## Runtime

Node.js 22+ is the target runtime. FFmpeg/ffprobe are required and are installed explicitly by the supplied GitHub Actions workflows rather than assumed to exist on the runner. Playwright is only required for automatic live-site capture.

## Providers

`native-ffmpeg` is the default renderer and requires no paid API. BRAG/Hyperframes can be added later as an optional renderer, but ASTRA LAUNCH VIDEO Ω is deliberately not locked to it.

## Global pipeline

`BUILD → TEST → DEPLOY → PROOF GATE → ASTRA LAUNCH VIDEO Ω → SOCIAL`

Scope is catch-all: all past, present and future ASTRA projects with a demonstrable product surface.
