const JSON_HEADERS = {"content-type":"application/json"};

async function checked(url, options={}) {
  const r = await fetch(url, options);
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) {
    const err = new Error(`Google API ${r.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    err.status = r.status; err.body = body; throw err;
  }
  return body;
}

export async function getGoogleAccessToken(env=process.env) {
  if (env.GOOGLE_ACCESS_TOKEN) return env.GOOGLE_ACCESS_TOKEN;
  const {GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN} = env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Missing Google OAuth credentials: set GOOGLE_ACCESS_TOKEN or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN");
  }
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const data = await checked("https://oauth2.googleapis.com/token", {
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body
  });
  if (!data?.access_token) throw new Error("Google OAuth refresh succeeded without access_token");
  return data.access_token;
}

function auth(token, extra={}) {
  return {authorization:`Bearer ${token}`, ...extra};
}

export async function getVerificationToken({identifier,type,method,token}) {
  return checked("https://www.googleapis.com/siteVerification/v1/token", {
    method:"POST",
    headers:auth(token, JSON_HEADERS),
    body:JSON.stringify({site:{identifier,type},verificationMethod:method})
  });
}

export async function verifyOwnership({identifier,type,method,token}) {
  const url = new URL("https://www.googleapis.com/siteVerification/v1/webResource");
  url.searchParams.set("verificationMethod", method);
  return checked(url, {
    method:"POST",
    headers:auth(token, JSON_HEADERS),
    body:JSON.stringify({site:{identifier,type}})
  });
}

export async function addSearchConsoleProperty(siteUrl, token) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}`;
  return checked(url, {method:"PUT", headers:auth(token)});
}

export async function getSearchConsoleProperty(siteUrl, token) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}`;
  return checked(url, {method:"GET", headers:auth(token)});
}

export async function submitSitemap(siteUrl, sitemapUrl, token) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  return checked(url, {method:"PUT", headers:auth(token)});
}

export async function inspectUrl(siteUrl, inspectionUrl, token) {
  return checked("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method:"POST",
    headers:auth(token, JSON_HEADERS),
    body:JSON.stringify({siteUrl, inspectionUrl, languageCode:"fr-FR"})
  });
}
