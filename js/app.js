/* =====================================================================
   app.js — orchestrator: boots the app, wires every control, drives the
   match flow (bowler prompts, wickets, innings break, result, analysis).
   Exposed as global `App`.
   ===================================================================== */
window.App = (function () {
  const $ = (id) => document.getElementById(id);
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function accent() { return Store.battingTeam().color; }

  /* ---------- generic modal helpers ---------- */
  function open(id) { $(id).classList.remove("hidden"); }
  function close(id) { $(id).classList.add("hidden"); }

  /* ============ MATCH ENTRY ============ */
  function enterMatch() {
    Store.match.phase = "match";
    Store.save();
    UI.showScreen("match");
    setTimeout(() => FX.initCharacter(Store.battingTeam().color), 60);
    UI.renderMatch();
    const i = Store.inn();
    if (i.inningsOver) {
      // resumed (or fell through) into a finished innings — route correctly
      if (Store.match.current === 1) finishMatch();
      else openInningsBreak();
      return;
    }
    if (i.needBowler) openBowler();
  }

  /* ============ SCORING ============ */
  function runAction(eventsFn) {
    const events = eventsFn();
    UI.renderMatch();
    processEvents(events || []);
  }

  function processEvents(events) {
    const col = accent();
    let matchOver = false, inningsOver = false, overComplete = false;
    events.forEach((e) => {
      if (e.type === "four") { Sound.play("four"); FX.charMood("happy"); FX.pop(col, false); }
      else if (e.type === "six") { Sound.play("six"); FX.charMood("happy"); FX.pop(col, true); }
      else if (e.type === "wicket") { Sound.play("wicket"); FX.charMood("sad"); }
      else if (e.type === "milestone") { Sound.play("milestone"); FX.celebrate(col); UI.toast("🎉 " + e.value + "! " + Store.batName(e.batterIdx)); }
      else if (e.type === "overComplete") overComplete = true;
      else if (e.type === "inningsOver") inningsOver = true;
      else if (e.type === "matchOver") matchOver = true;
    });

    if (matchOver) { setTimeout(finishMatch, 1300); return; }
    if (inningsOver) { setTimeout(openInningsBreak, 1100); return; }
    if (overComplete) { setTimeout(openBowler, 350); UI.toast("Over complete — pick a bowler"); }
  }

  /* ============ BOWLER SELECTION ============ */
  function openBowler() {
    const i = Store.inn();
    if (i.inningsOver) return;
    const list = $("bowlerList");
    const elig = Engine.eligibleBowlers();
    $("bowlerHint").textContent = i.prevBowler == null
      ? "Who bowls the first over?"
      : Store.bowlName(i.prevBowler) + " bowled the last over. Pick another bowler.";
    list.innerHTML = elig.map((k) => {
      const b = i.bowl[k];
      const fig = b.balls ? ` <span class="rsub">${b.wickets}-${b.runs} (${Store.oversStr(b.balls)})</span>` : "";
      return `<button class="pick-batsman" data-idx="${k}"><span class="rnum">${k + 1}</span>${esc(Store.bowlName(k))}${fig}</button>`;
    }).join("");
    list.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        Engine.setBowler(+btn.dataset.idx);
        close("bowlerModal");
        UI.renderMatch();
      }));
    open("bowlerModal");
  }

  /* ============ WICKET ============ */
  let pendingHow = null;
  function openWicket() {
    const i = Store.inn();
    pendingHow = "Bowled"; // sensible default; user can change
    $("wicketTypes").innerHTML = Data.WICKET_TYPES.map((w) =>
      `<button class="wtype${w === "Bowled" ? " sel" : ""}" data-how="${w}">${w}</button>`).join("");
    const avail = Engine.availableBatsmen();
    const lastMan = i.wickets >= 9 || avail.length === 0;
    $("newBatHint").style.display = lastMan ? "none" : "";
    $("newBatsmanList").style.display = lastMan ? "none" : "";

    $("wicketTypes").querySelectorAll(".wtype").forEach((b) =>
      b.addEventListener("click", () => {
        pendingHow = b.dataset.how;
        $("wicketTypes").querySelectorAll(".wtype").forEach((x) => x.classList.toggle("sel", x === b));
        if (lastMan) { close("wicketModal"); runAction(() => Engine.wicket(null, pendingHow)); }
      }));

    if (!lastMan) {
      $("newBatsmanList").innerHTML = avail.map((k) =>
        `<button class="pick-batsman" data-idx="${k}"><span class="rnum">${k + 1}</span>${esc(Store.batName(k))}</button>`).join("");
      $("newBatsmanList").querySelectorAll("button").forEach((btn) =>
        btn.addEventListener("click", () => {
          if (!pendingHow) { UI.toast("Pick the dismissal type first"); return; }
          close("wicketModal");
          runAction(() => Engine.wicket(+btn.dataset.idx, pendingHow));
        }));
    }
    open("wicketModal");
  }

  /* ============ RETIRED ============ */
  let pendingRetire = null;
  function openRetired() {
    const i = Store.inn();
    pendingRetire = null;
    const both = [{ k: i.striker, lbl: "striker" }, { k: i.nonStriker, lbl: "non-striker" }];
    const avail = Engine.availableBatsmen();
    if (!avail.length) { UI.toast("No replacement batsmen left"); return; }
    function renderStep() {
      const list = $("retiredList");
      if (pendingRetire == null) {
        list.innerHTML = both.map((o) =>
          `<button class="pick-batsman" data-idx="${o.k}"><span class="rnum">${o.lbl}</span>${esc(Store.batName(o.k))} — ${i.bat[o.k].runs} (${i.bat[o.k].balls})</button>`).join("");
        list.querySelectorAll("button").forEach((btn) =>
          btn.addEventListener("click", () => { pendingRetire = +btn.dataset.idx; renderStep(); }));
      } else {
        list.innerHTML = `<div class="modal-hint">Replacement for ${esc(Store.batName(pendingRetire))}:</div>` +
          avail.map((k) => `<button class="pick-batsman" data-idx="${k}"><span class="rnum">${k + 1}</span>${esc(Store.batName(k))}</button>`).join("");
        list.querySelectorAll("button[data-idx]").forEach((btn) =>
          btn.addEventListener("click", () => {
            close("retiredModal");
            runAction(() => Engine.retire(pendingRetire, +btn.dataset.idx));
            UI.toast("🚑 " + Store.batName(+btn.dataset.idx) + " comes in");
          }));
      }
    }
    renderStep();
    open("retiredModal");
  }

  /* ============ EXTRAS ============ */
  let pendingExtra = null;
  function openExtra(type) {
    pendingExtra = type;
    const titles = { wide: "Wide", noball: "No Ball", bye: "Bye", legbye: "Leg Bye" };
    const hints = {
      wide: "Extra runs run (besides the 1 penalty).",
      noball: "Runs off the bat (besides the 1 penalty).",
      bye: "How many byes were run?",
      legbye: "How many leg byes were run?",
    };
    $("extraTitle").textContent = titles[type];
    $("extraHint").textContent = hints[type];
    const opts = (type === "wide" || type === "noball") ? [0, 1, 2, 3, 4, 6] : [1, 2, 3, 4];
    $("extraRunGrid").innerHTML = opts.map((r) => `<button class="run-btn" data-x="${r}">${r}</button>`).join("");
    $("extraRunGrid").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        close("extraModal");
        runAction(() => Engine.scoreExtra(pendingExtra, +b.dataset.x));
      }));
    open("extraModal");
  }

  /* ============ INNINGS BREAK ============ */
  function openInningsBreak() {
    if (Store.match.current !== 0) return;
    const first = Store.match.innings[0];
    const bt = Store.match.teams[first.battingTeam];
    const target = first.total + 1;
    $("inningsBreakBody").innerHTML = `
      <div class="ib-score" style="color:${bt.color}">${esc(bt.name)} ${first.total}/${first.wickets}</div>
      <div class="ib-sub">in ${Store.oversStr(first.legalBalls)} overs</div>
      <div class="ib-target">Target <b class="num">${target}</b></div>
      <p class="modal-hint">${esc(Store.match.teams[first.bowlingTeam].name)} need ${target} runs to win.</p>`;
    open("inningsModal");
  }

  /* ============ RESULT ============ */
  function finishMatch() {
    const res = Engine.computeResult();
    UI.showScreen("result");
    const banner = $("resultBanner");
    if (res.winner == null) {
      banner.textContent = "🤝 Match Tied!";
      banner.style.color = "#fbbf24";
    } else {
      const c = Store.match.teams[res.winner].color;
      banner.innerHTML = "🏆 " + esc(Store.match.teams[res.winner].name) + " win!";
      banner.style.color = c;
      document.documentElement.style.setProperty("--accent", c);
      FX.resultParty(c);
    }
    // both-teams scorecard (innings in batting order)
    const fmtOv = (b) => (b % 6 === 0 ? "" + b / 6 : Math.floor(b / 6) + "." + (b % 6));
    $("resultScorecard").innerHTML = Store.match.innings.map((i) => {
      const t = Store.match.teams[i.battingTeam];
      const isWin = res.winner === i.battingTeam;
      return `<div class="rs-row${isWin ? " win" : ""}">
        <span class="rs-team"><span class="rs-dot" style="background:${t.color}"></span>${esc(t.name)}${isWin ? ' <span class="rs-trophy">🏆</span>' : ""}</span>
        <span class="rs-score num">${i.total}/${i.wickets} <span class="rs-ov">(${fmtOv(i.legalBalls)})</span></span>
      </div>`;
    }).join("") + `<div class="rs-result">${esc(res.text)}</div>`;

    const p = res.potm;
    $("potm").innerHTML = p
      ? `<div class="potm-name" style="color:${p.color}">${esc(p.name)}</div>
         <div class="potm-team">${esc(Store.match.teams[p.team].name)}</div>
         <div class="potm-stats num">${p.runs} runs${p.balls ? " (" + p.balls + "b)" : ""}${p.wkts ? " · " + p.wkts + " wkts" : ""}</div>`
      : "—";
    Sound.play("win");
  }

  /* ============ ANALYSIS ============ */
  let activeTab = "projected";
  function openAnalysis() {
    if (!Store.inn() && Store.match.phase !== "result") { UI.toast("No match data yet"); return; }
    // projected score is only meaningful while setting a total (1st innings)
    const hideProjected = Store.match.current === 1;
    const projTab = document.querySelector('.atab[data-tab="projected"]');
    if (projTab) projTab.classList.toggle("hidden", hideProjected);
    if (hideProjected && activeTab === "projected") activeTab = "winprob";
    Analysis.resetOverGraph();   // default to the current batting team
    renderAnalysis();
    open("analysisModal");
  }
  function renderAnalysis() {
    document.querySelectorAll(".atab").forEach((t) => t.classList.toggle("active", t.dataset.tab === activeTab));
    $("analysisBody").innerHTML = Analysis.render(activeTab);
  }

  /* ============ SOUND TOGGLE ============ */
  function syncSoundIcons() {
    const on = Store.match.settings.sound;
    ["soundToggle", "soundToggle2", "soundToggle3"].forEach((id) => { const b = $(id); if (b) b.textContent = on ? "🔊" : "🔇"; });
  }
  function toggleSound() {
    Store.match.settings.sound = !Store.match.settings.sound;
    Sound.setEnabled(Store.match.settings.sound);
    Store.save();
    syncSoundIcons();
  }

  /* ============ NEW MATCH ============ */
  function newMatch() {
    if (!confirm("Start a brand new match? Current match will be cleared.")) return;
    FX.stopParty();
    Store.reset();
    Setup.refresh();
    document.querySelectorAll(".ts-name").forEach((inp) => { inp.value = Store.match.teams[+inp.dataset.team].name; });
    syncSoundIcons();
    UI.showScreen("setup");
  }

  /* ============ WIRING ============ */
  function wire() {
    // scoring
    document.querySelectorAll("#screen-match .run-btn[data-run]").forEach((b) =>
      b.addEventListener("click", () => runAction(() => Engine.scoreRuns(+b.dataset.run))));
    document.querySelectorAll("#screen-match .extra-btn[data-extra]").forEach((b) =>
      b.addEventListener("click", () => openExtra(b.dataset.extra)));
    $("wicketBtn").addEventListener("click", openWicket);
    $("retiredBtn").addEventListener("click", openRetired);
    $("undoBtn").addEventListener("click", () => { if (Engine.undo()) { UI.renderMatch(); UI.toast("Last ball undone"); } else UI.toast("Nothing to undo"); });

    // bowler card click when one is needed
    $("bowlerRow").addEventListener("click", () => { if (Store.inn() && Store.inn().needBowler) openBowler(); });

    // collapsible sections
    document.querySelectorAll(".collapse-head").forEach((h) =>
      h.addEventListener("click", () => { const c = $(h.dataset.target); if (c) c.classList.toggle("collapsed"); }));

    // modal close buttons
    [["closeExtra", "extraModal"], ["closeWicket", "wicketModal"], ["closeBowler", "bowlerModal"],
     ["closeRetired", "retiredModal"], ["closeAnalysis", "analysisModal"]].forEach(([btn, modal]) =>
      $(btn).addEventListener("click", () => close(modal)));

    // backdrop close (except bowler when mandatory)
    document.querySelectorAll(".modal").forEach((m) =>
      m.addEventListener("click", (e) => {
        if (e.target !== m) return;
        if (m.id === "bowlerModal" && Store.inn() && Store.inn().needBowler) return;
        if (m.id === "inningsModal") return;
        m.classList.add("hidden");
      }));

    // innings break
    $("start2ndBtn").addEventListener("click", () => {
      Engine.startSecondInnings();
      close("inningsModal");
      enterMatch();
    });

    // analysis
    $("analysisBtn").addEventListener("click", openAnalysis);
    $("resultAnalysisBtn").addEventListener("click", openAnalysis);
    document.querySelectorAll(".atab").forEach((t) =>
      t.addEventListener("click", () => { activeTab = t.dataset.tab; renderAnalysis(); }));
    // over-graph team switch (delegated — content is re-rendered)
    $("analysisBody").addEventListener("click", (e) => {
      const b = e.target.closest(".ograph-team");
      if (!b) return;
      Analysis.setOverGraph(+b.dataset.inn);
      renderAnalysis();
    });

    // result
    $("newMatchBtn").addEventListener("click", newMatch);

    // sound toggles
    ["soundToggle", "soundToggle2", "soundToggle3"].forEach((id) => { const b = $(id); if (b) b.addEventListener("click", toggleSound); });

    // keyboard shortcuts on match screen
    document.addEventListener("keydown", (e) => {
      if (Store.match.phase !== "match") return;
      if (document.querySelector(".modal:not(.hidden)")) return;
      if (e.target.tagName === "INPUT" || e.target.isContentEditable) return;
      if (["0", "1", "2", "3", "4", "6"].includes(e.key)) {
        if (!Store.inn().needBowler && !Store.inn().inningsOver) runAction(() => Engine.scoreRuns(+e.key));
      } else if (e.key.toLowerCase() === "u") {
        if (Engine.undo()) { UI.renderMatch(); }
      }
    });
  }

  /* ============ BOOT ============ */
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    Sound.setEnabled(Store.match.settings.sound);
    syncSoundIcons();
    Setup.init();
    Toss.wire();
    wire();

    // route to the saved phase
    const phase = Store.match.phase;
    if (phase === "match" && Store.match.innings.length) enterMatch();
    else if (phase === "result" && Store.match.result) { finishMatch(); }
    else if (phase === "toss") Toss.enter();
    else UI.showScreen("setup");
  }

  document.addEventListener("DOMContentLoaded", boot);
  // DOM is already parsed (scripts at end of body) — boot now if ready
  if (document.readyState !== "loading") boot();

  return { enterMatch, processEvents, openBowler };
})();
