(() => {
  const host = location.hostname.replace(/^www\./, "").toLowerCase();
  const REGISTRY_URL = "https://dr-starck66.github.io/zip-github/astra-google-registry.json";

  function loadGa4(id) {
    if (!/^G-[A-Z0-9]+$/i.test(id || "")) return;
    if (window.__ASTRA_GA4_LOADED__ === id) return;
    window.__ASTRA_GA4_LOADED__ = id;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id, { send_page_view: true });

    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
  }

  fetch(REGISTRY_URL, { cache: "no-store" })
    .then(r => r.ok ? r.json() : Promise.reject(new Error("registry_http_" + r.status)))
    .then(registry => {
      const cfg = registry && (registry[host] || registry["*"]);
      if (!cfg) return;
      if (cfg.ga4) loadGa4(String(cfg.ga4).trim());
    })
    .catch(() => {});
})();