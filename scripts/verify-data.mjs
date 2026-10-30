import {readFileSync} from "node:fs";
const data=JSON.parse(readFileSync("public/lease-offers/records.json","utf8"));
const offers=data.offers;
if(!Array.isArray(offers)||offers.length<1)throw Error("Empty catalog");
const unique=new Set();
const errors=[];
for(const o of offers){
 if(!o.id||unique.has(o.id))errors.push("Duplicate or missing id "+o.id);unique.add(o.id);
 if(!o.make||!o.model||!/^https:\/\//.test(o.source||""))errors.push("Invalid citation "+o.id);
 const vals=[o.monthly,o.due,o.term];
 if(vals.some(x=>x===null) && !vals.every(x=>x===null))errors.push("Partial financial quote "+o.id);
 if(vals.some(x=>x!==null&&(!Number.isFinite(x)||x<0)))errors.push("Invalid numerical quote "+o.id);
 if(o.monthly!==null&&(!Number.isInteger(o.term)||o.term<1))errors.push("Invalid lease term "+o.id);
 if(o.expires!=null&&!/^20\d\d-\d\d-\d\d$/.test(o.expires))errors.push("Invalid expiry "+o.id);
 if(o.manufacturer_live_verified===true)errors.push("No manufacturer-confirmed records in initial source snapshot "+o.id);
}
if(errors.length)throw Error(errors.join("; "));
const priced=offers.filter(x=>x.monthly!=null).length;
const withheld=offers.length-priced;
if(offers.length!==40||priced!==18||withheld!==22)throw Error("Unexpected source manifest change, inspect before publishing");
console.log(JSON.stringify({status:"PASS",phase:"data-validation",records:offers.length,priced,withheld,manufacturerLiveVerified:0}));