/* =====================================================================
   ui.js — screen routing, team-colour theming, scoreboard rendering,
           toast. Exposed as global `UI`.
   ===================================================================== */
window.UI = (function () {
  const BPO = Store.BALLS_PER_OVER;
  const $ = (id) => document.getElementById(id);
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  /* ---------- screen router ---------- */
  const SCREENS = ["setup", "toss", "match", "result"];
  function showScreen(name) {
    SCREENS.forEach((s) => {
      const el = $("screen-" + s);
      if (el) el.classList.toggle("hidden", s !== name);
    });
    window.scrollTo(0, 0);
  }

  /* ---------- theming from team colours ---------- */
  function applyTheme(batColor, bowlColor) {
    const root = document.documentElement.style;
    if (batColor) root.setProperty("--accent", batColor);
    if (bowlColor) root.setProperty("--accent2", bowlColor);
  }
  function tint(hex, a) {
    // hex -> rgba string
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg, ms) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), ms || 1900);
  }

  /* ---------- match scoreboard ---------- */
  function batRowHtml(idx, isStriker) {
    const i = Store.inn();
    const p = i.bat[idx];
    const team = Store.battingTeam();
    let badge = "";
    if (team.captain === idx) badge += ' <span class="role">C</span>';
    if (team.wk === idx) badge += ' <span class="role">WK</span>';
    const dot = isStriker ? '<span class="striker-dot">●</span>' : "";
    return `
      <div class="bname">${dot}${esc(Store.batName(idx))}${badge}</div>
      <div class="stat runs">${p.runs}</div>
      <div class="stat">${p.balls}</div>
      <div class="stat">${p.fours}</div>
      <div class="stat">${p.sixes}</div>
      <div class="stat">${Store.sr(p)}</div>`;
  }

  function bowlerRowHtml() {
    const i = Store.inn();
    if (i.bowler == null) {
      return `<div class="bowl-empty">Select a bowler to begin the over…</div>`;
    }
    const b = i.bowl[i.bowler];
    return `
      <div class="bwname">🎯 ${esc(Store.bowlName(i.bowler))}</div>
      <div class="stat">${Store.oversStr(b.balls)}</div>
      <div class="stat">${b.maidens}</div>
      <div class="stat">${b.runs}</div>
      <div class="stat runs">${b.wickets}</div>
      <div class="stat">${Store.econ(b)}</div>`;
  }

  function countLegal(over) {
    return over.filter((c) => !c.label.startsWith("Wd") && !c.label.startsWith("Nb")).length;
  }

  function renderMatch() {
    const m = Store.match;
    const i = Store.inn();
    if (!i) return;

    const batTeam = Store.battingTeam(), bowlTeam = Store.bowlingTeam();
    applyTheme(batTeam.color, bowlTeam.color);

    $("matchTitle").textContent = "Innings " + (m.current + 1) + " of 2";
    $("batTeamName").textContent = batTeam.name;
    $("inningsLabel").textContent = (m.current === 0 ? "1st" : "2nd") + " Innings · " + bowlTeam.name + " bowling";
    $("maxOvers").textContent = m.overs;

    $("totalRuns").textContent = i.total;
    $("wickets").textContent = i.wickets;
    $("overs").textContent = Store.oversStr(i.legalBalls);
    $("extras").textContent = i.extras;

    const crr = Store.crr();
    $("crr").textContent = crr.toFixed(2);
    $("crr2").textContent = crr.toFixed(2);
    $("thisOverRuns").textContent = i.thisOver.reduce((s, c) => s + c.runs, 0);

    // chase panel
    const chase = $("chasePanel");
    if (m.current === 1 && m.target != null) {
      chase.classList.remove("hidden");
      const need = Math.max(0, m.target - i.total);
      const ballsLeft = Math.max(0, m.overs * BPO - i.legalBalls);
      const rrr = ballsLeft === 0 ? 0 : need / (ballsLeft / BPO);
      $("targetVal").textContent = m.target;
      $("needVal").textContent = need;
      $("ballsLeft").textContent = ballsLeft;
      $("rrr").textContent = rrr.toFixed(2);
    } else {
      chase.classList.add("hidden");
    }

    // batsmen
    $("strikerRow").innerHTML = batRowHtml(i.striker, true);
    $("strikerRow").className = "bat-row striker";
    $("nonStrikerRow").innerHTML = batRowHtml(i.nonStriker, false);
    $("nonStrikerRow").className = "bat-row";
    $("partnership").textContent = i.partRuns + " (" + i.partBalls + ")";

    // bowler
    $("bowlerRow").innerHTML = bowlerRowHtml();

    // this over
    $("bowlerBalls").textContent = countLegal(i.thisOver) + "/6";
    const chips = $("thisOver");
    if (i.thisOver.length === 0) {
      chips.innerHTML = '<div class="chip empty">new over…</div>';
    } else {
      const last = i.thisOver.length - 1;
      chips.innerHTML = i.thisOver.map((c, k) =>
        `<div class="chip ${c.cls}${k === last ? " fresh" : ""}">${c.label}</div>`).join("");
    }

    renderFow();
    renderOverSummary();

    // gate controls when a bowler must be chosen
    const gate = i.needBowler || i.inningsOver;
    document.querySelectorAll("#screen-match .run-btn, #screen-match .extra-btn, #wicketBtn, #retiredBtn")
      .forEach((b) => { b.disabled = gate; });
    $("undoBtn").disabled = !Store.canUndo();
  }

  function renderFow() {
    const i = Store.inn();
    const box = $("fowList");
    const list = i.dismissals || [];
    if (!list.length) { box.innerHTML = '<div class="empty-msg">No wickets have fallen yet.</div>'; return; }
    box.innerHTML = list.slice().reverse().map((d) => `
      <div class="fow-item">
        <div class="fow-wk">${d.wicketNum}</div>
        <div class="fow-main">
          <div class="fow-top"><span class="fow-name">${esc(d.name)}</span><span class="fow-runs num">${d.runs} <span class="fow-balls">(${d.balls})</span></span></div>
          <div class="fow-meta"><span>${esc(d.how)} · ${d.fours}×4 ${d.sixes}×6</span><span class="fow-score">${d.teamScore} · ${d.over} ov</span></div>
        </div>
      </div>`).join("");
  }

  function renderOverSummary() {
    const i = Store.inn();
    const box = $("overSummary");
    if (!i.overs.length) { box.innerHTML = '<div class="empty-msg">No completed overs yet.</div>'; return; }
    box.innerHTML = i.overs.slice().reverse().map((ov) => `
      <div class="over-line">
        <span class="ov-num">Over ${ov.num}</span>
        <span class="ov-balls">${ov.balls.map((c) => `<span class="mini ${c.cls}">${c.label}</span>`).join("")}</span>
        <span class="ov-runs">${ov.runs}</span>
      </div>`).join("");
  }

  return { showScreen, applyTheme, tint, toast, renderMatch, esc };
})();
