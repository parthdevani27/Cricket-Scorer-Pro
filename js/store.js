/* =====================================================================
   store.js — match state model, persistence, undo, helpers
   Exposed as global `Store`.
   ===================================================================== */
window.Store = (function () {
  const KEY = "cricket_pro_v2";
  const BALLS_PER_OVER = 6;

  /* ---------- factories ---------- */
  function freshTeam(name, color) {
    const players = [];
    for (let i = 0; i < 11; i++) players.push({ name: "" });
    return { name, color, players, captain: 0, wk: 1, size: 11 };
  }

  function freshMatch() {
    return {
      phase: "setup",                 // setup | toss | match | result
      settings: { sound: true },
      teams: [
        freshTeam("Team A", Data.COLORS[0]),
        freshTeam("Team B", Data.COLORS[2]),
      ],
      overs: 5,
      toss: null,                     // { caller, call, result, winner, decision }
      battingFirst: null,
      innings: [],
      current: 0,                     // index of innings in play
      target: null,
      result: null,                   // { winner, loser, text, margin, potm }
    };
  }

  function freshInnings(battingTeam, bowlingTeam) {
    const batSize = (match && match.teams[battingTeam] && match.teams[battingTeam].size) || 11;
    const bowlSize = (match && match.teams[bowlingTeam] && match.teams[bowlingTeam].size) || 11;
    const bat = [];
    const bowl = [];
    for (let i = 0; i < batSize; i++) bat.push({ runs: 0, balls: 0, fours: 0, sixes: 0, status: "yet", out: "" });
    for (let i = 0; i < bowlSize; i++) bowl.push({ balls: 0, runs: 0, wickets: 0, maidens: 0, overRuns: 0, used: false });
    bat[0].status = "batting";
    if (batSize > 1) bat[1].status = "batting";
    return {
      battingTeam, bowlingTeam,
      total: 0, wickets: 0, legalBalls: 0, extras: 0,
      striker: 0, nonStriker: 1, nextBatsman: 2,
      bowler: null, prevBowler: null, needBowler: true,
      bat, bowl,
      thisOver: [], overs: [], dismissals: [],
      partRuns: 0, partBalls: 0,
      perBall: [],                    // {n, runs, cum, wicket} per legal-ball for charts
      inningsOver: false,
    };
  }

  /* ---------- persistence ---------- */
  let match = load();
  const history = [];                 // JSON snapshots for undo

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.teams) s.teams.forEach((t) => { if (!t.size) t.size = (t.players ? t.players.length : 11); });
        if (!s.settings) s.settings = { sound: true };
        return s;
      }
    } catch (e) { /* ignore */ }
    return freshMatch();
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(match)); }
  function reset() { match = freshMatch(); history.length = 0; save(); }

  function snapshot() {
    history.push(JSON.stringify(inn()));
    if (history.length > 200) history.shift();
  }
  function canUndo() { return history.length > 0; }
  function popUndo() {
    if (!history.length) return false;
    match.innings[match.current] = JSON.parse(history.pop());
    save();
    return true;
  }

  /* ---------- accessors ---------- */
  function inn() { return match.innings[match.current]; }
  function battingTeam() { return match.teams[inn().battingTeam]; }
  function bowlingTeam() { return match.teams[inn().bowlingTeam]; }
  function batName(i) { return battingTeam().players[i].name || ("Player " + (i + 1)); }
  function bowlName(i) { return bowlingTeam().players[i].name || ("Player " + (i + 1)); }

  /* ---------- formatting helpers ---------- */
  function oversStr(balls) {
    return Math.floor(balls / BALLS_PER_OVER) + "." + (balls % BALLS_PER_OVER);
  }
  function sr(p) { return p.balls === 0 ? "0.0" : ((p.runs / p.balls) * 100).toFixed(1); }
  function econ(b) {
    const ov = b.balls / BALLS_PER_OVER;
    return ov === 0 ? "0.0" : (b.runs / ov).toFixed(1);
  }
  function crr() {
    const i = inn();
    return i.legalBalls === 0 ? 0 : i.total / (i.legalBalls / BALLS_PER_OVER);
  }

  return {
    BALLS_PER_OVER,
    get match() { return match; },
    set match(m) { match = m; },
    freshMatch, freshInnings, freshTeam,
    save, load, reset,
    snapshot, canUndo, popUndo,
    inn, battingTeam, bowlingTeam, batName, bowlName,
    oversStr, sr, econ, crr,
  };
})();
