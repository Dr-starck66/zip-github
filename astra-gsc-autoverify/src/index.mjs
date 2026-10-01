#!/usr/bin/env node
import {getGoogleAccessToken,getVerificationToken,verifyOwnership,addSearchConsoleProperty,getSearchConsoleProperty,submitSitemap,inspectUrl} from "./google.mjs";
import {putVerificationFile,waitForFile} from "./publish.mjs";
import {publishDnsTxt,waitForTxt} from "./dns.mjs";

function args(argv) {
  const out={};
  for (let i=2;i<argv.length;i++) {
    const a=argv[i];
    if (!a.startsWith("--")) continue;
    const k=a.slice(2);
    const next=argv[i+1];
    if (!next||next.startsWith("--")) out[k]=true; else {out[k]=next;i++;}
  }
  return out;
}
function need(v,n){if(!v)throw new Error(`Missing --${n}`);return v;}
function cleanDomain(v){return v.replace(/^https?:\/\//,"").replace(/\/.*$/,"").replace(/^www\./,"").toLowerCase();}
function sitemapList(v,site){return (v||`${site}sitemap-index.xml,${site}sitemap-news.xml`).split(",").map(x=>x.trim()).filter(Boolean);}

export async function run(options,env=process.env){
  const domain=cleanDomain(need(options.domain,"domain"));
  const site=(options.site||`https://${domain}/`).replace(/\/?$/,"/");
  const strategy=(options.strategy||"auto").toLowerCase();
  const token=await getGoogleAccessToken(env);
  const result={domain,site,strategy,stages:[]};

  const canFile=Boolean(env.GITHUB_TOKEN && (options.repo||env.GITHUB_REPOSITORY));
  const chosen=strategy==="auto"?(canFile?"file":"dns"):strategy;

  if(chosen==="file"){
    const vr=await getVerificationToken({identifier:site,type:"SITE",method:"FILE",token});
    const filename=vr.token;
    const content=`google-site-verification: ${filename}`;
    result.stages.push({stage:"token",method:"FILE",status:"PASS"});
    await putVerificationFile({
      repo:options.repo||env.GITHUB_REPOSITORY,
      branch:options.branch||env.GITHUB_BRANCH||"main",
      publicRoot:options["public-root"]||env.PUBLIC_ROOT||"",
      filename,content,githubToken:env.GITHUB_TOKEN
    });
    result.stages.push({stage:"publish-proof",status:"PASS",target:`${site}${filename}`});
    await waitForFile(`${site}${filename}`,content,{
      attempts:Number(options.attempts||env.ASTRA_VERIFY_ATTEMPTS||30),
      delayMs:Number(options.delay||env.ASTRA_VERIFY_DELAY_MS||5000)
    });
    await verifyOwnership({identifier:site,type:"SITE",method:"FILE",token});
    result.stages.push({stage:"verify-ownership",status:"PASS"});
    await addSearchConsoleProperty(site,token);
    const property=await getSearchConsoleProperty(site,token);
    result.stages.push({stage:"search-console-property",status:property?.permissionLevel==="siteUnverifiedUser"?"FAIL":"PASS",permissionLevel:property?.permissionLevel});
    for(const sm of sitemapList(options.sitemaps,site)) await submitSitemap(site,sm,token);
    result.stages.push({stage:"sitemaps",status:"PASS",count:sitemapList(options.sitemaps,site).length});
    if(options.inspect!==false && options.inspect!=="false"){
      try {
        const inspection=await inspectUrl(site,site,token);
        result.stages.push({stage:"url-inspection",status:"PASS",verdict:inspection?.inspectionResult?.indexStatusResult?.verdict||null});
      } catch(e) {
        result.stages.push({stage:"url-inspection",status:"PARTIAL",error:e.message});
      }
    }
    return result;
  }

  if(chosen==="dns"){
    const provider=String(options.provider||env.DNS_PROVIDER||"dynadot").toLowerCase();
    const vr=await getVerificationToken({identifier:domain,type:"INET_DOMAIN",method:"DNS_TXT",token});
    const dnsToken=vr.token;
    result.stages.push({stage:"token",method:"DNS_TXT",status:"PASS"});
    await publishDnsTxt({provider,domain,host:"",value:dnsToken,env});
    result.stages.push({stage:"publish-proof",status:"PASS",provider,target:domain});
    await waitForTxt(domain,dnsToken,{
      attempts:Number(options.attempts||env.ASTRA_VERIFY_ATTEMPTS||40),
      delayMs:Number(options.delay||env.ASTRA_VERIFY_DELAY_MS||7500)
    });
    await verifyOwnership({identifier:domain,type:"INET_DOMAIN",method:"DNS_TXT",token});
    result.stages.push({stage:"verify-ownership",status:"PASS"});
    const property=`sc-domain:${domain}`;
    await addSearchConsoleProperty(property,token);
    const p=await getSearchConsoleProperty(property,token);
    result.stages.push({stage:"search-console-property",status:p?.permissionLevel==="siteUnverifiedUser"?"FAIL":"PASS",permissionLevel:p?.permissionLevel});
    for(const sm of sitemapList(options.sitemaps,site)) await submitSitemap(property,sm,token);
    result.stages.push({stage:"sitemaps",status:"PASS",count:sitemapList(options.sitemaps,site).length});
    if(options.inspect!==false && options.inspect!=="false"){
      try{
        const inspection=await inspectUrl(property,site,token);
        result.stages.push({stage:"url-inspection",status:"PASS",verdict:inspection?.inspectionResult?.indexStatusResult?.verdict||null});
      }catch(e){result.stages.push({stage:"url-inspection",status:"PARTIAL",error:e.message});}
    }
    return result;
  }
  throw new Error(`Unknown strategy: ${chosen}`);
}

if(import.meta.url===`file://${process.argv[1]}`){
  run(args(process.argv)).then(r=>{console.log(JSON.stringify(r,null,2));}).catch(e=>{
    console.error(JSON.stringify({status:"FAIL",error:e.message},null,2));process.exitCode=1;
  });
}
