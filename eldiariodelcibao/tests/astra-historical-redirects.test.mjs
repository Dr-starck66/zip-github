import {test} from "node:test";
import assert from "node:assert/strict";
import {resolveLegacyRedirect} from "../lib/astra-historical-redirects.mjs";
const canonical="/2018/06/alcaldesa-de-esperanza-anuncia.html";
const known=new Map([[canonical,{path:canonical}]]);
const route=(host,pathname,search="")=>resolveLegacyRedirect({host,pathname,search,historicMap:known});
test("Blogger mobile ?m=1 301 target keeps verified historic path",()=>{
 assert.equal(route("eldiariodelcibao.com",canonical,"?m=1"),
  "https://eldiariodelcibao.com"+canonical);
});
test("Blogger mobile alias retains unrelated query fields",()=>{
 assert.equal(route("eldiariodelcibao.com",canonical,"?utm_source=archive&m=1"),
  "https://eldiariodelcibao.com"+canonical+"?utm_source=archive");
});
test("legacy html trailing slash canonicalizes without changing page topic",()=>{
 assert.equal(route("eldiariodelcibao.com",canonical+"/"),
  "https://eldiariodelcibao.com"+canonical);
});
test("www becomes permanent 301 redirect to root",()=>{
 assert.equal(route("www.eldiariodelcibao.com","/guias/"),
  "https://eldiariodelcibao.com/guias/");
});
test("unrelated nonexistent historical URL is not redirected",()=>{
 assert.equal(route("eldiariodelcibao.com","/2018/06/unknown.html","?m=1"),null);
});
test("valid canonical historical page is served without redirect",()=>{
 assert.equal(route("eldiariodelcibao.com",canonical),null);
});

test("Blogger Atom feed aliases redirect to the existing canonical RSS feed",()=>{
 assert.equal(route("eldiariodelcibao.com","/feeds/posts/default"),"https://eldiariodelcibao.com/feed.xml");
 assert.equal(route("www.eldiariodelcibao.com","/feeds/posts/default","?alt=rss"),"https://eldiariodelcibao.com/feed.xml");
 assert.equal(route("eldiariodelcibao.com","/feed/"),"https://eldiariodelcibao.com/feed.xml");
 assert.equal(route("eldiariodelcibao.com","/feed"),"https://eldiariodelcibao.com/feed.xml");
});
test("unrelated Blogger label and unknown article remain 404",()=>{
 assert.equal(route("eldiariodelcibao.com","/feeds/posts/default/-/POLITICA"),null);
 assert.equal(route("eldiariodelcibao.com","/2016/07/unknown.html"),null);
});
