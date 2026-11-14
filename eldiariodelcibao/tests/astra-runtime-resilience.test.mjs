import {test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cwd=new URL("../",import.meta.url);
async function freePort(){
 const server=createServer();
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});
 const port=server.address().port;
 await new Promise(resolve=>server.close(resolve));
 return port;
}
async function boot(port){
 const child=spawn(process.execPath,["server.mjs"],{cwd,env:{...process.env,PORT:String(port)},stdio:["ignore","pipe","pipe"]});
 let logs="";
 for(const stream of [child.stdout,child.stderr])stream.on("data",b=>{logs=(logs+b.toString()).slice(-6000)});
 for(let i=0;i<60;i++){
  if(child.exitCode!==null){child.kill("SIGKILL");throw Error("start-exit "+child.exitCode+" "+logs);}
  try{
   const response=await fetch("http://127.0.0.1:"+port+"/health",{signal:AbortSignal.timeout(650)});
   if(response.status===200){const body=await response.json();assert.equal(body.ok,true);return child;}
  }catch{}
  await sleep(250);
 }
 child.kill("SIGKILL");
 throw Error("startup-timeout "+logs);
}
async function stop(child){
 if(child.exitCode!==null)return;
 await new Promise(resolve=>{
  child.once("exit",resolve);
  child.kill("SIGTERM");
  setTimeout(()=>{if(child.exitCode===null)child.kill("SIGKILL");resolve();},2500).unref();
 });
}
test("real Cibao HTTP process serves health and safely recovers on restart",{timeout:45000},async()=>{
 const port=await freePort();
 for(let trial=0;trial<2;trial++){
  const child=await boot(port);
  try{
   const invalid=await fetch("http://127.0.0.1:"+port+"/2018/06/inexistent-restoration-url.html");
   assert.equal(invalid.status,404);
   const xml=await fetch("http://127.0.0.1:"+port+"/sitemap.xml");
   assert.equal(xml.status,200);
   assert.match(await xml.text(),/\/archivo\/2018\/06\//);
  }finally{await stop(child)}
 }
});
