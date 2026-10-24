// ASTRA Ω — bounded, read-only live HTTP proof. No secrets, external input, cron or extra services.
const HOST = "https://wyylde-avis.seneque.info";
const PATHS = [
  "/wyylde-connexion/",
  "/wyylde-mot-de-passe-oublie/",
  "/wyylde-compte-bloque/",
  "/wyylde-connexion-google-apple/",
  "/wyylde-connexion-impossible/",
  "/wyylde-double-authentification/"
];
module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({status:"METHOD_NOT_ALLOWED"});
  res.setHeader("Cache-Control","public, max-age=60, s-maxage=60");
  const results = await Promise.all(PATHS.map(async path => {
    const url = HOST + path;
    try {
      const r = await fetch(url,{method:"GET",redirect:"manual",headers:{"Accept":"text/html"},signal:AbortSignal.timeout(8000)});
      const html = await r.text();
      const canonical = html.match(/<link\\s+rel="canonical"\\s+href="([^"]+)"/i)?.[1] || null;
      const isHtml = (r.headers.get("content-type")||"").includes("text/html");
      return {url,status:r.status,html:isHtml,canonical,pass:r.status===200 && isHtml && canonical===url && !/noindex/i.test(html)};
    } catch(e) {return {url,status:null,pass:false,error:String(e.message||e).slice(0,100)};}
  }));
  let sitemap={url:HOST+"/sitemap.xml",status:null,urls:0,hasAllSix:false,pass:false};
  try {
    const r=await fetch(sitemap.url,{headers:{"Accept":"application/xml"},signal:AbortSignal.timeout(8000)});
    const text=await r.text();
    const entries=[...text.matchAll(/<loc>\\s*([^<]+?)\\s*<\\/loc>/gi)].map(m=>m[1]);
    sitemap={url:sitemap.url,status:r.status,urls:entries.length,hasAllSix:PATHS.every(p=>entries.includes(HOST+p)),pass:r.status===200 && entries.length===26 && PATHS.every(p=>entries.includes(HOST+p))};
  }catch(e){sitemap.error=String(e.message||e).slice(0,100);}
  const pass=results.every(x=>x.pass) && sitemap.pass;
  res.status(200).json({component:"ASTRA_COCON_HTTP_PROOF",status:pass?"PASS":"FAIL",checkedAt:new Date().toISOString(),pages:results,sitemap});
};
