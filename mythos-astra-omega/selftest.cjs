const fs=require("fs");
const vm=require("vm");
const path=require("path");
const root=__dirname;
for(const file of ["index.html","styles.css","engine.js","app.js","README.md","INVESTOR_DOSSIER.md","openapi.json","SECURITY.md"]){
  if(!fs.existsSync(path.join(root,file))) throw new Error("Missing required asset: "+file);
}
const src=fs.readFileSync(path.join(root,"engine.js"),"utf8");
new Function(src);
new Function(fs.readFileSync(path.join(root,"app.js"),"utf8"));
const sandbox={window:{},TextEncoder:global.TextEncoder,crypto:global.crypto};
vm.createContext(sandbox);
vm.runInContext(src,sandbox);
const engine=sandbox.window.MythosEngine;
if(!engine||engine.VERSION!=="2.0.0") throw new Error("Engine version mismatch");
const bench=engine.runBenchmark();
console.log(JSON.stringify(bench,null,2));
if(bench.passed!==bench.total) throw new Error("Benchmark regression: "+bench.passed+"/"+bench.total);
const robust=engine.audit({task:"PASS si HTTP 200, contre-test et second run indépendant.",answer:"Tests PASS, Red Team exécutée, résultat reproduit sur un second run indépendant.",evidence:"https://example.com HTTP 200 source primaire\nPlaywright test PASS indépendant\ncontre-test adversarial PASS"});
if(robust.verdict!=="PASS") throw new Error("Robust audit must PASS");
const falsePass=engine.audit({task:"Vérifier.",answer:"C'est garanti à 100%, tout fonctionne parfaitement.",evidence:""});
if(falsePass.verdict!=="FAIL") throw new Error("Unsupported certainty must FAIL");
console.log("MYTHOS_ASTRA_OMEGA_SELFTEST=PASS");