import express from "express";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.GITHUB_TOKEN || "";
const API = "https://api.github.com";
const API_VERSION = "2026-03-10";

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${TOKEN}`,
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "RepoPilot-X"
  };
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 100);
}

function sanitizeText(value, max = 350) {
  return String(value || "").trim().slice(0, max);
}

async function gh(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { ...githubHeaders(), ...(options.headers || {}) }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
  if (!response.ok) {
    const err = new Error(body?.message || `GitHub API error ${response.status}`);
    err.status = response.status;
    err.details = body;
    throw err;
  }
  return body;
}

app.get("/api/health", async (_req, res) => {
  if (!TOKEN) {
    return res.status(503).json({
      ok:false,
      github:false,
      reason:"GITHUB_TOKEN_MISSING"
    });
  }
  try {
    const me = await gh("/user");
    res.json({ ok:true, github:true, login:me.login });
  } catch (error) {
    res.status(error.status || 500).json({
      ok:false,
      github:false,
      reason:error.message
    });
  }
});

app.post("/api/repos", async (req, res) => {
  if (!TOKEN) {
    return res.status(503).json({
      ok:false,
      error:"GITHUB_TOKEN_MISSING",
      message:"Le serveur n'a pas encore de jeton GitHub."
    });
  }

  const name = normalizeName(req.body?.name);
  if (!name || name.length < 1) {
    return res.status(400).json({ ok:false, error:"INVALID_NAME" });
  }

  const payload = {
    name,
    description: sanitizeText(req.body?.description),
    private: Boolean(req.body?.private),
    auto_init: req.body?.auto_init !== false,
    has_issues: req.body?.has_issues !== false,
    has_projects: Boolean(req.body?.has_projects),
    has_wiki: Boolean(req.body?.has_wiki),
    delete_branch_on_merge: true
  };

  const gitignore = sanitizeText(req.body?.gitignore_template, 64);
  const license = sanitizeText(req.body?.license_template, 64);
  if (gitignore && gitignore !== "none") payload.gitignore_template = gitignore;
  if (license && license !== "none") payload.license_template = license;

  try {
    const repo = await gh("/user/repos", {
      method:"POST",
      body:JSON.stringify(payload)
    });
    res.status(201).json({
      ok:true,
      repo:{
        id:repo.id,
        name:repo.name,
        full_name:repo.full_name,
        html_url:repo.html_url,
        private:repo.private,
        default_branch:repo.default_branch
      }
    });
  } catch (error) {
    res.status(error.status || 500).json({
      ok:false,
      error:"GITHUB_CREATE_FAILED",
      message:error.message,
      details:error.details || null
    });
  }
});

app.post("/api/repos/batch", async (req, res) => {
  if (!TOKEN) {
    return res.status(503).json({ ok:false, error:"GITHUB_TOKEN_MISSING" });
  }
  const items = Array.isArray(req.body?.repos) ? req.body.repos.slice(0, 20) : [];
  if (!items.length) {
    return res.status(400).json({ ok:false, error:"EMPTY_BATCH" });
  }

  const results = [];
  for (const item of items) {
    const name = normalizeName(item?.name);
    if (!name) {
      results.push({ ok:false, name:"", error:"INVALID_NAME" });
      continue;
    }
    const payload = {
      name,
      description:sanitizeText(item?.description),
      private:Boolean(item?.private),
      auto_init:item?.auto_init !== false,
      has_issues:item?.has_issues !== false,
      delete_branch_on_merge:true
    };
    const gitignore = sanitizeText(item?.gitignore_template, 64);
    const license = sanitizeText(item?.license_template, 64);
    if (gitignore && gitignore !== "none") payload.gitignore_template = gitignore;
    if (license && license !== "none") payload.license_template = license;
    try {
      const repo = await gh("/user/repos", { method:"POST", body:JSON.stringify(payload) });
      results.push({ ok:true, name, html_url:repo.html_url, full_name:repo.full_name });
    } catch (error) {
      results.push({ ok:false, name, error:error.message, status:error.status || 500 });
    }
  }
  res.status(results.every(r => r.ok) ? 201 : 207).json({ ok:results.every(r => r.ok), results });
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ ok:false, error:"INTERNAL_ERROR", message:err?.message || "Unknown error" });
});

app.listen(PORT, () => {
  console.log(`RepoPilot X listening on ${PORT}`);
});
