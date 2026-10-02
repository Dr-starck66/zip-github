import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutoScenes,
  evaluateProbe,
  normalizeConfig,
  parseFormats,
  slugify,
} from "./lib/astra-launch-video.mjs";

test("normalizes a global launch-video config", () => {
  const config = normalizeConfig({ name: "BetGPT", url: "https://betgpt.live", tagline: "Football, proven." });
  assert.equal(config.project.name, "BetGPT");
  assert.deepEqual(config.formats, ["landscape", "vertical", "square"]);
  assert.equal(config.sceneCount, 3);
});

test("normalizes explicit capture actions and DOM proof rules", () => {
  const config = normalizeConfig({
    capture: {
      preseedLocalStorage: { accepted: 1 },
      clickSelectors: ["#accept"],
      clickText: ["Continue"],
      forbiddenText: ["Sign in"],
      requiredText: ["Dashboard"],
      waitAfterActionsMs: 1200,
    },
  });
  assert.deepEqual(config.capture.preseedLocalStorage, { accepted: "1" });
  assert.deepEqual(config.capture.clickSelectors, ["#accept"]);
  assert.deepEqual(config.capture.clickText, ["Continue"]);
  assert.deepEqual(config.capture.forbiddenText, ["Sign in"]);
  assert.deepEqual(config.capture.requiredText, ["Dashboard"]);
  assert.equal(config.capture.waitAfterActionsMs, 1200);
});

test("rejects unsupported formats and invalid URL schemes", () => {
  assert.throws(() => parseFormats("landscape,hologram"), /FORMAT_INVALID/);
  assert.throws(() => normalizeConfig({ url: "ftp://example.com" }), /URL_INVALID/);
});

test("auto storyboard always uses every expected scene slot", () => {
  const config = normalizeConfig({ name: "ASTRA BUILDER", durationSeconds: 18, sceneCount: 3 });
  const scenes = buildAutoScenes(config, ["a.png", "b.png", "c.png"]);
  assert.equal(scenes.length, 3);
  assert.equal(scenes.reduce((sum, s) => sum + s.durationSeconds, 0), 18);
  assert.equal(scenes[0].text, config.project.tagline);
});

test("proof evaluator fails closed on missing audio, wrong resolution and black video", () => {
  const baseProbe = {
    streams: [
      { codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "25/1" },
      { codec_type: "audio", codec_name: "aac" },
    ],
    format: { duration: "18.0" },
  };
  const expected = {
    width: 1920,
    height: 1080,
    minFps: 24,
    durationSeconds: 18,
    durationToleranceSeconds: 1.25,
    requireAudio: true,
    maxBlackSeconds: 1.25,
    minBytes: 100,
    sceneCount: 3,
  };
  const sceneManifest = { scenes: [1, 2, 3].map((id) => ({ id, sha256: "x", bytes: 1 })) };
  assert.equal(evaluateProbe({ probe: baseProbe, expected, black: { maxBlackSeconds: 0 }, fileBytes: 1000, sceneManifest }).status, "PASS");

  const noAudio = structuredClone(baseProbe);
  noAudio.streams = noAudio.streams.filter((s) => s.codec_type !== "audio");
  assert.equal(evaluateProbe({ probe: noAudio, expected, black: { maxBlackSeconds: 0 }, fileBytes: 1000, sceneManifest }).status, "FAIL");

  const wrongSize = structuredClone(baseProbe);
  wrongSize.streams[0].width = 1280;
  assert.equal(evaluateProbe({ probe: wrongSize, expected, black: { maxBlackSeconds: 0 }, fileBytes: 1000, sceneManifest }).status, "FAIL");

  assert.equal(evaluateProbe({ probe: baseProbe, expected, black: { maxBlackSeconds: 8 }, fileBytes: 1000, sceneManifest }).status, "FAIL");
});

test("slugification is deterministic", () => {
  assert.equal(slugify("ASTRA Launch Vidéo Ω"), "astra-launch-video");
});
