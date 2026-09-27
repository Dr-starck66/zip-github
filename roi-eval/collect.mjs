import fs from "node:fs";

const leagues = {
  ER: "ned.1",
  PT: "por.1",
  SC: "sco.1",
  TR: "tur.1",
};

const START = Date.parse("2020-09-01T00:00:00Z");
const END = Date.now();

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", "Accept-Language": "en" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function parseEvent(e, league) {
  const comp = e?.competitions?.[0];
  const status = comp?.status?.type ?? e?.status?.type ?? {};
  if (!status.completed && status.state !== "post") return null;
  const comps = comp?.competitors ?? [];
  const h = comps.find(x => x.homeAway === "home");
  const a = comps.find(x => x.homeAway === "away");
  const gh = Number(h?.score), ga = Number(a?.score);
  const kickoff = String(comp?.date ?? e?.date ?? "");
  if (!e?.id || !h?.team?.id || !a?.team?.id || !Number.isFinite(gh) || !Number.isFinite(ga) || !kickoff) return null;
  const t = Date.parse(kickoff);
  if (!Number.isFinite(t) || t < START || t > END) return null;
  return {
    id: `espn-${e.id}`,
    league,
    kickoff,
    homeId: String(h.team.id),
    awayId: String(a.team.id),
    homeName: h.team.displayName ?? String(h.team.id),
    awayName: a.team.displayName ?? String(a.team.id),
    goalsHome: gh,
    goalsAway: ga,
    oddsHome: 0,
    oddsDraw: 0,
    oddsAway: 0,
    closingHome: 0,
    closingDraw: 0,
    closingAway: 0,
    sourceKind: "official-history",
  };
}

const all = [];
const audit = {};

for (const [league, slug] of Object.entries(leagues)) {
  const map = new Map();
  audit[league] = [];
  for (let year = 2020; year <= new Date().getUTCFullYear(); year++) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?limit=1000&dates=${year}&lang=en&region=gb`;
    try {
      const j = await fetchJson(url);
      const events = Array.isArray(j?.events) ? j.events : [];
      let parsed = 0;
      for (const e of events) {
        const row = parseEvent(e, league);
        if (row) { map.set(row.id, row); parsed++; }
      }
      audit[league].push({ year, events: events.length, parsed });
      console.log(league, year, "events", events.length, "parsed", parsed);
    } catch (err) {
      audit[league].push({ year, error: String(err) });
      console.error(league, year, err);
    }
  }
  const rows = [...map.values()].sort((a,b)=>a.kickoff.localeCompare(b.kickoff));
  console.log(league, "TOTAL", rows.length, rows[0]?.kickoff, rows.at(-1)?.kickoff);
  all.push(...rows);
}

all.sort((a,b)=>a.kickoff.localeCompare(b.kickoff));
fs.writeFileSync("new-leagues.json", JSON.stringify({ schema: 3, fetchedAt: Date.now(), matches: all }, null, 2));
fs.writeFileSync("audit.json", JSON.stringify(audit, null, 2));

if (all.length < 3000) {
  console.error("Too few rows:", all.length);
  process.exitCode = 2;
}
