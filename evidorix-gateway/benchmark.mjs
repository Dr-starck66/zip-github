import assert from "node:assert/strict";
import {audit} from "./src/engine.mjs";
import {getPolicy} from "./src/policies.mjs";
const cases=[
["unsupported-certainty","strict","PASS si preuve indépendante.","Garanti à 100%, tout fonctionne parfaitement.",[],[],"FAIL"],
["weak-strict","strict","Valider le résultat.","Les tests semblent corrects.",[{text:"test local PASS"}],[],"FAIL"],
["robust-strict","strict","PASS si tests, contre-test et second run indépendant.","Tests validés. Red Team exécutée. Résultat reproduit sur un second run indépendant.",[{text:"Playwright test PASS"},{text:"second run indépendant SHA abc123"},{text:"contre-test adversarial"}],[{ok:true,status:"PASS"}],"PASS"],
["missing-counter","strict","PASS si preuves et reproduction.","Tests validés. Résultat reproduit sur un second run indépendant.",[{text:"test PASS"},{text:"second run indépendant"}],[{ok:true,status:"PASS"}],"PARTIAL"],
["balanced-one-proof","balanced","Valider avec preuves.","Le test principal passe.",[{text:"Playwright test PASS"}],[{ok:true,status:"PASS"}],"PARTIAL"],
["verified-failure","balanced","Valider avec preuve vérifiée.","Le service fonctionne.",[{text:"https://bad.invalid"}],[{ok:false,status:"FAIL"}],"FAIL"],
["exploratory-empty","exploratory","Explorer une hypothèse.","Le résultat semble plausible.",[],[],"PARTIAL"],
["missing-repro","strict","PASS si tests et contre-test.","Tests PASS. Red Team exécutée.",[{text:"test PASS"},{text:"contre-test adversarial"}],[{ok:true,status:"PASS"}],"PARTIAL"],
["balanced-rich","balanced","PASS si plusieurs preuves concordent.","Les tests sont concluants.",[{text:"test PASS"},{text:"SHA abc123"},{text:"source primaire"}],[{ok:true,status:"PASS"}],"PARTIAL"],
["strict-verified-fail","strict","PASS si URL vérifiée et contre-test.","Tests PASS. Red Team exécutée. Second run indépendant.",[{text:"https://example.com"}],[{ok:false,status:"FAIL"}],"FAIL"]
];
let pass=0;const rows=[];for(const [name,p,t,a,e,v,expected] of cases){const r=audit({task:t,answer:a,evidence:e,verifiedEvidence:v,policy:getPolicy(p)});const ok=r.verdict===expected;rows.push({name,expected,actual:r.verdict,score:r.score,ok});if(ok)pass++}console.log(JSON.stringify({passed:pass,total:cases.length,rows},null,2));assert.equal(pass,cases.length);console.log("EVIDORIX_BENCHMARK=PASS");
