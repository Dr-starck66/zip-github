import fs from "node:fs";

const [manifestPath, sourceRepo, sourceSha] = process.argv.slice(2);
if (!manifestPath || !sourceRepo || !sourceSha) {
  console.error("usage: node promote.mjs <manifestPath> <owner/repo> <40-char-sha>");
  process.exit(2);
}
if (!/^[-_.A-Za-z0-9]+\/[-_.A-Za-z0-9]+$/.test(sourceRepo)) {
  throw new Error("ASTRA_PROMOTE_FAIL: invalid sourceRepo");
}
if (!/^[a-f0-9]{40}$/i.test(sourceSha)) {
  throw new Error("ASTRA_PROMOTE_FAIL: immutable 40-char SHA required");
}

const current = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : {};

if (
  String(current.sourceRepo || "") === sourceRepo &&
  String(current.sourceSha || "").toLowerCase() === sourceSha.toLowerCase()
) {
  console.log("ASTRA_PROMOTE_NOOP", sourceRepo + "@" + sourceSha);
  process.exit(0);
}

const next = {
  schema: "astra-railway-singleflight/v1",
  sourceRepo,
  sourceSha,
  promotionKey: sourceRepo + "@" + sourceSha,
  policy: {
    immutableShaOnly: true,
    envSourceOverrides: false,
    oneManifestChangePerPromotion: true
  },
  updatedAt: new Date().toISOString(),
  reason: "ASTRA Railway Single-Flight automatic promotion"
};

fs.writeFileSync(manifestPath, JSON.stringify(next, null, 2) + "\n");
console.log("ASTRA_PROMOTE_CHANGED", next.promotionKey);
