/**
 * Legacy Blogger and www canonicalization.
 * Preserve verified historic article URLs; never redirect an unrelated 404
 * to a category or homepage. Removes only Blogger's historic mobile m=1.
 */
export function resolveLegacyRedirect({host, pathname, search="", historicMap}) {
  const origin="https://eldiariodelcibao.com";
  const oldPath=typeof pathname==="string"?pathname:"/";
  const canonicalPath=oldPath.endsWith(".html/") && historicMap.has(oldPath.slice(0,-1))
    ? oldPath.slice(0,-1) : oldPath;
  const documented=historicMap.has(canonicalPath);
  const params=new URLSearchParams(search);
  const mobile=documented && params.get("m")==="1";
  if (mobile) params.delete("m");
  const onWww=String(host).toLowerCase()==="www.eldiariodelcibao.com";
  if (!onWww && canonicalPath===oldPath && !mobile) return null;
  const canonicalQuery=mobile?(params.toString()?"?"+params.toString():""):search;
  return origin+canonicalPath+canonicalQuery;
}
