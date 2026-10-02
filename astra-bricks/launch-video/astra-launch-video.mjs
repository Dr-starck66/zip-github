#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildAutoScenes,
  captureWebsite,
  normalizeConfig,
  renderLaunchVideos,
} from "./lib/astra-launch-video.mjs";

function parseArgs(argv) {
  const args = { out: "dist/astra-launch-video" };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--config") args.config = argv[++i];
    else if (token === "--url") args.url = argv[++i];
    else if (token === "--name") args.name = argv[++i];
    else if (token === "--tagline") args.tagline = argv[++i];
    else if (token === "--formats") args.formats = argv[++i];
    else if (token === "--duration") args.durationSeconds = Number(argv[++i]);
    else if (token === "--capture-json") args.captureJson = argv[++i];
    else if (token === "--source-dir") args.sourceDir = argv[++i];
    else if (token === "--out") args.out = argv[++i];
    else if (token === "--json") args.json = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function imagesFromDirectory(dir) {
  if (!existsSync(dir)) throw new Error(`ASTRA_LAUNCH_VIDEO_SOURCE_DIR_MISSING ${dir}`);
  return readdirSync(dir)
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    .sort()
    .map((name) => path.resolve(dir, name));
}

async function main() {
  const args = parseArgs(process.argv);
  let input = {};
  if (args.config) input = JSON.parse(readFileSync(args.config, "utf8"));
  input = {
    ...input,
    name: args.name ?? input.name,
    tagline: args.tagline ?? input.tagline,
    url: args.url ?? input.url,
    formats: args.formats ?? input.formats,
    durationSeconds: args.durationSeconds ?? input.durationSeconds,
    capture: args.captureJson ? JSON.parse(args.captureJson) : input.capture,
  };
  const config = normalizeConfig(input);
  const outDir = path.resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  let captures;
  if (args.sourceDir) {
    captures = imagesFromDirectory(path.resolve(args.sourceDir));
  } else {
    captures = await captureWebsite({
      url: config.project.url,
      outDir: path.join(outDir, "captures"),
      sceneCount: config.sceneCount,
      ...config.capture,
    });
  }
  if (!captures.length) throw new Error("ASTRA_LAUNCH_VIDEO_CAPTURE_EMPTY");
  const scenes = buildAutoScenes(config, captures);
  const result = renderLaunchVideos({ config, scenes, outDir });
  const summary = {
    schema: "astra-launch-video-run/v1",
    status: result.status,
    project: config.project,
    outputs: result.outputs.map((o) => ({ format: o.format, file: o.file, proofFile: o.proofFile, status: o.proof.status })),
  };
  writeFileSync(path.join(outDir, "launch-video-report.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else console.log(`ASTRA_LAUNCH_VIDEO_PASS project=${config.project.name} outputs=${summary.outputs.length}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
