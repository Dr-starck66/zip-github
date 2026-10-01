import { setTimeout as sleep } from "node:timers/promises";

async function github(path, options, token) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers:{
      accept:"application/vnd.github+json",
      authorization:`Bearer ${token}`,
      "x-github-api-version":"2022-11-28",
      "content-type":"application/json",
      ...(options?.headers||{})
    }
  });
  const text = await r.text();
  const body = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

export async function putVerificationFile({repo,branch="main",publicRoot="",filename,content,githubToken}) {
  if (!repo || !githubToken) throw new Error("FILE verification requires GITHUB_REPOSITORY and GITHUB_TOKEN");
  const cleanRoot = publicRoot.replace(/^\/+|\/+$/g,"");
  const path = [cleanRoot,filename].filter(Boolean).join("/");
  const apiPath = `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  let sha;
  try {
    const current = await github(`${apiPath}?ref=${encodeURIComponent(branch)}`, {method:"GET"}, githubToken);
    sha = current.sha;
  } catch (e) {
    if (e.message.includes("GitHub API 404")) sha = undefined; else throw e;
  }
  const payload = {
    message:`ASTRA GSC verification: ${filename}`,
    content:Buffer.from(content).toString("base64"),
    branch,
    ...(sha?{sha}:{})
  };
  return github(apiPath,{method:"PUT",body:JSON.stringify(payload)},githubToken);
}

export async function waitForFile(url, expected, {attempts=30, delayMs=5000}={}) {
  for (let i=1;i<=attempts;i++) {
    try {
      const r=await fetch(url,{redirect:"follow",cache:"no-store"});
      const body=await r.text();
      if (r.ok && body.trim()===expected.trim()) return {ok:true,attempt:i,status:r.status};
    } catch {}
    if (i<attempts) await sleep(delayMs);
  }
  throw new Error(`Verification file not publicly visible after ${attempts} attempts: ${url}`);
}
