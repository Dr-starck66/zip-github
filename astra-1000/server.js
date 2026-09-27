import express from "express";
import crypto from "node:crypto";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "128kb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const startedAt = new Date().toISOString();
const memory = [];

const AGENTS = [
  { id: "ORCHESTRATOR", role: "Décompose l'objectif et coordonne les autres agents." },
  { id: "OBSERVER", role: "Sépare les éléments explicitement fournis des inconnues." },
  { id: "HYPOTHESIS", role: "Produit plusieurs explications ou pistes concurrentes." },
  { id: "SKEPTIC", role: "Cherche les failles, contre-exemples et hypothèses alternatives." },
  { id: "EVIDENCE", role: "Attribue un statut épistémique à chaque affirmation." },
  { id: "EXPERIMENTER", role: "Propose des tests falsifiables et mesurables." },
  { id: "ARBITER", role: "Synthétise sans transformer une spéculation en fait." },
  { id: "MEMORY", role: "Conserve les campagnes et les leçons réutilisables." }
];

const VALID_STATES = ["OBSERVED", "SUPPORTED", "EXPERIMENTAL", "SPECULATIVE", "FALSIFIED"];

function cleanText(value, max = 8000) {
  return String(value || "").trim().slice(0, max);
}

function words(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function topConcepts(text) {
  const stop = new Set([
    "avec","dans","pour","que","qui","une","des","les","est","sur","pas","plus","comme","nous","vous",
    "the","and","for","with","that","this","from","are","was","what","how","why","can","could","would"
  ]);
  const counts = new Map();
  for (const w of words(text)) {
    if (w.length < 4 || stop.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0,8).map(([w]) => w);
}

function observe(question) {
  const concepts = topConcepts(question);
  return {
    observed: [
      { claim: "Une question explicite a été fournie par l'utilisateur.", state: "OBSERVED" },
      { claim: `Concepts dominants détectés : ${concepts.join(", ") || "aucun"}.`, state: "OBSERVED" }
    ],
    unknowns: [
      "Les faits externes pertinents n'ont pas encore été vérifiés par une source indépendante.",
      "Les contraintes quantitatives, si elles existent, doivent être mesurées avant validation."
    ],
    concepts
  };
}

function hypotheses(question, concepts) {
  const subject = concepts.slice(0,3).join(" / ") || "le problème";
  return [
    {
      id: "H1",
      statement: `Une approche distribuée et spécialisée pourrait améliorer le traitement de ${subject} par rapport à un agent unique.`,
      state: "SPECULATIVE"
    },
    {
      id: "H2",
      statement: `Le principal gain pourrait venir de la mémoire cumulative et de la réutilisation des résultats plutôt que d'une simple augmentation de taille du modèle.`,
      state: "SPECULATIVE"
    },
    {
      id: "H3",
      statement: `Une boucle de critique contradictoire et de falsification pourrait réduire les faux positifs sur cette question.`,
      state: "EXPERIMENTAL"
    },
    {
      id: "H4",
      statement: `La meilleure architecture pourrait dépendre davantage de l'orchestration, des outils et des données que du modèle central.`,
      state: "EXPERIMENTAL"
    }
  ];
}

function critique(items) {
  return items.map((item, index) => ({
    hypothesis: item.id,
    weakness:
      index === 0 ? "Risque de complexité d'orchestration et de duplication du travail." :
      index === 1 ? "Une mémoire cumulative peut également accumuler des erreurs non corrigées." :
      index === 2 ? "La critique croisée peut converger vers un consensus erroné si les agents partagent les mêmes biais." :
      "Sans benchmark externe, il est impossible d'attribuer le gain à l'architecture plutôt qu'aux données.",
    severity: index === 1 || index === 2 ? "HIGH" : "MEDIUM"
  }));
}

function experiments(hyps) {
  return hyps.map((h, i) => ({
    hypothesis: h.id,
    protocol:
      i === 0 ? "Comparer agent unique vs 4 agents spécialisés sur le même jeu de tâches et mesurer précision, coût et latence." :
      i === 1 ? "Exécuter les mêmes familles de tâches sur plusieurs sessions avec et sans mémoire cumulative." :
      i === 2 ? "Injecter volontairement des hypothèses fausses et mesurer le taux de détection par la couche critique." :
      "Faire varier modèle central, outils et orchestrateur séparément afin d'estimer leur contribution marginale.",
    metric: i === 0 ? "accuracy/cost/latency" : i === 1 ? "retention + regression rate" : i === 2 ? "false-claim detection rate" : "marginal performance gain"
  }));
}

function scoreHypothesis(h, critic) {
  let confidence = h.state === "EXPERIMENTAL" ? 0.35 : 0.2;
  if (critic.severity === "HIGH") confidence -= 0.08;
  return Math.max(0.05, Math.min(0.95, confidence));
}

function runCampaign(question) {
  const observation = observe(question);
  const hyps = hypotheses(question, observation.concepts);
  const critics = critique(hyps);
  const tests = experiments(hyps);
  const evaluated = hyps.map((h, i) => ({
    ...h,
    confidence: scoreHypothesis(h, critics[i]),
    critic: critics[i],
    experiment: tests[i]
  }));

  const run = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    question,
    epistemic_policy: {
      allowed_states: VALID_STATES,
      rule: "Une spéculation ne devient SUPPORTED qu'après apport de preuves ou résultats expérimentaux vérifiables."
    },
    agents: {
      ORCHESTRATOR: {
        objective: "Produire des pistes utiles tout en séparant strictement observation, hypothèse et preuve."
      },
      OBSERVER: observation,
      HYPOTHESIS: evaluated,
      SKEPTIC: critics,
      EXPERIMENTER: tests,
      EVIDENCE: {
        verified_external_sources: 0,
        note: "Aucune source externe n'est interrogée dans v0 ; toutes les conclusions externes restent non vérifiées."
      },
      ARBITER: {
        synthesis:
          "La campagne a produit des hypothèses concurrentes et des tests falsifiables. Aucune affirmation externe n'est promue au rang de fait sans preuve indépendante.",
        next_action:
          "Brancher un moteur de recherche documentaire et un ou plusieurs modèles réels, puis mesurer les hypothèses sur un benchmark reproductible."
      }
    }
  };

  memory.unshift({
    id: run.id,
    created_at: run.created_at,
    question: question.slice(0, 500),
    concepts: observation.concepts,
    hypothesis_count: evaluated.length
  });
  if (memory.length > 100) memory.length = 100;
  return run;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ASTRA-1000",
    version: "0.1.0",
    started_at: startedAt,
    agents: AGENTS.length,
    memory_runs: memory.length
  });
});

app.get("/api/architecture", (_req, res) => {
  res.json({
    name: "ASTRA-1000",
    version: "0.1.0",
    agents: AGENTS,
    epistemic_states: VALID_STATES,
    loop: ["OBSERVE", "HYPOTHESIZE", "CRITIQUE", "EXPERIMENT", "EVALUATE", "REMEMBER", "ITERATE"]
  });
});

app.get("/api/memory", (_req, res) => {
  res.json({ ok: true, count: memory.length, runs: memory.slice(0, 25) });
});

app.post("/api/run", (req, res) => {
  const question = cleanText(req.body?.question);
  if (!question) return res.status(400).json({ ok: false, error: "QUESTION_REQUIRED" });
  const result = runCampaign(question);
  res.json({ ok: true, result });
});

app.get("*", (_req, res) => {
  res.sendFile(new URL("./public/index.html", import.meta.url).pathname);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ASTRA-1000 v0.1.0 listening on ${PORT}`);
});
