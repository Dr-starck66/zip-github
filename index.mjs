import http from 'node:http';

const domain = process.env.AUTODNS_DOMAIN || 'betgpt.live';
const port = Number(process.env.PORT || 8080);
let state = { ok: false, phase: 'boot', domain, fetchedAt: null, response: null, error: null };

async function dynadotGetDns() {
  const key = process.env.DYNADOT_API_KEY;
  if (!key) throw new Error('DYNADOT_API_KEY missing');
  const qs = new URLSearchParams({ key, command: 'get_dns', domain });
  const res = await fetch('https://api.dynadot.com/api3.json?' + qs.toString());
  const text = await res.text();
  state = { ok: res.ok, phase: 'get_dns', domain, fetchedAt: new Date().toISOString(), response: text, error: null };
  console.log('AUTODNS_DYNADOT_GET_DNS', text);
}

dynadotGetDns().catch((err) => {
  state = { ok: false, phase: 'get_dns', domain, fetchedAt: new Date().toISOString(), response: null, error: String(err?.message || err) };
  console.error('AUTODNS_ERROR', state.error);
});

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type':'application/json' });
    return res.end(JSON.stringify({ status:'ok', domain, phase:state.phase, dynadotOk:state.ok }));
  }
  res.writeHead(200, { 'content-type':'application/json' });
  res.end(JSON.stringify(state));
}).listen(port, '0.0.0.0', () => console.log('AUTODNS_LISTEN', port));
