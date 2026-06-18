/* ===================================================================
   🏏 Cricket Score Tracker
   Pure HTML/CSS/JS. State is persisted to localStorage on every change,
   so a refresh keeps the match exactly where it was.
   =================================================================== */

const STORAGE_KEY = "cricket_scorer_v1";
const BALLS_PER_OVER = 6;

/* ---------- Default / fresh state ---------- */
function freshState() {
  const players = [];
  for (let i = 0; i < 11; i++) {
    players.push({
      name: "Player " + (i + 1),
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      status: "yet", // 'yet' | 'batting' | 'out'
    });
  }
  players[0].status = "batting";
  players[1].status = "batting";

  return {
    teamName: "Team A",
    players,
    striker: 0,        // index of player on strike
    nonStriker: 1,     // index of player at non-striker end
    nextBatsman: 2,    // index of the next player to come in
    total: 0,
    wickets: 0,
    legalBalls: 0,     // total legal deliveries bowled
    extras: 0,
    partRuns: 0,       // current partnership runs
    partBalls: 0,      // current partnership balls
    thisOver: [],      // notation chips for the over in progress, e.g. {label,cls}
    overs: [],         // completed overs: { num, balls:[...], runs }
    dismissals: [],    // fall of wickets: history of out batsmen
    inningsOver: false,
  };
}

/* ---------- Load / save ---------- */
let state = load();
const history = []; // snapshots for Undo (newest last)

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (!s.dismissals) s.dismissals = [];   // backfill for older saves
      if (!s.teamName) s.teamName = "Team A";
      return s;
    }
  } catch (e) { /* ignore corrupt data */ }
  return freshState();
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* Snapshot the current state before a scoring action so Undo can revert. */
function snapshot() {
  history.push(JSON.stringify(state));
  if (history.length > 100) history.shift();
}

/* ===================================================================
   SCORING LOGIC
   =================================================================== */

/* Normal run off the bat: 0,1,2,3,4,6 */
function scoreRuns(runs) {
  if (state.inningsOver) return;
  snapshot();

  const b = state.players[state.striker];
  b.runs += runs;
  b.balls += 1;
  if (runs === 4) b.fours += 1;
  if (runs === 6) b.sixes += 1;

  state.total += runs;
  state.partRuns += runs;
  state.partBalls += 1;
  state.legalBalls += 1;

  let cls = "";
  if (runs === 0) cls = "dotball";
  else if (runs === 4) cls = "boundary";
  else if (runs === 6) cls = "six";
  pushChip(String(runs), cls);

  if (runs % 2 === 1) swapStrike();
  endOfOverCheck();
  commit();
}

/* Extras. type: wide | noball | bye | legbye. extraRuns = runs scored besides the penalty. */
function scoreExtra(type, extraRuns) {
  if (state.inningsOver) return;
  snapshot();
  extraRuns = extraRuns || 0;

  if (type === "wide") {
    // Wide = 1 penalty + any runs run. No ball faced, no legal ball.
    const total = 1 + extraRuns;
    state.total += total;
    state.extras += total;
    pushChip(extraRuns ? "Wd+" + extraRuns : "Wd", "extra");
    // batsmen change ends if an odd number of runs were physically run
    if (extraRuns % 2 === 1) swapStrike();
  } else if (type === "noball") {
    // No ball = 1 penalty + runs off the bat. Ball faced but NOT a legal ball.
    const b = state.players[state.striker];
    b.runs += extraRuns;
    b.balls += 1;
    if (extraRuns === 4) b.fours += 1;
    if (extraRuns === 6) b.sixes += 1;
    state.total += 1 + extraRuns;
    state.extras += 1;
    state.partRuns += 1 + extraRuns;
    state.partBalls += 1;
    pushChip(extraRuns ? "Nb+" + extraRuns : "Nb", "extra");
    if (extraRuns % 2 === 1) swapStrike();
  } else {
    // bye / legbye = legal ball, runs go to extras (not the batsman), ball faced.
    const b = state.players[state.striker];
    b.balls += 1;
    state.total += extraRuns;
    state.extras += extraRuns;
    state.partBalls += 1;
    state.legalBalls += 1;
    const label = (type === "bye" ? "B" : "Lb") + extraRuns;
    pushChip(label, "extra");
    if (extraRuns % 2 === 1) swapStrike();
    endOfOverCheck();
  }
  commit();
}

/* Wicket. newIdx = chosen incoming batsman index (or null if none left). */
function scoreWicket(newIdx) {
  if (state.inningsOver) return;
  snapshot();

  const out = state.players[state.striker];
  out.balls += 1;
  out.status = "out";

  state.legalBalls += 1;
  state.wickets += 1;

  // record the dismissal for the Fall-of-Wickets history
  state.dismissals.push({
    name: out.name,
    runs: out.runs,
    balls: out.balls,
    fours: out.fours,
    sixes: out.sixes,
    sr: strikeRate(out),
    partRuns: state.partRuns,
    partBalls: state.partBalls,
    wicketNum: state.wickets,
    teamScore: state.total + "/" + state.wickets,
    over: oversString(state.legalBalls),
  });

  state.partRuns = 0;
  state.partBalls = 0;
  pushChip("W", "w");

  if (state.wickets >= 10 || newIdx === null || newIdx === undefined) {
    state.inningsOver = true;
  } else {
    state.players[newIdx].status = "batting";
    state.striker = newIdx;
    if (newIdx >= state.nextBatsman) state.nextBatsman = newIdx + 1;
  }

  endOfOverCheck();
  commit();
}

/* Swap the two batsmen ends. */
function swapStrike() {
  const t = state.striker;
  state.striker = state.nonStriker;
  state.nonStriker = t;
}

/* If 6 legal balls are done, close the over: log it, swap strike, start fresh. */
function endOfOverCheck() {
  if (state.legalBalls > 0 && state.legalBalls % BALLS_PER_OVER === 0 && !state.inningsOver) {
    const overNum = state.legalBalls / BALLS_PER_OVER;
    const runsThisOver = state.thisOver.reduce((s, c) => s + c.runs, 0);
    state.overs.unshift({ num: overNum, balls: state.thisOver.slice(), runs: runsThisOver });
    state.thisOver = [];
    swapStrike();
    showToast("Over " + overNum + " complete · " + runsThisOver + " run" + (runsThisOver === 1 ? "" : "s"));
  }
}

/* Add a chip to the current over. We stash the runs value for over totals. */
function pushChip(label, cls) {
  // figure out runs represented by this delivery for the over total
  let runs = 0;
  if (/^\d+$/.test(label)) runs = parseInt(label, 10);
  else if (label.startsWith("Wd")) runs = 1 + extraOf(label);
  else if (label.startsWith("Nb")) runs = 1 + extraOf(label);
  else if (label.startsWith("B") || label.startsWith("Lb")) runs = extraOf(label);
  else if (label === "W") runs = 0;
  state.thisOver.push({ label, cls, runs });
}
function extraOf(label) {
  const m = label.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/* ---------- Undo ---------- */
function undo() {
  if (history.length === 0) { showToast("Nothing to undo"); return; }
  state = JSON.parse(history.pop());
  save();
  render();
  showToast("Last ball undone");
}

/* Persist + re-render after any change. */
function commit() {
  save();
  render();
}

/* ===================================================================
   RENDERING
   =================================================================== */
const $ = (id) => document.getElementById(id);

function oversString(balls) {
  return Math.floor(balls / BALLS_PER_OVER) + "." + (balls % BALLS_PER_OVER);
}
function strikeRate(p) {
  return p.balls === 0 ? "0.0" : ((p.runs / p.balls) * 100).toFixed(1);
}

function render() {
  $("totalRuns").textContent = state.total;
  $("wickets").textContent = state.wickets;
  $("overs").textContent = oversString(state.legalBalls);
  $("extras").textContent = state.extras;
  if (document.activeElement !== $("teamName")) {
    $("teamName").textContent = state.teamName || "Team A";
  }

  const crr = state.legalBalls === 0 ? "0.00"
    : (state.total / (state.legalBalls / BALLS_PER_OVER)).toFixed(2);
  $("crr").textContent = crr;
  $("crr2").textContent = crr;

  const thisOverRuns = state.thisOver.reduce((s, c) => s + c.runs, 0);
  $("thisOverRuns").textContent = thisOverRuns;

  $("strikerRow").innerHTML = batRowHtml(state.striker, true);
  $("nonStrikerRow").innerHTML = batRowHtml(state.nonStriker, false);
  $("strikerRow").className = "bat-row striker";
  $("nonStrikerRow").className = "bat-row";

  $("partnership").textContent = state.partRuns + " (" + state.partBalls + ")";

  // this over
  $("bowlerBalls").textContent = countLegal(state.thisOver) + "/6";
  const chips = $("thisOver");
  if (state.thisOver.length === 0) {
    chips.innerHTML = '<div class="chip empty">new over starting…</div>';
  } else {
    const last = state.thisOver.length - 1;
    chips.innerHTML = state.thisOver.map((c, i) =>
      `<div class="chip ${c.cls}${i === last ? " fresh" : ""}">${c.label}</div>`).join("");
  }

  renderOverSummary();
  renderFow();

  if (state.inningsOver) showToast("Innings over — all out!");
}

function batRowHtml(idx, isStriker) {
  const p = state.players[idx];
  const dot = isStriker ? '<span class="striker-dot">●</span>' : "";
  return `
    <div class="bname">${dot}${escapeHtml(p.name)}</div>
    <div class="stat runs">${p.runs}</div>
    <div class="stat">${p.balls}</div>
    <div class="stat">${p.fours}</div>
    <div class="stat">${p.sixes}</div>
    <div class="stat">${strikeRate(p)}</div>`;
}

function countLegal(over) {
  return over.filter((c) => !c.label.startsWith("Wd") && !c.label.startsWith("Nb")).length;
}

function renderOverSummary() {
  const box = $("overSummary");
  if (state.overs.length === 0) {
    box.innerHTML = '<div class="empty-msg">No completed overs yet.</div>';
    return;
  }
  box.innerHTML = state.overs.map((ov) => `
    <div class="over-line">
      <span class="ov-num">Over ${ov.num}</span>
      <span class="ov-balls">${ov.balls.map((c) =>
        `<span class="mini ${c.cls}">${c.label}</span>`).join("")}</span>
      <span class="ov-runs">${ov.runs} run${ov.runs === 1 ? "" : "s"}</span>
    </div>`).join("");
}

function renderFow() {
  const box = $("fowList");
  const list = state.dismissals || [];
  if (list.length === 0) {
    box.innerHTML = '<div class="empty-msg">No wickets have fallen yet.</div>';
    return;
  }
  // newest dismissal first
  box.innerHTML = list.slice().reverse().map((d) => `
    <div class="fow-item">
      <div class="fow-wk">${d.wicketNum}</div>
      <div class="fow-main">
        <div class="fow-top">
          <span class="fow-name">${escapeHtml(d.name)}</span>
          <span class="fow-runs num">${d.runs} <span class="fow-balls">(${d.balls})</span></span>
        </div>
        <div class="fow-meta">
          <span>${d.fours}×4 · ${d.sixes}×6 · SR ${d.sr}</span>
          <span class="fow-score">${d.teamScore} · ${d.over} ov</span>
        </div>
      </div>
    </div>`).join("");
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ===================================================================
   MODALS & TOAST
   =================================================================== */
let toastTimer = null;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 1800);
}

/* ----- Roster (edit names) ----- */
function openRoster() {
  const list = $("rosterList");
  list.innerHTML = state.players.map((p, i) => {
    let tag = "";
    if (i === state.striker) tag = '<span class="tag crease">On strike</span>';
    else if (i === state.nonStriker) tag = '<span class="tag bat">Batting</span>';
    else if (p.status === "out") tag = '<span class="tag out">Out</span>';
    return `
      <div class="roster-item">
        <span class="rnum">${i + 1}</span>
        <input type="text" data-idx="${i}" value="${escapeHtml(p.name)}" maxlength="20" />
        ${tag}
      </div>`;
  }).join("");

  list.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const i = +e.target.dataset.idx;
      const v = e.target.value.trim();
      state.players[i].name = v || "Player " + (i + 1);
      save();
      render();
    });
  });
  $("rosterModal").classList.remove("hidden");
}

/* ----- Extra runs chooser (for wide/noball/bye/legbye) ----- */
let pendingExtra = null;
function openExtra(type) {
  pendingExtra = type;
  const titles = { wide: "Wide", noball: "No Ball", bye: "Bye", legbye: "Leg Bye" };
  const hints = {
    wide: "Extra runs run by batsmen (besides the 1 penalty).",
    noball: "Runs scored off the bat (besides the 1 penalty).",
    bye: "How many byes were run?",
    legbye: "How many leg byes were run?",
  };
  $("extraTitle").textContent = titles[type];
  $("extraHint").textContent = hints[type];

  const opts = (type === "wide" || type === "noball") ? [0, 1, 2, 3, 4, 6] : [1, 2, 3, 4];
  $("extraRunGrid").innerHTML = opts.map((r) =>
    `<button class="run-btn" data-x="${r}">${r}</button>`).join("");
  $("extraRunGrid").querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      scoreExtra(pendingExtra, +b.dataset.x);
      $("extraModal").classList.add("hidden");
    });
  });
  $("extraModal").classList.remove("hidden");
}

/* ----- Wicket: choose new batsman ----- */
function openWicket() {
  if (state.inningsOver) { showToast("Innings already over"); return; }
  const list = $("newBatsmanList");
  const available = state.players
    .map((p, i) => ({ p, i }))
    .filter((o) => o.p.status === "yet");

  if (available.length === 0 || state.wickets >= 9) {
    // last wicket — no replacement
    scoreWicket(null);
    showToast("All out!");
    return;
  }
  list.innerHTML = available.map((o) =>
    `<button class="pick-batsman" data-idx="${o.i}">
      <span class="rnum">${o.i + 1}</span>${escapeHtml(o.p.name)}
    </button>`).join("");
  list.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      scoreWicket(+b.dataset.idx);
      $("wicketModal").classList.add("hidden");
    });
  });
  $("wicketModal").classList.remove("hidden");
}

/* ----- Reset ----- */
function resetMatch() {
  if (!confirm("Start a new match? Current scorecard will be cleared.")) return;
  state = freshState();
  history.length = 0;
  save();
  render();
  showToast("New match started");
}

/* ===================================================================
   EVENT WIRING
   =================================================================== */
document.querySelectorAll(".run-btn[data-run]").forEach((btn) => {
  btn.addEventListener("click", () => scoreRuns(+btn.dataset.run));
});
document.querySelectorAll(".extra-btn[data-extra]").forEach((btn) => {
  btn.addEventListener("click", () => openExtra(btn.dataset.extra));
});

$("wicketBtn").addEventListener("click", openWicket);
$("undoBtn").addEventListener("click", undo);
$("resetBtn").addEventListener("click", resetMatch);

$("rosterBtn").addEventListener("click", openRoster);
$("closeRoster").addEventListener("click", () => $("rosterModal").classList.add("hidden"));

// editable team name
const teamEl = $("teamName");
function saveTeamName() {
  const v = teamEl.textContent.trim().slice(0, 24);
  state.teamName = v || "Team A";
  teamEl.textContent = state.teamName;
  save();
}
teamEl.addEventListener("blur", saveTeamName);
teamEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); teamEl.blur(); }
});
$("closeExtra").addEventListener("click", () => $("extraModal").classList.add("hidden"));
$("closeWicket").addEventListener("click", () => $("wicketModal").classList.add("hidden"));

// close any modal by clicking the dim backdrop
document.querySelectorAll(".modal").forEach((m) => {
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); });
});

// keyboard shortcuts: 0-6 score runs, u = undo
document.addEventListener("keydown", (e) => {
  if (document.querySelector(".modal:not(.hidden)")) return;
  if (e.target.tagName === "INPUT" || e.target.isContentEditable) return;
  if (["0", "1", "2", "3", "4", "6"].includes(e.key)) scoreRuns(+e.key);
  else if (e.key.toLowerCase() === "u") undo();
});

/* ---------- Boot ---------- */
render();
