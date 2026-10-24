import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const server=readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
test("site templates never emit an indexing exclusion",()=>{
 const prohibited="no"+"index";
 assert.equal(server.toLowerCase().includes(prohibited),false);
});
test("historical routes have explicit index and follow policy",()=>{
 assert.match(server,/function pageRobots\(x\)\{return "index,follow,/);
 assert.match(server,/function renderHistoric\(r\)/);
 assert.match(server,/function archiveMonth\(year,month\)/);
 assert.match(server,/function archiveYear\(year\)/);
});
test("sitemap includes browsable historic indices without bulk-submitting thin stubs",()=>{
 assert.match(server,/const archiveIndexes=/);
 assert.match(server,/\.\.\.archiveIndexes/);
 assert.match(server,/restoredJune\.filter\(/);
});
test("unrecognized historical URLs keep the real HTTP 404",()=>{
 assert.match(server,/status=404;cache="no-store"/);
});
