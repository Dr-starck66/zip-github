import http from 'node:http';

const domain = (process.env.PROBE_DOMAIN || 'betgpt.live').trim().toLowerCase();
const apiKey = (process.env.DYNADOT_API_KEY || '').trim();
let state = { ok: false, phase: 'boot', domain };

async function probe() {
  if (!apiKey) {
    state = { ok: false, phase: 'missing-key', domain };
    return;
  }
  try {
    const u = new URL('https://api.dynadot.com/api3.json');
    u.searchParams.set('key', apiKey);
    u.searchParams.set('command', 'get_dns');
    u.searchParams.set('domain', domain);
    const res = await fetch(u);
    const raw = await res.text();
    let data = {};
    try { data = JSON.parse(raw); } catch {}
    const nested = data.GetDnsResponse || data.Response || {};
    const settings = data.GetDns?.NameServerSettings || nested.GetDns?.NameServerSettings || null;
    state = {
      ok: res.ok && Boolean(settings),
      phase: 'read',
      domain,
      http: res.status,
      topStatus: data.Status ?? null,
      topCode: data.ResponseCode ?? null,
      nestedStatus: nested.Status ?? null,
      nestedCode: nested.ResponseCode ?? null,
      responseKeys: Object.keys(data),
      settings
    };
    console.log('DYNADOT_READ_PROBE', JSON.stringify(state));
  } catch (error) {
    state = { ok: false, phase: 'request-failed', domain, error: String(error?.message || error) };
    console.error('DYNADOT_READ_PROBE', JSON.stringify(state));
  }
}
await probe();
http.createServer((req, res) => {
  res.statusCode = state.ok ? 200 : 503;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(state));
}).listen(Number(process.env.PORT || 8080), '0.0.0.0');
