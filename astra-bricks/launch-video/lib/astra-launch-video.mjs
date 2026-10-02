import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

export const FORMAT_PRESETS = Object.freeze({
  landscape: { width: 1920, height: 1080, fps: 25 },
  vertical: { width: 1080, height: 1920, fps: 25 },
  square: { width: 1080, height: 1080, fps: 25 },
});

export function slugify(value) {
  return String(value || "project")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

export function parseFormats(value) {
  const raw = Array.isArray(value) ? value : String(value || "landscape,vertical,square").split(",");
  const formats = [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))];
  for (const format of formats) {
    if (!FORMAT_PRESETS[format]) throw new Error(`ASTRA_LAUNCH_VIDEO_FORMAT_INVALID ${format}`);
  }
  if (!formats.length) throw new Error("ASTRA_LAUNCH_VIDEO_FORMATS_EMPTY");
  return formats;
}

export function normalizeConfig(input = {}) {
  const project = input.project || {};
  const durationSeconds = Number(input.durationSeconds ?? 18);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 6 || durationSeconds > 60) {
    throw new Error("ASTRA_LAUNCH_VIDEO_DURATION_INVALID expected=6..60");
  }
  const name = String(project.name || input.name || "Untitled project").trim();
  const tagline = String(project.tagline || input.tagline || "Built. Proven. Ready to launch.").trim();
  const url = String(project.url || input.url || "").trim();
  if (url && !/^https?:\/\//i.test(url)) throw new Error("ASTRA_LAUNCH_VIDEO_URL_INVALID");
  const formats = parseFormats(input.formats);
  const sceneCount = Math.max(3, Math.min(5, Number(input.sceneCount || 3)));
  return {
    schema: "astra-launch-video-config/v1",
    project: { name, tagline, url },
    durationSeconds,
    sceneCount,
    formats,
    proof: {
      requireAudio: input.proof?.requireAudio !== false,
      maxBlackSeconds: Number(input.proof?.maxBlackSeconds ?? 1.25),
      durationToleranceSeconds: Number(input.proof?.durationToleranceSeconds ?? 1.25),
      minBytes: Number(input.proof?.minBytes ?? 50_000),
    },
    capture: {
      preseedLocalStorage: input.capture?.preseedLocalStorage && typeof input.capture.preseedLocalStorage === "object"
        ? Object.fromEntries(Object.entries(input.capture.preseedLocalStorage).map(([key, value]) => [String(key), String(value)]))
        : {},
      clickSelectors: Array.isArray(input.capture?.clickSelectors) ? input.capture.clickSelectors.map(String).filter(Boolean) : [],
      clickText: Array.isArray(input.capture?.clickText) ? input.capture.clickText.map(String).filter(Boolean) : [],
      optionalClickSelectors: Array.isArray(input.capture?.optionalClickSelectors) ? input.capture.optionalClickSelectors.map(String).filter(Boolean) : [],
      optionalClickText: Array.isArray(input.capture?.optionalClickText) ? input.capture.optionalClickText.map(String).filter(Boolean) : [],
      forbiddenText: Array.isArray(input.capture?.forbiddenText) ? input.capture.forbiddenText.map(String).filter(Boolean) : [],
      requiredText: Array.isArray(input.capture?.requiredText) ? input.capture.requiredText.map(String).filter(Boolean) : [],
      waitAfterActionsMs: Math.max(0, Math.min(10_000, Number(input.capture?.waitAfterActionsMs ?? 750))),
    },
  };
}

export function buildAutoScenes(config, captureFiles) {
  if (!Array.isArray(captureFiles) || !captureFiles.length) {
    throw new Error("ASTRA_LAUNCH_VIDEO_CAPTURE_MISSING");
  }
  const desired = config.sceneCount || 3;
  const texts = [
    config.project.tagline,
    `See ${config.project.name} in action`,
    "Built → tested → deployed → proven",
    "Ready to share",
    config.project.url || config.project.name,
  ];
  const perScene = config.durationSeconds / desired;
  return Array.from({ length: desired }, (_, index) => ({
    id: `scene-${index + 1}`,
    image: captureFiles[index % captureFiles.length],
    text: texts[index % texts.length],
    durationSeconds: perScene,
  }));
}

function run(command, args, options = {}) {
  const proc = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture === false ? "inherit" : "pipe",
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
  });
  if (proc.error) throw proc.error;
  if (proc.status !== 0) {
    const tail = `${proc.stderr || ""}\n${proc.stdout || ""}`.trim().slice(-5000);
    throw new Error(`ASTRA_LAUNCH_VIDEO_COMMAND_FAIL command=${command} exit=${proc.status}\n${tail}`);
  }
  return { stdout: String(proc.stdout || ""), stderr: String(proc.stderr || "") };
}

export function assertDependencies() {
  for (const command of ["ffmpeg", "ffprobe"]) {
    const check = spawnSync(command, ["-version"], { encoding: "utf8" });
    if (check.error || check.status !== 0) throw new Error(`ASTRA_LAUNCH_VIDEO_DEPENDENCY_MISSING ${command}`);
  }
  return true;
}

export async function captureWebsite({
  url,
  outDir,
  sceneCount = 3,
  viewport = { width: 1440, height: 900 },
  preseedLocalStorage = {},
  clickSelectors = [],
  clickText = [],
  optionalClickSelectors = [],
  optionalClickText = [],
  forbiddenText = [],
  requiredText = [],
  waitAfterActionsMs = 750,
}) {
  if (!url) throw new Error("ASTRA_LAUNCH_VIDEO_CAPTURE_URL_REQUIRED");
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("ASTRA_LAUNCH_VIDEO_PLAYWRIGHT_MISSING install=playwright");
  }
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport });
    const seedEntries = Object.entries(preseedLocalStorage || {});
    if (seedEntries.length) {
      await context.addInitScript((entries) => {
        try {
          for (const [key, value] of entries) localStorage.setItem(key, value);
        } catch {
          // Fail-safe: DOM proof below still blocks forbidden overlays from passing.
        }
      }, seedEntries);
    }
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (!response || response.status() >= 400) {
      throw new Error(`ASTRA_LAUNCH_VIDEO_CAPTURE_HTTP_FAIL status=${response?.status?.() ?? "none"}`);
    }
    await page.waitForTimeout(750);

    for (const selector of clickSelectors) {
      const locator = page.locator(selector).first();
      if (!(await locator.isVisible().catch(() => false))) {
        throw new Error(`ASTRA_LAUNCH_VIDEO_CAPTURE_ACTION_MISSING selector=${selector}`);
      }
      await locator.click({ timeout: 5_000 });
    }
    for (const text of clickText) {
      const locator = page.getByText(text, { exact: false }).first();
      if (!(await locator.isVisible().catch(() => false))) {
        throw new Error(`ASTRA_LAUNCH_VIDEO_CAPTURE_ACTION_MISSING text=${text}`);
      }
      await locator.click({ timeout: 5_000 });
    }
    for (const selector of optionalClickSelectors) {
      const locator = page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        await locator.click({ timeout: 5_000 });
      }
    }
    for (const text of optionalClickText) {
      const locator = page.getByText(text, { exact: false }).first();
      if (await locator.isVisible().catch(() => false)) {
        await locator.click({ timeout: 5_000 });
      }
    }
    if (clickSelectors.length || clickText.length || optionalClickSelectors.length || optionalClickText.length || seedEntries.length) {
      await page.waitForTimeout(waitAfterActionsMs);
    }

    const bodyText = await page.locator("body").innerText().catch(() => "");
    for (const text of forbiddenText) {
      if (bodyText.includes(text)) {
        throw new Error(`ASTRA_LAUNCH_VIDEO_CAPTURE_FORBIDDEN_TEXT text=${text}`);
      }
    }
    for (const text of requiredText) {
      if (!bodyText.includes(text)) {
        throw new Error(`ASTRA_LAUNCH_VIDEO_CAPTURE_REQUIRED_TEXT_MISSING text=${text}`);
      }
    }

    const height = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    const positions = Array.from({ length: sceneCount }, (_, index) => {
      if (sceneCount === 1) return 0;
      return Math.round(((height - viewport.height) * index) / (sceneCount - 1));
    });
    const files = [];
    for (let index = 0; index < positions.length; index += 1) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), Math.max(0, positions[index]));
      await page.waitForTimeout(450);
      const file = path.join(outDir, `capture-${String(index + 1).padStart(2, "0")}.png`);
      await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
      files.push(file);
    }
    return files;
  } finally {
    await browser.close();
  }
}

function escapeFilterPath(file) {
  return path.resolve(file).replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

function segmentVideo({ scene, preset, outFile, workDir }) {
  const duration = Number(scene.durationSeconds);
  const fadeOutStart = Math.max(0.1, duration - 0.35).toFixed(3);
  const fontSize = Math.max(34, Math.round(preset.height * 0.045));
  const textFile = path.join(workDir, `${scene.id}.txt`);
  writeFileSync(textFile, String(scene.text || ""), "utf8");
  const frames = Math.max(1, Math.round(duration * preset.fps));
  const zoomStep = preset.height > preset.width ? "0.00045" : "0.00035";
  const filter = [
    `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=increase`,
    `crop=${preset.width}:${preset.height}`,
    `zoompan=z='min(zoom+${zoomStep},1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${preset.width}x${preset.height}:fps=${preset.fps}`,
    "fade=t=in:st=0:d=0.35",
    `fade=t=out:st=${fadeOutStart}:d=0.35`,
    `drawtext=font='DejaVu Sans':textfile='${escapeFilterPath(textFile)}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.48:boxborderw=22:x=(w-text_w)/2:y=h-text_h-${Math.max(64, Math.round(preset.height * 0.06))}`,
  ].join(",");
  const audioExpr = `aevalsrc=0.004*(sin(2*PI*110*t)+0.65*sin(2*PI*165*t)+0.4*sin(2*PI*220*t)):s=48000:d=${duration}`;
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-loop", "1", "-t", String(duration), "-i", scene.image,
    "-f", "lavfi", "-i", audioExpr,
    "-vf", filter,
    "-af", `afade=t=in:st=0:d=0.35,afade=t=out:st=${fadeOutStart}:d=0.35`,
    "-map", "0:v:0", "-map", "1:a:0",
    "-r", String(preset.fps),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart",
    outFile,
  ]);
}

export function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function probeVideo(file) {
  const result = run("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", file,
  ]);
  return JSON.parse(result.stdout);
}

export function detectBlack(file) {
  const proc = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "info", "-i", file,
    "-vf", "blackdetect=d=0.4:pix_th=0.05", "-an", "-f", "null", "-",
  ], { encoding: "utf8" });
  if (proc.error) throw proc.error;
  if (proc.status !== 0) throw new Error(`ASTRA_LAUNCH_VIDEO_BLACKDETECT_FAIL exit=${proc.status}`);
  const text = `${proc.stderr || ""}\n${proc.stdout || ""}`;
  const durations = [...text.matchAll(/black_duration:([0-9.]+)/g)].map((m) => Number(m[1]));
  return { maxBlackSeconds: durations.length ? Math.max(...durations) : 0, intervals: durations.length };
}

function rateToNumber(rate) {
  const [a, b = "1"] = String(rate || "0/1").split("/");
  const denominator = Number(b) || 1;
  return Number(a) / denominator;
}

export function evaluateProbe({ probe, expected, black = { maxBlackSeconds: 0 }, fileBytes = Infinity, sceneManifest }) {
  const video = (probe.streams || []).find((s) => s.codec_type === "video");
  const audio = (probe.streams || []).find((s) => s.codec_type === "audio");
  const duration = Number(probe.format?.duration || video?.duration || 0);
  const fps = rateToNumber(video?.avg_frame_rate || video?.r_frame_rate);
  const checks = {
    videoStream: Boolean(video),
    width: Number(video?.width) === expected.width,
    height: Number(video?.height) === expected.height,
    fps: fps >= (expected.minFps ?? 24),
    duration: Math.abs(duration - expected.durationSeconds) <= (expected.durationToleranceSeconds ?? 1.25),
    audio: expected.requireAudio === false ? true : Boolean(audio),
    black: Number(black.maxBlackSeconds || 0) <= (expected.maxBlackSeconds ?? 1.25),
    fileSize: Number(fileBytes) >= (expected.minBytes ?? 50_000),
    scenes: !sceneManifest || (
      Array.isArray(sceneManifest.scenes) &&
      sceneManifest.scenes.length === expected.sceneCount &&
      sceneManifest.scenes.every((s) => s.sha256 && s.bytes > 0)
    ),
  };
  return {
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    checks,
    observed: { width: video?.width, height: video?.height, fps, duration, hasAudio: Boolean(audio), ...black, fileBytes },
  };
}

export function proveVideo({ file, config, format, sceneManifest }) {
  const preset = FORMAT_PRESETS[format];
  if (!preset) throw new Error(`ASTRA_LAUNCH_VIDEO_FORMAT_INVALID ${format}`);
  const report = evaluateProbe({
    probe: probeVideo(file),
    black: detectBlack(file),
    fileBytes: statSync(file).size,
    sceneManifest,
    expected: {
      width: preset.width,
      height: preset.height,
      minFps: 24,
      durationSeconds: config.durationSeconds,
      durationToleranceSeconds: config.proof.durationToleranceSeconds,
      requireAudio: config.proof.requireAudio,
      maxBlackSeconds: config.proof.maxBlackSeconds,
      minBytes: config.proof.minBytes,
      sceneCount: config.sceneCount,
    },
  });
  if (report.status !== "PASS") {
    throw new Error(`ASTRA_LAUNCH_VIDEO_PROOF_FAIL format=${format} report=${JSON.stringify(report)}`);
  }
  return report;
}

export function renderLaunchVideos({ config: rawConfig, scenes, outDir }) {
  assertDependencies();
  const config = normalizeConfig(rawConfig);
  if (!Array.isArray(scenes) || scenes.length !== config.sceneCount) {
    throw new Error(`ASTRA_LAUNCH_VIDEO_SCENE_COUNT_INVALID expected=${config.sceneCount} got=${scenes?.length ?? 0}`);
  }
  for (const scene of scenes) {
    if (!scene.image || !existsSync(scene.image)) throw new Error(`ASTRA_LAUNCH_VIDEO_SCENE_IMAGE_MISSING ${scene.id}`);
  }
  mkdirSync(outDir, { recursive: true });
  const slug = slugify(config.project.name);
  const outputs = [];
  for (const format of config.formats) {
    const preset = FORMAT_PRESETS[format];
    const workDir = path.join(outDir, `.work-${format}`);
    mkdirSync(workDir, { recursive: true });
    const segmentFiles = [];
    const manifestScenes = [];
    for (const scene of scenes) {
      const segment = path.join(workDir, `${scene.id}.mp4`);
      segmentVideo({ scene, preset, outFile: segment, workDir });
      segmentFiles.push(segment);
      manifestScenes.push({ id: scene.id, source: path.resolve(scene.image), sha256: sha256File(segment), bytes: statSync(segment).size });
    }
    const concatFile = path.join(workDir, "concat.txt");
    writeFileSync(concatFile, segmentFiles.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join("\n") + "\n", "utf8");
    const outFile = path.join(outDir, `${slug}-${format}.mp4`);
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", "-movflags", "+faststart", outFile]);
    const sceneManifest = { format, scenes: manifestScenes, expectedDurationSeconds: config.durationSeconds };
    const proof = proveVideo({ file: outFile, config, format, sceneManifest });
    const proofFile = `${outFile}.proof.json`;
    writeFileSync(proofFile, JSON.stringify({ schema: "astra-launch-video-proof/v1", status: proof.status, format, file: path.basename(outFile), sceneManifest, proof }, null, 2) + "\n", "utf8");
    outputs.push({ format, file: outFile, proofFile, proof });
  }
  return { status: "PASS", config, outputs };
}
