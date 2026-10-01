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

export function detectDomainState({
  expectedDomain,
  listedCustomDomains=[],
  createAttempt=null
}={}) {
  const wanted = normalizeName(expectedDomain);
  const listed = listedCustomDomains.map(d => normalizeName(typeof d === "string" ? d : d?.domain));
  if (wanted && listed.includes(wanted)) {
    return {state:"ATTACHED", retry:false, reason:"domain listed on canonical service"};
  }

  const message = String(createAttempt?.error || createAttempt?.message || "");
  if (
    wanted &&
    createAttempt?.attempted === true &&
    createAttempt?.success === false &&
    /failed to create custom domain/i.test(message) &&
    listed.length === 0
  ) {
    return {
      state:"CLAIM_STUCK_SUSPECTED",
      retry:false,
      reason:"customDomainCreate failed while canonical list_domains is empty; stop blind retries and escalate release/ownership verification"
    };
  }

  if (createAttempt?.attempted === true && createAttempt?.success === false) {
    return {state:"CREATE_FAILED", retry:false, reason:message || "custom domain create failed"};
  }

  return {state:"MISSING", retry:true, reason:"domain not attached yet"};
}

export function releaseGate(input) {
  const inventory = classifyInventory(input);
  const domain = input.domainState || detectDomainState({
    expectedDomain: input.expectedDomain,
    listedCustomDomains: input.listedCustomDomains,
    createAttempt: input.createAttempt
  });

  const checks = {
    canonicalExactlyOne: inventory.canonicalCount === 1,
    deploymentSuccess: input.latestDeploymentStatus === "SUCCESS",
    healthcheckConfigured: Boolean(input.healthcheckPath),
    sourceKnown: Boolean(input.sourceRepo || input.sourceImage),
    customDomainVerified: input.customDomainVerified === true || input.verifiedAlias === true,
    publicRouteVerified: input.publicRouteVerified === true,
    sourceRevisionVerified: input.sourceRevisionVerified !== false,
    noUndeclaredClones: inventory.clones.length === 0,
    noStuckDomainClaim: domain.state !== "CLAIM_STUCK_SUSPECTED",
    aliasIsRoutingOnly: input.verifiedAlias !== true || input.aliasMode === "ROUTER_ONLY"
  };

  const hard = ["canonicalExactlyOne","deploymentSuccess","healthcheckConfigured","sourceKnown","sourceRevisionVerified"];
  if (hard.some(k => !checks[k])) return {state:"FAIL", checks, inventory, domain};

  if (!checks.customDomainVerified || !checks.publicRouteVerified || !checks.noUndeclaredClones || inventory.unknown.length || !checks.noStuckDomainClaim || !checks.aliasIsRoutingOnly) {
    return {state:"PARTIAL", checks, inventory, domain};
  }
  return {state:"PASS", checks, inventory, domain};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let buf="";
  for await (const chunk of process.stdin) buf += chunk;
  const input = JSON.parse(buf || "{}");
  console.log(JSON.stringify(releaseGate(input), null, 2));
}
