/**
 * ASTRA INTERNAL FACTORY Ω -- hosted zero-Actions execution of existing private ASTRA tests.
 * No paid APIs, new cron, shell commands, arbitrary file paths, email, DNS or editorial publish.
 * The service is a real Node process while awake; Render Free sleeps on inactivity.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../..');
const STATE='/tmp/astra-internal-factory';
const PORT=Number(process.env.PORT||10000);
const VERSION='astra-internal-factory-host/1';
const JOBS=Object.freeze({
 'master-gate':'scripts/astra-master-gate.test.mjs',
 'upstream-proof':'scripts/astra-upstream-proof.test.mjs',
 'betgpt-promotion-auth':'scripts/safe-betgpt-promotion-auth.test.mjs',
 'bulker':'astra-bulker/bridge.test.mjs',
 'bulker-core':'astra-bulker/test.mjs'
});
const AUTO=['master-gate','upstream-proof','bulker'];
let busy=false,latest=null,boot=new Date().toISOString(),lastSlot=null,lastError=null;
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const send=(res,code,obj)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(obj));};
function parisSlot(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const minute=Number(parts.hour)*60+Number(parts.minute);
 for(const h of [9,14,19])if(minute>=h*60 && minute<h*60+20)return parts.year+'-'+parts.month+'-'+parts.day+'T'+String(h).padStart(2,'0')+':00[Europe/Paris]';
 return null;
}
function secretOK(got){
 const want=process.env.ASTRA_TRIGGER_KEY;
 if(!want||want.length<40||typeof got!=='string')return false;
 return timingSafeEqual(Buffer.from(hash(want),'hex'),Buffer.from(hash(got),'hex'));
}
function doTest(id){
 return new Promise(async resolve=>{
  const f=JOBS[id];if(!f)return resolve({id,status:'BLOCKED',reason:'UNKNOWN_JOB'});
  let real;try{real=await fs.realpath(path.join(ROOT,f));}catch{return resolve({id,status:'BLOCKED',reason:'SOURCE_MISSING'});}
  if(!real.startsWith(ROOT+path.sep))return resolve({id,status:'BLOCKED',reason:'OUTSIDE_REPO'});
  const start=Date.now();let output='',finished=false,timedOut=false;
  const safeEnv={PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||'/tmp',CI:'true',NODE_ENV:'test',ASTRA_FACTORY_POLICY:'read-only'};
  let proc;try{proc=spawn(process.execPath,['--test',f],{cwd:ROOT,env:safeEnv,stdio:['ignore','pipe','pipe'],shell:false});}catch(e){return resolve({id,status:'FAIL',reason:e?.code||'SPAWN_ERROR'});}
  function collect(buf){if(output.length<16000)output+=buf.toString('utf8').slice(0,16000-output.length)}
  proc.stdout.on('data',collect);proc.stderr.on('data',collect);
  const timer=setTimeout(()=>{timedOut=true;proc.kill('SIGKILL')},90000);
  const finish=(code,error)=>{if(finished)return;finished=true;clearTimeout(timer);resolve({id,status:code===0&&!error&&!timedOut?'PASS':'FAIL',exitCode:code,elapsedMs:Date.now()-start,logDigest:hash(output),timedOut,reason:error||null,scope:'REAL_HOSTED_TEST_ONLY'});};
  proc.on('error',e=>finish(null,e?.code||'SPAWN_ERROR'));proc.on('close',code=>finish(code,null));
 });
}
async function execute(ids,slot){
 if(busy)return {status:'BLOCKED',reason:'RUN_ALREADY_ACTIVE'};
 if(!Array.isArray(ids)||!ids.length||ids.length>4||new Set(ids).size!==ids.length||ids.some(id=>!Object.hasOwn(JOBS,id)))return {status:'BLOCKED',reason:'INVALID_JOBS'};
 if(slot!=='boot' && slot!=='manual' && slot===lastSlot)return {status:'SKIPPED',reason:'SLOT_ALREADY_PROCESSED'};
 busy=true;try{
 const receipts=[];
 for(const id of ids)receipts.push(await doTest(id));
 const receipt={schema:VERSION,at:new Date().toISOString(),slot,status:receipts.every(x=>x.status==='PASS')?'PASS':'PARTIAL',receipts,githubActionsMinutes:0,sideEffects:0,scope:'HOSTED_READ_ONLY_TESTS_NOT_EDITORIAL_FACTORY',persistentState:false};
 latest=receipt;lastSlot=slot;
 await fs.mkdir(STATE,{recursive:true,mode:0o700});
 await fs.writeFile(path.join(STATE,'latest.json'),JSON.stringify(receipt)+'\n',{mode:0o600});
 await fs.appendFile(path.join(STATE,'ledger.ndjson'),JSON.stringify(receipt)+'\n',{mode:0o600});
 console.log('ASTRA_INTERNAL_FACTORY_REAL_TEST',JSON.stringify({slot,at:receipt.at,status:receipt.status,jobs:receipts.map(x=>({id:x.id,status:x.status}))}));
 return receipt;
 }catch(e){lastError=e?.code||e?.name||'ERROR';return {status:'FAIL',reason:lastError};}finally{busy=false}
}
async function tick(){const slot=parisSlot();if(slot&&slot!==lastSlot&&!busy)await execute(AUTO,slot);}
const server=http.createServer(async(req,res)=>{
 try{
 const u=new URL(req.url||'/', 'http://localhost');
 if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/healthz'))return send(res,200,{schema:VERSION,status:'HOST_RUNNING',boot,busy,repoExists:true,schedule:'09/14/19 Europe/Paris while awake',freeHostSpinsDown:true,githubActionsRequired:false});
 if(req.method==='GET'&&u.pathname==='/status.json')return send(res,200,{schema:VERSION,boot,busy,lastError,latest,persistentState:false,host:'FREE_EPHEMERAL'});
 if(req.method==='POST'&&u.pathname==='/run'){
  if(!secretOK((req.headers.authorization||'').replace(/^Bearer\s+/i,'')))return send(res,403,{status:'BLOCKED',reason:'AUTH_REQUIRED'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)return send(res,413,{status:'BLOCKED',reason:'BODY_LIMIT'});}
  let data;try{data=JSON.parse(body)}catch{return send(res,400,{status:'BLOCKED',reason:'INVALID_JSON'})}
  const result=await execute(data.jobs,'manual');return send(res,result.status==='BLOCKED'?400:200,result);
 }
 return send(res,404,{status:'NOT_FOUND'});
 }catch(e){lastError=e?.name||'ERROR';return send(res,500,{status:'FAIL',reason:lastError});}
});
if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw Error('INVALID_PORT');
server.listen(PORT,'0.0.0.0',()=>{
 console.log(JSON.stringify({event:'ASTRA_INTERNAL_FACTORY_HOST_STARTED',port:PORT,repo:ROOT,readOnly:true}));
 execute(['master-gate'],'boot').catch(e=>console.error('ASTRA_BOOT_FAILURE',e?.name));
 tick().catch(e=>console.error('ASTRA_TICK_FAILURE',e?.name));
});
setInterval(()=>tick().catch(e=>console.error('ASTRA_TICK_FAILURE',e?.name)),60000).unref();
