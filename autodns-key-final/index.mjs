import http from 'node:http';

const base = process.env.DYNADOT_API_KEY || '';
const domain = process.env.AUTODNS_DOMAIN || 'betgpt.live';
const a = String.fromCharCode(39);

async function check(label, key) {
  const url = 'https://api.dynadot.com/api3.json?' + new URLSearchParams({
    key, command: 'get_dns', domain
  });
  try {
    const r = await fetch(url);
    const text = await r.text();
    let code = null, error = null;
    try {
      const j = JSON.parse(text);
      const o = (j && j.Response && typeof j.Response === 'object') ? j.Response : j;
      code = o?.ResponseCode ?? o?.response_code ?? o?.code ?? null;
      error = o?.Error ?? o?.error ?? null;
    } catch {}
    return { candidate: label, http_status: r.status, api_code: code, api_error: error };
  } catch (e) {
    return { candidate: label, http_status: null, api_code: null, api_error: e?.name || 'Error' };
  }
}

const candidates = [
  ['plain', base],
  ['leading_apostrophe', a + base],
  ['trailing_apostrophe', base + a],
  ['wrapped_apostrophes', a + base + a],
];

const result = { domain, results: await Promise.all(candidates.map(([l,k]) => check(l,k))) };
console.log('AUTODNS_FINAL_DIAGNOSTIC ' + JSON.stringify(result));

const port = Number(process.env.PORT || 8080);
http.createServer((req,res)=>{
  res.writeHead(200, {'content-type':'application/json'});
  res.end(JSON.stringify(result));
}).listen(port,'0.0.0.0',()=>console.log('AUTODNS_CHECK_LISTEN',port));
