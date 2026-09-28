const http = require('http');

const domain = process.env.AUTODNS_DOMAIN || 'pantomime.org';
const rawKey = (process.env.DYNADOT_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
let state = { ok: false, phase: 'boot', domain };

function variants(k) {
  const out = [k];
  if (k.startsWith('9') && k.length > 1) out.push(k.slice(1));
  else out.push('9' + k);
  return [...new Set(out.filter(Boolean))];
}

async function getDns(key) {
  const u = new URL('https://api.dynadot.com/api3.json');
  u.searchParams.set('key', key);
  u.searchParams.set('command', 'get_dns');
  u.searchParams.set('domain', domain);
  const res = await fetch(u);
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 2000) }; }
  return { http: res.status, json };
}

(async () => {
  if (!rawKey) throw new Error('DYNADOT_API_KEY missing');
  const attempts = [];
  for (const key of variants(rawKey)) {
    const g = await getDns(key);
    const body = g.json || {};
    const payload = body.GetDnsResponse || body;
    const status = payload.Status || payload.status;
    const code = payload.ResponseCode ?? payload.response_code ?? payload.SuccessCode;
    attempts.push({ http: g.http, status, code });
    if (g.http === 200 && String(status || '').toLowerCase() === 'success') {
      state = {
        ok: true,
        phase: 'read',
        domain,
        attempts,
        response: body,
        checkedAt: new Date().toISOString()
      };
      console.log('DNSREAD_RESULT', JSON.stringify(state));
      return;
    }
  }
  throw new Error('Dynadot get_dns failed');
})().catch(err => {
  state = { ok: false, phase: 'error', domain, error: String(err.message || err), checkedAt: new Date().toISOString() };
  console.error('DNSREAD_RESULT', JSON.stringify(state));
});

setInterval(() => console.log('DNSREAD_HEARTBEAT', JSON.stringify(state)), 10000);

http.createServer((req, res) => {
  res.writeHead(req.url === '/health' ? (state.ok ? 200 : 503) : 200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(state));
}).listen(Number(process.env.PORT || 8080), '0.0.0.0');
