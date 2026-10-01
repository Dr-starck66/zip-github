const VERSION_SUFFIX = /(?:[-_ ]v?\d+|[-_ ]copy|[-_ ]new|[-_ ]final)$/i;

export function normalizeName(name="") {
  return String(name).trim().toLowerCase().replace(/\s+/g, "-");
}

export function looksLikeClone(name, canonical) {
  const n = normalizeName(name);
  const c = normalizeName(canonical);
  if (n === c) return false;
  if (!n.startsWith(c)) return false;
  const suffix = n.slice(c.length);
  return /^[-_ ](?:v?\d+|copy|new|final)$/i.test(suffix);
}

export function classifyInventory({services=[], canonicalService, allowedSupport=[]}) {
  const canonical = services.filter(s => normalizeName(s.name) === normalizeName(canonicalService));
  const allowed = new Set(allowedSupport.map(normalizeName));
  const clones = [];
  const unknown = [];

  for (const service of services) {
    const name = normalizeName(service.name);
    if (name === normalizeName(canonicalService)) continue;
    if (allowed.has(name)) continue;
    if (looksLikeClone(service.name, canonicalService) || VERSION_SUFFIX.test(name)) clones.push(service);
    else unknown.push(service);
  }

  return {
    canonicalCount: canonical.length,
    canonical: canonical[0] || null,
    clones,
    unknown,
    state: canonical.length === 1 && clones.length === 0 ? "PASS" :
           canonical.length === 1 ? "PARTIAL" : "FAIL"
  };
}

export function releaseGate(input) {
  const inventory = classifyInventory(input);
  const checks = {
    canonicalExactlyOne: inventory.canonicalCount === 1,
    deploymentSuccess: input.latestDeploymentStatus === "SUCCESS",
    healthcheckConfigured: Boolean(input.healthcheckPath),
    sourceKnown: Boolean(input.sourceRepo || input.sourceImage),
    customDomainVerified: input.customDomainVerified === true,
    publicRouteVerified: input.publicRouteVerified === true,
    sourceRevisionVerified: input.sourceRevisionVerified !== false,
    noUndeclaredClones: inventory.clones.length === 0
  };

  const hard = ["canonicalExactlyOne","deploymentSuccess","healthcheckConfigured","sourceKnown","sourceRevisionVerified"];
  if (hard.some(k => !checks[k])) return {state:"FAIL", checks, inventory};

  if (!checks.customDomainVerified || !checks.publicRouteVerified || !checks.noUndeclaredClones || inventory.unknown.length) {
    return {state:"PARTIAL", checks, inventory};
  }
  return {state:"PASS", checks, inventory};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let buf="";
  for await (const chunk of process.stdin) buf += chunk;
  const input = JSON.parse(buf || "{}");
  console.log(JSON.stringify(releaseGate(input), null, 2));
}
