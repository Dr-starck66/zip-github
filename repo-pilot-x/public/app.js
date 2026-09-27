const $ = (s) => document.querySelector(s);
const log = $("#log");
const health = $("#health");

function addLog(message, kind = "info", href = "") {
  if (log.querySelector(".muted")) log.innerHTML = "";
  const row = document.createElement("div");
  row.className = "logRow " + kind;
  const stamp = new Date().toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit",second:"2-digit"});
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

async function checkHealth() {
  try {
    const r = await fetch("/api/health");
    const data = await r.json();
    if (data.ok) {
      health.className = "status ok";
      health.textContent = `GitHub connecté : @${data.login}`;
    } else {
      health.className = "status warn";
      health.textContent = "GitHub à autoriser une seule fois";
    }
  } catch {
    health.className = "status bad";
    health.textContent = "Backend indisponible";
  }
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
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
    name:$("#name").value,
    description:$("#description").value,
    private:$("#visibility").value === "private",
    auto_init:$("#autoInit").checked,
    gitignore_template:$("#gitignore").value,
    license_template:$("#license").value
  };
  try {
    const r = await fetch("/api/repos", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    const data = await r.json();
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
  const names = $("#batchNames").value.split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0,20);
  if (!names.length) return;
  const button = e.submitter;
  button.disabled = true;
  button.textContent = "Création de la série…";
  try {
    const r = await fetch("/api/repos/batch", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        repos:names.map(name => ({
          name,
          private:$("#batchVisibility").value === "private",
          auto_init:true,
          gitignore_template:$("#batchGitignore").value,
          license_template:"mit"
        }))
      })
    });
    const data = await r.json();
    for (const item of data.results || []) {
      addLog(item.ok ? `Créé : ${item.full_name}` : `Échec ${item.name} : ${item.error}`, item.ok ? "ok" : "bad", item.html_url || "");
    }
    if (data.results?.some(x => x.ok)) $("#batchNames").value = "";
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

checkHealth();