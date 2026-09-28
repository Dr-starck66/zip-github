const http=require("http");
const fs=require("fs");
const zlib=require("zlib");
const path=require("path");
const parts=fs.readdirSync(__dirname).filter(n=>/^bundle\.part\d+$/.test(n)).sort();
const packed=parts.map(n=>fs.readFileSync(path.join(__dirname,n),"utf8")).join("");
const files=JSON.parse(zlib.gunzipSync(Buffer.from(packed,"base64")).toString("utf8"));
const mime={".html":"text/html; charset=utf-8",".xml":"application/xml; charset=utf-8",".txt":"text/plain; charset=utf-8",".svg":"image/svg+xml; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};
const server=http.createServer((req,res)=>{
  let u; try{u=new URL(req.url,"http://localhost").pathname}catch{u="/"}
  try{u=decodeURIComponent(u)}catch{}
  if(u==="/health"){res.statusCode=200;res.setHeader("content-type","application/json");return res.end(JSON.stringify({ok:true,site:"pantomime.org",files:Object.keys(files).length}));}
  if(u==="/")u="/index.html";
  if(u.endsWith("/"))u+="index.html";
  const data=files[u];
  if(!data){res.statusCode=404;res.setHeader("content-type","text/plain; charset=utf-8");return res.end("404 Not Found");}
  const ext=path.extname(u).toLowerCase();
  res.statusCode=200;
  res.setHeader("content-type",mime[ext]||"application/octet-stream");
  res.setHeader("cache-control",ext===".html"?"public, max-age=300":"public, max-age=86400");
  res.end(Buffer.from(data,"base64"));
});
const port=Number(process.env.PORT||3000);
server.listen(port,"0.0.0.0",()=>console.log(`Pantomime listening on ${port}; ${Object.keys(files).length} files; ${parts.length} bundle parts`));