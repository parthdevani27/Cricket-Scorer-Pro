/* =====================================================================
   engine.js — scoring engine. Operates on the current innings in Store.
   Each scoring action returns an array of `events` the app reacts to
   (sounds / Three.js FX / modal prompts).
   Exposed as global `Engine`.
   ===================================================================== */
window.Engine = (function () {
  const BPO = Store.BALLS_PER_OVER;

  function inn() { return Store.inn(); }
  function maxBalls() { return Store.match.overs * BPO; }

  /* ---------- match lifecycle ---------- */
  function startMatch() {
    const m = Store.match;
    const batFirst = m.battingFirst;
    const bowlFirst = batFirst === 0 ? 1 : 0;
    m.innings = [Store.freshInnings(batFirst, bowlFirst)];
    m.current = 0;
    m.target = null;
    m.result = null;
    m.phase = "match";
    Store.save();
  }

  function startSecondInnings() {
    const m = Store.match;
    const first = m.innings[0];
    m.target = first.total + 1;
    const newBat = first.bowlingTeam;   // teams swap roles
    const newBowl = first.battingTeam;
    m.innings.push(Store.freshInnings(newBat, newBowl));
    m.current = 1;
    Store.save();
  }

  /* ---------- bowler management ---------- */
  function eligibleBowlers() {
    const i = inn();
    const out = [];
    for (let k = 0; k < i.bowl.length; k++) if (k !== i.prevBowler) out.push(k);
    return out;
  }
  function setBowler(idx) {
    const i = inn();
    i.bowler = idx;
    i.bowl[idx].used = true;
    i.needBowler = false;
    Store.save();
  }

  /* ---------- internal: commit one delivery ---------- */
  function pushChip(i, label, cls, runs) { i.thisOver.push({ label, cls, runs }); }

  function chargeBowler(i, runs) { if (i.bowler != null) { i.bowl[i.bowler].runs += runs; i.bowl[i.bowler].overRuns += runs; } }

  function legalBall(i) {
    i.legalBalls += 1;
    if (i.bowler != null) i.bowl[i.bowler].balls += 1;
  }

  function swap(i) { const t = i.striker; i.striker = i.nonStriker; i.nonStriker = t; }

  // called after a delivery is recorded; handles over close + innings end
  function afterDelivery(i, events, wasLegal) {
    // over complete?
    if (wasLegal && i.legalBalls % BPO === 0 && !i.inningsOver) {
      closeOver(i, events);
    }
    checkInningsEnd(i, events);
  }

  function closeOver(i, events) {
    const num = i.legalBalls / BPO;
    const runs = i.thisOver.reduce((s, c) => s + c.runs, 0);
    const wkts = i.thisOver.filter((c) => c.cls === "w").length;
    const cumRuns = i.total;
    const cumWkts = i.wickets;
    i.overs.push({ num, balls: i.thisOver.slice(), runs, wickets: wkts, cumRuns, cumWkts });
    // maiden?
    if (i.bowler != null && i.bowl[i.bowler].overRuns === 0) i.bowl[i.bowler].maidens += 1;
    if (i.bowler != null) i.bowl[i.bowler].overRuns = 0;
    i.prevBowler = i.bowler;
    i.thisOver = [];
    swap(i);
    i.needBowler = true;
    events.push({ type: "overComplete", num });
  }

  function checkInningsEnd(i, events) {
    if (i.inningsOver) return;
    // chase succeeded?
    if (Store.match.target != null && i.total >= Store.match.target) {
      i.inningsOver = true;
      events.push({ type: "inningsOver", reason: "chased" });
      events.push({ type: "matchOver" });
      return;
    }
    // overs exhausted
    if (i.legalBalls >= maxBalls()) {
      i.inningsOver = true;
      events.push({ type: "inningsOver", reason: "overs" });
      if (Store.match.current === 1) events.push({ type: "matchOver" });
    }
  }

  function milestoneEvents(i, idx, before, after, events) {
    Data.MILESTONES.forEach((m) => {
      if (before < m && after >= m) events.push({ type: "milestone", value: m, batterIdx: idx });
    });
  }

  /* ---------- public scoring actions ---------- */
  function scoreRuns(runs) {
    const i = inn();
    if (i.inningsOver || i.needBowler) return [];
    Store.snapshot();
    const events = [];
    const b = i.bat[i.striker];
    const before = b.runs;
    b.runs += runs; b.balls += 1;
    if (runs === 4) { b.fours += 1; events.push({ type: "four" }); }
    if (runs === 6) { b.sixes += 1; events.push({ type: "six" }); }
    i.total += runs; i.partRuns += runs; i.partBalls += 1;
    chargeBowler(i, runs);
    legalBall(i);

    let cls = runs === 0 ? "dotball" : runs === 4 ? "boundary" : runs === 6 ? "six" : "";
    pushChip(i, String(runs), cls, runs);
    milestoneEvents(i, i.striker, before, b.runs, events);
    if (runs % 2 === 1) swap(i);
    afterDelivery(i, events, true);
    Store.save();
    return events;
  }

  function scoreExtra(type, extraRuns) {
    const i = inn();
    if (i.inningsOver || i.needBowler) return [];
    Store.snapshot();
    extraRuns = extraRuns || 0;
    const events = [];

    if (type === "wide") {
      const tot = 1 + extraRuns;
      i.total += tot; i.extras += tot;
      chargeBowler(i, tot);
      pushChip(i, extraRuns ? "Wd+" + extraRuns : "Wd", "extra", tot);
      if (extraRuns % 2 === 1) swap(i);
      afterDelivery(i, events, false);
    } else if (type === "noball") {
      const b = i.bat[i.striker];
      const before = b.runs;
      b.runs += extraRuns; b.balls += 1;
      if (extraRuns === 4) { b.fours += 1; events.push({ type: "four" }); }
      if (extraRuns === 6) { b.sixes += 1; events.push({ type: "six" }); }
      i.total += 1 + extraRuns; i.extras += 1;
      i.partRuns += 1 + extraRuns; i.partBalls += 1;
      chargeBowler(i, 1 + extraRuns);
      pushChip(i, extraRuns ? "Nb+" + extraRuns : "Nb", "extra", 1 + extraRuns);
      milestoneEvents(i, i.striker, before, b.runs, events);
      if (extraRuns % 2 === 1) swap(i);
      afterDelivery(i, events, false);
    } else { // bye / legbye -> legal ball, not charged to bowler
      i.bat[i.striker].balls += 1;
      i.total += extraRuns; i.extras += extraRuns;
      i.partBalls += 1;
      legalBall(i);
      pushChip(i, (type === "bye" ? "B" : "Lb") + extraRuns, "extra", extraRuns);
      if (extraRuns % 2 === 1) swap(i);
      afterDelivery(i, events, true);
    }
    Store.save();
    return events;
  }

  // newIdx may be null (no replacement = all out). how = dismissal string. runOutNonStriker optional.
  function wicket(newIdx, how) {
    const i = inn();
    if (i.inningsOver || i.needBowler) return [];
    Store.snapshot();
    const events = [];
    const out = i.bat[i.striker];
    out.balls += 1;
    out.status = "out";
    out.out = how || "Wicket";
    legalBall(i);
    i.wickets += 1;

    // credit bowler unless run out
    if (i.bowler != null && how !== "Run Out") i.bowl[i.bowler].wickets += 1;

    i.dismissals.push({
      name: Store.batName(i.striker),
      runs: out.runs, balls: out.balls, fours: out.fours, sixes: out.sixes,
      sr: Store.sr(out), how: out.out,
      wicketNum: i.wickets,
      teamScore: i.total + "/" + i.wickets,
      over: Store.oversStr(i.legalBalls),
      partRuns: i.partRuns, partBalls: i.partBalls,
    });
    i.partRuns = 0; i.partBalls = 0;
    pushChip(i, "W", "w", 0);
    events.push({ type: "wicket", batterIdx: i.striker });

    const allOut = i.wickets >= i.bat.length - 1 || newIdx == null;
    if (allOut) {
      i.inningsOver = true;
      events.push({ type: "inningsOver", reason: "allout" });
      if (Store.match.current === 1) events.push({ type: "matchOver" });
    } else {
      i.bat[newIdx].status = "batting";
      i.striker = newIdx;
      if (newIdx >= i.nextBatsman) i.nextBatsman = newIdx + 1;
    }
    // over could also complete on this ball
    if (!i.inningsOver && i.legalBalls % BPO === 0) closeOver(i, events);
    // innings may also end because the overs are exhausted
    checkInningsEnd(i, events);
    Store.save();
    return events;
  }

  // retire striker or non-striker (idx), bring newIdx in. Not a wicket.
  function retire(idx, newIdx) {
    const i = inn();
    if (i.inningsOver) return [];
    Store.snapshot();
    i.bat[idx].status = "retired";
    if (idx === i.striker) i.striker = newIdx;
    else if (idx === i.nonStriker) i.nonStriker = newIdx;
    i.bat[newIdx].status = "batting";
    if (newIdx >= i.nextBatsman) i.nextBatsman = newIdx + 1;
    i.partRuns = 0; i.partBalls = 0;
    Store.save();
    return [{ type: "retire" }];
  }

  function undo() {
    const ok = Store.popUndo();
    return ok;
  }

  /* players who can still bat (yet to bat OR retired-can-return) */
  function availableBatsmen() {
    const i = inn();
    const out = [];
    for (let k = 0; k < i.bat.length; k++) {
      if (k === i.striker || k === i.nonStriker) continue;
      if (i.bat[k].status === "yet" || i.bat[k].status === "retired") out.push(k);
    }
    return out;
  }

  /* ---------- result / player of the match ---------- */
  function computeResult() {
    const m = Store.match;
    const a = m.innings[0], b = m.innings[1];
    const teamA = a.battingTeam, teamB = b.battingTeam; // b bats 2nd
    let winner, loser, margin, text;
    if (b.total >= m.target) {
      // chasing team won
      winner = b.battingTeam; loser = a.battingTeam;
      const wktsLeft = (b.bat.length - 1) - b.wickets;
      const ballsLeft = m.overs * BPO - b.legalBalls;
      margin = wktsLeft + " wicket" + (wktsLeft === 1 ? "" : "s")
        + " (" + ballsLeft + " ball" + (ballsLeft === 1 ? "" : "s") + " left)";
      text = m.teams[winner].name + " won by " + margin;
    } else if (b.total === m.target - 1) {
      winner = null; loser = null; margin = "Tie"; text = "Match Tied!";
    } else {
      winner = a.battingTeam; loser = b.battingTeam;
      const run = (m.target - 1) - b.total;
      margin = run + " run" + (run === 1 ? "" : "s");
      text = m.teams[winner].name + " won by " + margin;
    }
    const potm = playerOfMatch();
    m.result = { winner, loser, margin, text, potm };
    m.phase = "result";
    Store.save();
    return m.result;
  }

  // simple impact score across both innings
  function playerOfMatch() {
    const m = Store.match;
    const scores = {}; // key teamIdx:playerIdx
    m.innings.forEach((i) => {
      i.bat.forEach((p, k) => {
        const key = i.battingTeam + ":" + k;
        scores[key] = (scores[key] || 0) + p.runs + p.fours * 1 + p.sixes * 2;
      });
      i.bowl.forEach((p, k) => {
        const key = i.bowlingTeam + ":" + k;
        scores[key] = (scores[key] || 0) + p.wickets * 22 + p.maidens * 4;
      });
    });
    let best = null, bestVal = -1;
    Object.keys(scores).forEach((key) => {
      if (scores[key] > bestVal) { bestVal = scores[key]; best = key; }
    });
    if (!best) return null;
    const [t, k] = best.split(":").map(Number);
    // build a stat line from whichever innings they featured in
    let runs = 0, balls = 0, wkts = 0;
    m.innings.forEach((i) => {
      if (i.battingTeam === t) { runs += i.bat[k].runs; balls += i.bat[k].balls; }
      if (i.bowlingTeam === t) { wkts += i.bowl[k].wickets; }
    });
    return { team: t, idx: k, name: m.teams[t].players[k].name || ("Player " + (k + 1)), runs, balls, wkts, color: m.teams[t].color };
  }

  return {
    startMatch, startSecondInnings,
    eligibleBowlers, setBowler,
    scoreRuns, scoreExtra, wicket, retire, undo,
    availableBatsmen,
    computeResult, playerOfMatch,
    maxBalls,
  };
})();
