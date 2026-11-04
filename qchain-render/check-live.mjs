#!/usr/bin/env node
/* ASTRA Q-CHAIN Ω — read-only live HTTP proof. Never assert public PASS from local tests. */
const target = process.argv[2]?.replace(/\/$/, '');
if (!target || !/^https:\/\//.test(target) && !/^http:\/\/127\.0\.0\.1:/.test(target)) {
  console.error('Usage: node qchain-render/check-live.mjs https://actual-provider-hostname');
  process.exit(2);
}
async function read(path) {
  const response = await fetch(target + path, { signal: AbortSignal.timeout(20000), redirect: 'error', cache: 'no-store' });
  const body = await response.json();
  return { code: response.status, body };
}
try {
  const health = await read('/health');
  const status = await read('/status');
  const h = health.body, s = status.body;
  const pass = health.code === 200 && status.code === 200 && h?.ok === true &&
    h?.validator_processes_alive === 4 && s?.validator_processes_alive === 4 &&
    s?.four_validator_processes === 4 && s?.status === 'LAB_RUNNING' &&
    s?.architecture === 'SINGLE_HOST_4_PROCESSES' &&
    s?.independent_hosts === false && s?.persistent_storage === false &&
    Array.isArray(s?.validator_heights) && s.validator_heights.length === 4 &&
    s.validator_heights.every(v => Number.isInteger(v) && v >= 0);
  console.log(JSON.stringify({status: pass ? 'PASS' : 'FAIL',
    source: target.startsWith('https://') ? 'PUBLIC_HTTPS' : 'LOCAL_ONLY',
    health: {http: health.code, ok: h?.ok}, status_endpoint: {http: status.code,
      state: s?.status, alive: s?.validator_processes_alive,
      heights: s?.validator_heights, independent_hosts: s?.independent_hosts}}, null, 2));
  if (!pass) process.exit(1);
} catch (error) {
  console.error(JSON.stringify({status:'FAIL', error: String(error.message||error)}));
  process.exit(1);
}
