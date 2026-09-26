import fs from 'node:fs';import path from 'node:path';
const root=process.cwd();const out=path.join(root,'dist');let failures=[];
for(const f of ['index.html','sitemap.xml','news-sitemap.xml','rss.xml','robots.txt','redaktsiya/index.html']) if(!fs.existsSync(path.join(out,f))) failures.push(`missing ${f}`);
const articles=JSON.parse(fs.readFileSync('data/articles.json','utf8'));
const slugs=new Set();for(const a of articles){if(slugs.has(a.slug))failures.push(`duplicate slug ${a.slug}`);slugs.add(a.slug);if(!a.sources?.length)failures.push(`no source ${a.slug}`);if((a.body||[]).join(' ').length<800)failures.push(`too thin ${a.slug}`);if(!fs.existsSync(path.join(out,a.slug,'index.html')))failures.push(`missing page ${a.slug}`)}
const home=fs.readFileSync(path.join(out,'index.html'),'utf8');for(const x of ['max-image-preview:large','application/ld+json','alternate'])if(!home.includes(x))failures.push(`home missing ${x}`);
if(failures.length){console.error(failures.join('\n'));process.exit(1)}console.log(`PASS: ${articles.length} articles, SEO assets present, no duplicate slugs.`)
