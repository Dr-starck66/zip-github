import {promises as fs} from "node:fs";
import path from "node:path";
const FILE=process.env.REGISTRY_PATH||"/tmp/evidorix-registry.json";
let queue=Promise.resolve();
async function read(){try{return JSON.parse(await fs.readFile(FILE,"utf8"))}catch{return []}}
export async function saveAudit(record){queue=queue.then(async()=>{const rows=await read();rows.unshift(record);await fs.mkdir(path.dirname(FILE),{recursive:true});const tmp=FILE+".tmp";await fs.writeFile(tmp,JSON.stringify(rows.slice(0,500),null,2));await fs.rename(tmp,FILE)});await queue;return record}
export async function getAudit(id){return (await read()).find(x=>x.id===id)||null}
export async function listAudits(limit=25){return (await read()).slice(0,Math.min(100,Math.max(1,limit)))}
export const registryInfo={mode:"ephemeral-file",path:FILE,durable:false,note:"Persists only while the current service filesystem survives. Production requires external persistent storage."};
