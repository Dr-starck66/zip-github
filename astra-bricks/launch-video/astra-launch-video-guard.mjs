#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildAutoScenes,
  evaluateProbe,
  normalizeConfig,
  probeVideo,
  renderLaunchVideos,
} from "./lib/astra-launch-video.mjs";

function ffmpegFixture(file, color) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=${color}:s=1280x720:d=1`,
    "-frames:v", "1", file,
  ], { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`ASTRA_LAUNCH_VIDEO_GUARD_FIXTURE_FAIL ${result.stderr || result.error}`);
}

const dir = mkdtempSync(path.join(os.tmpdir(), "astra-launch-video-guard-"));
try {
  const captures = path.join(dir, "captures");
  const output = path.join(dir, "out");
  mkdirSync(captures, { recursive: true });
  ["0x17325c", "0x5c1744", "0x175c39"].forEach((color, index) => ffmpegFixture(path.join(captures, `${index + 1}.png`), color));

  const config = normalizeConfig({
    name: "ASTRA Guard Fixture",
    tagline: "Proof before PASS",
    durationSeconds: 6,
    sceneCount: 3,
    formats: ["landscape"],
    proof: { minBytes: 5_000, maxBlackSeconds: 1.25, requireAudio: true },
  });
  const scenes = buildAutoScenes(config, [1, 2, 3].map((n) => path.join(captures, `${n}.png`)));
  const result = renderLaunchVideos({ config, scenes, outDir: output });
  if (result.status !== "PASS" || result.outputs.length !== 1) throw new Error("ASTRA_LAUNCH_VIDEO_GUARD_RENDER_NOT_PASS");

  const realProbe = probeVideo(result.outputs[0].file);
  const expected = {
    width: 1920, height: 1080, minFps: 24, durationSeconds: 6,
    durationToleranceSeconds: 1.25, requireAudio: true, maxBlackSeconds: 1.25,
    minBytes: 5_000, sceneCount: 3,
  };
  const manifest = { scenes: [1,2,3].map((id) => ({ id, sha256: "proof", bytes: 1 })) };

  const falsePassMissingAudio = structuredClone(realProbe);
  falsePassMissingAudio.streams = falsePassMissingAudio.streams.filter((s) => s.codec_type !== "audio");
  if (evaluateProbe({ probe: falsePassMissingAudio, expected, black: { maxBlackSeconds: 0 }, fileBytes: 10_000, sceneManifest: manifest }).status !== "FAIL") {
    throw new Error("ASTRA_LAUNCH_VIDEO_GUARD_FALSE_PASS missing_audio_not_detected");
  }
  const falsePassWrongSize = structuredClone(realProbe);
  const video = falsePassWrongSize.streams.find((s) => s.codec_type === "video");
  video.width = 640;
  if (evaluateProbe({ probe: falsePassWrongSize, expected, black: { maxBlackSeconds: 0 }, fileBytes: 10_000, sceneManifest: manifest }).status !== "FAIL") {
    throw new Error("ASTRA_LAUNCH_VIDEO_GUARD_FALSE_PASS wrong_resolution_not_detected");
  }
  if (evaluateProbe({ probe: realProbe, expected, black: { maxBlackSeconds: 9 }, fileBytes: 10_000, sceneManifest: manifest }).status !== "FAIL") {
    throw new Error("ASTRA_LAUNCH_VIDEO_GUARD_FALSE_PASS black_video_not_detected");
  }

  console.log("ASTRA_LAUNCH_VIDEO_GUARD_PASS render=true ffprobe=true blackdetect=true audio=true scenes=3 false_pass_tests=3");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
