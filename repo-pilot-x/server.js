import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import aureusConfig from "./aureus-api/config.js";
import aureusGeocode from "./aureus-api/geocode.js";
import aureusHealth from "./aureus-api/health.js";
import aureusResearch from "./aureus-api/research.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));
app.use("/aureus", express.static("public/aureus-x"));

app.get("/api/config", aureusConfig);
app.get("/api/geocode", aureusGeocode);
app.get("/aureus-api/health", aureusHealth);
app.get("/api/research", aureusResearch);

const PORT = process.env.PORT || 3000;
const API = "https://api.github.com";
const API_VERSION = "2026-03-10";
const BASE_URL = (process.env.PUBLIC_BASE_URL || "https://repo-pilot-x-production.up.railway.app").replace(/\/$/, "");
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const TARGET_LOGIN = process.env.TARGET_GITHUB_LOGIN || "Dr-starck66";
const AUTOMATION_KEY = process.env.AUTOMATION_KEY || "";
const AUTOMATION_SESSION_ENV = process.env.AUTOMATION_SESSION || "";
const AUTOMATION_SESSION_PATH = process.env.AUTOMATION_SESSION_PATH || "/data/automation-session.sealed";

function readPersistentAutomationSession() {
  try {
    const value = fs.readFileSync(AUTOMATION_SESSION_PATH, "utf8").trim();
    return value || "";
  } catch {
    return "";
  }
}

let automationSessionSealed = AUTOMATION_SESSION_ENV || readPersistentAutomationSession();
const COOKIE_SESSION = "rp_session";
const COOKIE_FLOW = "rp_flow";
const key = crypto.createHash("sha256").update(SESSION_SECRET || "missing-secret").digest();

function randomState(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString("base64url")).join(".");
}

function unseal(token) {
  try {
    const [ivText, tagText, dataText] = String(token || "").split(".");
    if (!ivText || !tagText || !dataText) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataText, "base64url")),
      decipher.final()
    ]);
    return JSON.parse(plain.toString("utf8"));
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const keyName = part.slice(0, index).trim();
    if (keyName !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return "";
}

function setSecureCookie(res, name, value, maxAgeMs) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs
  });
}

function clearCookie(res, name) {
  res.clearCookie(name, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
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

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function githubRequest(token, path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "RepoPilot-X",
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = { message: raw };
  }
  if (!response.ok) {
    const error = new Error(body?.message || `GitHub API error ${response.status}`);
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

async function exchangeOAuth(params) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "RepoPilot-X"
    },
    body: new URLSearchParams(params)
  });
  const body = await response.json();
  if (!response.ok || body.error || !body.access_token) {
    const error = new Error(body.error_description || body.error || "OAuth GitHub impossible");
    error.details = body;
    throw error;
  }
  return body;
}

function sessionFromRequest(req) {
  return unseal(readCookie(req, COOKIE_SESSION));
}

function writeSession(res, session) {
  setSecureCookie(res, COOKIE_SESSION, seal(session), 180 * 24 * 60 * 60 * 1000);
}

function setAutomationSession(session) {
  automationSessionSealed = seal(session);
  try {
    fs.mkdirSync("/data", { recursive: true });
    const tempPath = AUTOMATION_SESSION_PATH + ".tmp";
    fs.writeFileSync(tempPath, automationSessionSealed, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tempPath, AUTOMATION_SESSION_PATH);
  } catch (error) {
    console.error("RepoPilot X persistent automation session write failed:", error?.message || error);
  }
}

function automationAuthorized(req) {
  const supplied = String(req.headers["x-automation-key"] || "");
  if (!AUTOMATION_KEY || supplied.length !== AUTOMATION_KEY.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(AUTOMATION_KEY));
}

async function validAutomationSession() {
  let session = unseal(automationSessionSealed);
  if (!session?.access_token || !session?.client_id || !session?.client_secret) return null;
  const expiresAt = Number(session.access_expires_at || 0);
  if (expiresAt && expiresAt <= Date.now() + 120000) {
    if (!session.refresh_token) return null;
    const refreshed = await exchangeOAuth({
      client_id: session.client_id,
      client_secret: session.client_secret,
      grant_type: "refresh_token",
      refresh_token: session.refresh_token
    });
    session = {
      ...session,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || session.refresh_token,
      access_expires_at: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : 0,
      refresh_expires_at: refreshed.refresh_token_expires_in
        ? Date.now() + refreshed.refresh_token_expires_in * 1000
        : session.refresh_expires_at || 0
    };
    setAutomationSession(session);
  }
  return session;
}

async function validSession(req, res) {
  let session = sessionFromRequest(req);
  if (!session?.access_token || !session?.client_id || !session?.client_secret) return null;

  const expiresAt = Number(session.access_expires_at || 0);
  if (expiresAt && expiresAt <= Date.now() + 120000) {
    if (!session.refresh_token) {
      clearCookie(res, COOKIE_SESSION);
      return null;
    }
    const refreshed = await exchangeOAuth({
      client_id: session.client_id,
      client_secret: session.client_secret,
      grant_type: "refresh_token",
      refresh_token: session.refresh_token
    });
    session = {
      ...session,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || session.refresh_token,
      access_expires_at: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : 0,
      refresh_expires_at: refreshed.refresh_token_expires_in
        ? Date.now() + refreshed.refresh_token_expires_in * 1000
        : session.refresh_expires_at || 0
    };
    writeSession(res, session);
  }
  return session;
}

async function githubSelfTest(token, login) {
  const suffix = Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex");
  const name = `repopilot-x-selftest-${suffix}`;
  let created = null;
  try {
    created = await githubRequest(token, "/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: "RepoPilot X authorization self-test — automatically removed",
        private: true,
        auto_init: false
      })
    });
    await githubRequest(token, `/repos/${encodeURIComponent(login)}/${encodeURIComponent(name)}`, {
      method: "DELETE"
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error.message,
      cleanup_url: created?.html_url || null
    };
  }
}

app.get("/auth/github/start", (req, res) => {
  if (!SESSION_SECRET) {
    return res.status(500).send("SESSION_SECRET manquant.");
  }

  const state = randomState();
  const unique = crypto.randomBytes(4).toString("hex");
  setSecureCookie(res, COOKIE_FLOW, seal({ stage: "manifest", state }), 60 * 60 * 1000);

  const manifest = {
    name: `RepoPilot-X-${unique}`,
    url: BASE_URL,
    description: "Création automatisée de repositories GitHub pour son propriétaire.",
    hook_attributes: {
      url: `${BASE_URL}/github/events`,
      active: false
    },
    redirect_url: `${BASE_URL}/auth/github/manifest/callback`,
    callback_urls: [`${BASE_URL}/auth/github/oauth/callback`],
    public: true,
    default_permissions: {
      administration: "write"
    },
    default_events: [],
    request_oauth_on_install: true
  };

  const action = `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`;
  const manifestValue = htmlEscape(JSON.stringify(manifest));

  res.type("html").send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connexion GitHub — RepoPilot X</title></head>
<body style="font-family:system-ui;background:#080b12;color:white;display:grid;place-items:center;min-height:100vh;margin:0">
<form id="manifestForm" action="${action}" method="post">
<input type="hidden" name="manifest" value="${manifestValue}">
<noscript><button type="submit">Continuer vers GitHub</button></noscript>
</form>
<div>Ouverture de GitHub…</div>
<script>document.getElementById("manifestForm").submit();</script>
</body></html>`);
});

app.get("/auth/github/manifest/callback", async (req, res) => {
  const flow = unseal(readCookie(req, COOKIE_FLOW));
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");

  if (!flow || flow.stage !== "manifest" || !code || state !== flow.state) {
    return res.status(400).send("Flux GitHub invalide ou expiré. Revenez à RepoPilot X et recommencez.");
  }

  try {
    const response = await fetch(`${API}/app-manifests/${encodeURIComponent(code)}/conversions`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "RepoPilot-X"
      }
    });
    const appData = await response.json();
    if (!response.ok || !appData.client_id || !appData.client_secret || !appData.slug) {
      throw new Error(appData.message || "Création de l'application GitHub impossible");
    }

    const installState = randomState();
    setSecureCookie(
      res,
      COOKIE_FLOW,
      seal({
        stage: "oauth",
        state: installState,
        client_id: appData.client_id,
        client_secret: appData.client_secret,
        app_slug: appData.slug
      }),
      60 * 60 * 1000
    );

    return res.redirect(
      302,
      `https://github.com/apps/${encodeURIComponent(appData.slug)}/installations/new?state=${encodeURIComponent(installState)}`
    );
  } catch (error) {
    return res.status(500).send(`GitHub App non créée : ${htmlEscape(error.message)}`);
  }
});

app.get("/auth/github/oauth/callback", async (req, res) => {
  const flow = unseal(readCookie(req, COOKIE_FLOW));
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");

  if (!flow || flow.stage !== "oauth" || !code || !flow.client_id || !flow.client_secret) {
    return res.status(400).send("Autorisation GitHub invalide ou expirée.");
  }
  if (state && state !== flow.state) {
    return res.status(400).send("État OAuth GitHub invalide.");
  }

  try {
    const tokenData = await exchangeOAuth({
      client_id: flow.client_id,
      client_secret: flow.client_secret,
      code,
      redirect_uri: `${BASE_URL}/auth/github/oauth/callback`
    });

    const me = await githubRequest(tokenData.access_token, "/user");
    if (String(me.login || "").toLowerCase() !== TARGET_LOGIN.toLowerCase()) {
      clearCookie(res, COOKIE_FLOW);
      return res.status(409).type("html").send(`Compte GitHub incorrect : <strong>${htmlEscape(me.login || "inconnu")}</strong>. RepoPilot attend <strong>${htmlEscape(TARGET_LOGIN)}</strong>. <a href="/auth/github/start">Recommencer</a>.`);
    }
    const selftest = await githubSelfTest(tokenData.access_token, me.login);
    if (!selftest.ok) {
      clearCookie(res, COOKIE_FLOW);
      return res.status(409).type("html").send(`Autorisation reçue pour <strong>${htmlEscape(me.login)}</strong>, mais le test réel de création a échoué : ${htmlEscape(selftest.message || "erreur inconnue")}. <a href="/auth/github/start">Recommencer</a>.`);
    }

    const session = {
      client_id: flow.client_id,
      client_secret: flow.client_secret,
      app_slug: flow.app_slug,
      login: me.login,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || "",
      access_expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : 0,
      refresh_expires_at: tokenData.refresh_token_expires_in
        ? Date.now() + tokenData.refresh_token_expires_in * 1000
        : 0,
      selftest_ok: selftest.ok,
      connected_at: Date.now()
    };

    writeSession(res, session);
    setAutomationSession(session);
    clearCookie(res, COOKIE_FLOW);

    const query = selftest.ok
      ? "?authorized=1&selftest=pass"
      : `?authorized=1&selftest=fail&message=${encodeURIComponent(selftest.message || "Self-test failed")}`;
    return res.redirect(302, "/" + query);
  } catch (error) {
    return res.status(500).send(`Autorisation GitHub échouée : ${htmlEscape(error.message)}`);
  }
});

app.post("/github/events", (_req, res) => res.status(204).end());

app.post("/api/bridge/activate", async (req, res) => {
  try {
    const session = await validSession(req, res);
    if (!session) return res.status(401).json({ ok:false, error:"GITHUB_AUTH_REQUIRED" });
    setAutomationSession(session);
    return res.json({ ok:true, bridge:true, login:session.login || null });
  } catch (error) {
    return res.status(500).json({ ok:false, error:"BRIDGE_ACTIVATION_FAILED", message:error.message });
  }
});

app.get("/api/automation/public-status", async (_req, res) => {
  try {
    const session = await validAutomationSession();
    if (!session) return res.json({ ok:true, ready:false });
    const me = await githubRequest(session.access_token, "/user");
    return res.json({ ok:true, ready:true, login:me.login, selftest:Boolean(session.selftest_ok) });
  } catch {
    return res.json({ ok:true, ready:false });
  }
});

app.get("/api/automation/status", async (req, res) => {
  if (!automationAuthorized(req)) return res.status(403).json({ ok:false, error:"FORBIDDEN" });
  try {
    const session = await validAutomationSession();
    if (!session) return res.json({ ok:true, ready:false });
    const me = await githubRequest(session.access_token, "/user");
    return res.json({ ok:true, ready:true, login:me.login, selftest:Boolean(session.selftest_ok) });
  } catch (error) {
    return res.status(error.status || 500).json({ ok:false, ready:false, error:error.message });
  }
});

app.get("/api/automation/session-export", async (req, res) => {
  if (!automationAuthorized(req)) return res.status(403).json({ ok:false, error:"FORBIDDEN" });
  if (!automationSessionSealed) return res.status(404).json({ ok:false, error:"NO_AUTOMATION_SESSION" });
  return res.json({ ok:true, sealed_session:automationSessionSealed });
});

app.post("/api/automation/repos", async (req, res) => {
  if (!automationAuthorized(req)) return res.status(403).json({ ok:false, error:"FORBIDDEN" });
  const session = await validAutomationSession();
  if (!session) return res.status(401).json({ ok:false, error:"AUTOMATION_NOT_READY" });

  const name = normalizeName(req.body?.name);
  if (!name) return res.status(400).json({ ok:false, error:"INVALID_NAME" });

  const payload = {
    name,
    description:sanitizeText(req.body?.description),
    private:Boolean(req.body?.private),
    auto_init:req.body?.auto_init !== false,
    has_issues:req.body?.has_issues !== false,
    delete_branch_on_merge:true
  };
  const gitignore = sanitizeText(req.body?.gitignore_template, 64);
  const license = sanitizeText(req.body?.license_template, 64);
  if (gitignore && gitignore !== "none") payload.gitignore_template = gitignore;
  if (license && license !== "none") payload.license_template = license;

  try {
    const repo = await githubRequest(session.access_token, "/user/repos", {
      method:"POST",
      body:JSON.stringify(payload)
    });
    return res.status(201).json({
      ok:true,
      repo:{
        id:repo.id,
        name:repo.name,
        full_name:repo.full_name,
        html_url:repo.html_url,
        private:repo.private,
        default_branch:repo.default_branch
      },
      session_rotated:Boolean(session.access_expires_at)
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok:false,
      error:"GITHUB_CREATE_FAILED",
      message:error.message,
      details:error.details || null
    });
  }
});


app.get("/api/automation/bootstrap-create", async (req, res) => {
  const expected = String(process.env.BOOTSTRAP_TOKEN || "");
  const supplied = String(req.query?.token || "");
  if (!expected || supplied.length !== expected.length) return res.status(403).json({ ok:false, error:"FORBIDDEN" });
  if (!crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return res.status(403).json({ ok:false, error:"FORBIDDEN" });
  const session = await validAutomationSession();
  if (!session) return res.status(401).json({ ok:false, error:"AUTOMATION_NOT_READY" });
  const name = normalizeName(req.query?.name);
  if (!name) return res.status(400).json({ ok:false, error:"INVALID_NAME" });
  try {
    const repo = await githubRequest(session.access_token, "/user/repos", {
      method:"POST",
      body:JSON.stringify({
        name,
        description:"BetGPT Railway deployment source",
        private:true,
        auto_init:true,
        has_issues:true,
        delete_branch_on_merge:true
      })
    });
    return res.status(201).json({ ok:true, repo:{ id:repo.id, name:repo.name, full_name:repo.full_name, html_url:repo.html_url, default_branch:repo.default_branch } });
  } catch (error) {
    return res.status(error.status || 500).json({ ok:false, error:"GITHUB_CREATE_FAILED", message:error.message, details:error.details || null });
  }
});

app.post("/api/logout", (_req, res) => {
  clearCookie(res, COOKIE_SESSION);
  clearCookie(res, COOKIE_FLOW);
  res.json({ ok: true });
});

app.get("/api/health", async (req, res) => {
  try {
    const session = await validSession(req, res);
    if (!session) {
      return res.json({
        ok: true,
        service: true,
        github: false,
        authorization_url: "/auth/github/start"
      });
    }
    const me = await githubRequest(session.access_token, "/user");
    return res.json({
      ok: true,
      service: true,
      github: true,
      login: me.login,
      selftest: Boolean(session.selftest_ok)
    });
  } catch (error) {
    if (error.status === 401) clearCookie(res, COOKIE_SESSION);
    return res.json({
      ok: true,
      service: true,
      github: false,
      reason: error.message,
      authorization_url: "/auth/github/start"
    });
  }
});

app.post("/api/repos", async (req, res) => {
  let session;
  try {
    session = await validSession(req, res);
  } catch {
    session = null;
  }
  if (!session) {
    return res.status(401).json({
      ok: false,
      error: "GITHUB_AUTH_REQUIRED",
      message: "Autorisation GitHub requise une seule fois.",
      authorize_url: "/auth/github/start"
    });
  }

  const name = normalizeName(req.body?.name);
  if (!name) return res.status(400).json({ ok: false, error: "INVALID_NAME" });

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
    const repo = await githubRequest(session.access_token, "/user/repos", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return res.status(201).json({
      ok: true,
      repo: {
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        private: repo.private,
        default_branch: repo.default_branch
      }
    });
  } catch (error) {
    if (error.status === 401) clearCookie(res, COOKIE_SESSION);
    return res.status(error.status || 500).json({
      ok: false,
      error: "GITHUB_CREATE_FAILED",
      message: error.message,
      details: error.details || null
    });
  }
});

app.post("/api/repos/batch", async (req, res) => {
  let session;
  try {
    session = await validSession(req, res);
  } catch {
    session = null;
  }
  if (!session) {
    return res.status(401).json({
      ok: false,
      error: "GITHUB_AUTH_REQUIRED",
      authorize_url: "/auth/github/start"
    });
  }

  const items = Array.isArray(req.body?.repos) ? req.body.repos.slice(0, 20) : [];
  if (!items.length) return res.status(400).json({ ok: false, error: "EMPTY_BATCH" });

  const results = [];
  for (const item of items) {
    const name = normalizeName(item?.name);
    if (!name) {
      results.push({ ok: false, name: "", error: "INVALID_NAME" });
      continue;
    }

    const payload = {
      name,
      description: sanitizeText(item?.description),
      private: Boolean(item?.private),
      auto_init: item?.auto_init !== false,
      has_issues: item?.has_issues !== false,
      delete_branch_on_merge: true
    };

    const gitignore = sanitizeText(item?.gitignore_template, 64);
    const license = sanitizeText(item?.license_template, 64);
    if (gitignore && gitignore !== "none") payload.gitignore_template = gitignore;
    if (license && license !== "none") payload.license_template = license;

    try {
      const repo = await githubRequest(session.access_token, "/user/repos", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      results.push({
        ok: true,
        name,
        html_url: repo.html_url,
        full_name: repo.full_name
      });
    } catch (error) {
      results.push({
        ok: false,
        name,
        error: error.message,
        status: error.status || 500
      });
    }
  }

  return res.status(results.every((item) => item.ok) ? 201 : 207).json({
    ok: results.every((item) => item.ok),
    results
  });
});

app.use((err, _req, res, _next) => {
  console.error("RepoPilot X error:", err?.message || err);
  res.status(500).json({
    ok: false,
    error: "INTERNAL_ERROR",
    message: err?.message || "Unknown error"
  });
});



async function runBetgptRepoBootstrap() {
  if (process.env.BETGPT_REPO_BOOTSTRAP !== "1") return;
  try {
    const session = await validAutomationSession();
    if (!session) {
      console.error("BETGPT_REPO_BOOTSTRAP: automation session unavailable");
      return;
    }
    const repoName = "betgpt-railway";
    try {
      await githubRequest(session.access_token, "/user/repos", {
        method: "POST",
        body: JSON.stringify({
          name: repoName,
          description: "BetGPT.live Railway production source",
          private: true,
          auto_init: true,
          has_issues: true,
          delete_branch_on_merge: true
        })
      });
      console.log("BETGPT_REPO_BOOTSTRAP_CREATED", repoName);
    } catch (error) {
      if (error.status === 422) {
        console.log("BETGPT_REPO_BOOTSTRAP_EXISTS", repoName);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("BETGPT_REPO_BOOTSTRAP_FAILED", error?.message || error);
  }
}

runBetgptRepoBootstrap();

app.listen(PORT, () => {
  console.log(`RepoPilot X listening on ${PORT}`);
});
