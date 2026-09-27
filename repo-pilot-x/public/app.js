const $ = (s) => document.querySelector(s);
const log = $("#log");
const health = $("#health");
const connectBtn = $("#connectBtn");
const authNote = $("#authNote");

function addLog(message, kind = "info", href = "") {
  if (log.querySelector(".muted")) log.innerHTML = "";
  const row = document.createElement("div");
  row.className = "logRow " + kind;
  const stamp = new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  row.innerHTML = `<span class="stamp">${stamp}</span><span class="msg"></span>`;
  row.querySelector(".msg").textContent = message;
  if (href) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "ouvrir";
    row.appendChild(a);
  }
  log.prepend(row);
}

function showAuth() {
  connectBtn.classList.remove("hidden");
  authNote.classList.remove("hidden");
}

function hideAuth() {
  connectBtn.classList.add("hidden");
  authNote.classList.add("hidden");
}

async function checkHealth() {
  try {
    const r = await fetch("/api/health", { credentials: "same-origin" });
    const data = await r.json();
    if (data.github) {
      try {
        await fetch("/api/bridge/activate", { method:"POST", credentials:"same-origin" });
      } catch {}
      health.className = "status ok";
      health.textContent = `GitHub connecté : @${data.login}${data.selftest ? " · création vérifiée" : ""}`;
      hideAuth();
    } else {
      health.className = "status warn";
      health.textContent = "GitHub : autorisation unique requise";
      showAuth();
    }
  } catch {
    health.className = "status bad";
    health.textContent = "Backend indisponible";
    showAuth();
  }
}

function maybeReportCallback() {
  const params = new URLSearchParams(location.search);
  if (params.get("authorized") === "1") {
    if (params.get("selftest") === "pass") {
      addLog("Autorisation GitHub terminée. Test réel de création + suppression : PASS.", "ok");
    } else {
      addLog("GitHub est autorisé, mais le test réel n’a pas entièrement réussi : " + (params.get("message") || "erreur inconnue"), "bad");
    }
    history.replaceState({}, "", "/");
  }
}

function handleAuthRequired(data) {
  if (data?.authorize_url) location.href = data.authorize_url;
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab === "single" ? "#singleForm" : "#batchForm").classList.add("active");
  });
});

$("#singleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  button.textContent = "Création…";
  const payload = {
    name: $("#name").value,
    description: $("#description").value,
    private: $("#visibility").value === "private",
    auto_init: $("#autoInit").checked,
    gitignore_template: $("#gitignore").value,
    license_template: $("#license").value
  };

  try {
    const r = await fetch("/api/repos", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (r.status === 401 && data.error === "GITHUB_AUTH_REQUIRED") {
      handleAuthRequired(data);
      return;
    }
    if (data.ok) {
      addLog(`Créé : ${data.repo.full_name}`, "ok", data.repo.html_url);
      $("#name").value = "";
      $("#description").value = "";
    } else {
      addLog(`Échec : ${data.message || data.error}`, "bad");
    }
  } catch (err) {
    addLog(`Erreur réseau : ${err.message}`, "bad");
  } finally {
    button.disabled = false;
    button.textContent = "Créer maintenant";
  }
});

$("#batchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const names = $("#batchNames").value
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!names.length) return;

  const button = e.submitter;
  button.disabled = true;
  button.textContent = "Création de la série…";

  try {
    const r = await fetch("/api/repos/batch", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repos: names.map((name) => ({
          name,
          private: $("#batchVisibility").value === "private",
          auto_init: true,
          gitignore_template: $("#batchGitignore").value,
          license_template: "mit"
        }))
      })
    });

    const data = await r.json();
    if (r.status === 401 && data.error === "GITHUB_AUTH_REQUIRED") {
      handleAuthRequired(data);
      return;
    }

    for (const item of data.results || []) {
      addLog(
        item.ok ? `Créé : ${item.full_name}` : `Échec ${item.name} : ${item.error}`,
        item.ok ? "ok" : "bad",
        item.html_url || ""
      );
    }
    if (data.results?.some((x) => x.ok)) $("#batchNames").value = "";
  } catch (err) {
    addLog(`Erreur réseau : ${err.message}`, "bad");
  } finally {
    button.disabled = false;
    button.textContent = "Créer toute la série";
  }
});

$("#clear").addEventListener("click", () => {
  log.innerHTML = '<div class="muted">Aucune création pour l’instant.</div>';
});

maybeReportCallback();
checkHealth();