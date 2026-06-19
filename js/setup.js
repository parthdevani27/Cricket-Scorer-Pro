/* =====================================================================
   setup.js — match setup screen: team names, colours, players,
   captain & wicketkeeper, overs.  Exposed as global `Setup`.
   ===================================================================== */
window.Setup = (function () {
  const $ = (id) => document.getElementById(id);
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function poolName(team, idx) {
    const pool = team === 0 ? Data.NAMES_A : Data.NAMES_B;
    return pool[idx] || ("Player " + (idx + 1));
  }

  /* ---------- colour rows ---------- */
  function renderColors() {
    [0, 1].forEach((t) => {
      const row = document.querySelector('.color-row[data-team="' + t + '"]');
      row.innerHTML = Data.COLORS.map((c) =>
        `<button class="swatch${Store.match.teams[t].color === c ? " sel" : ""}" data-team="${t}" data-color="${c}" style="background:${c}"></button>`).join("");
      const sw = document.querySelector('.ts-swatch[data-team="' + t + '"]');
      if (sw) sw.style.background = Store.match.teams[t].color;
      const card = document.querySelector('.team-setup-card[data-team="' + t + '"]');
      if (card) card.style.borderColor = Store.match.teams[t].color;
    });
  }

  /* ---------- overs ---------- */
  function renderOvers() {
    document.querySelectorAll(".ov-preset").forEach((b) => {
      b.classList.toggle("sel", Number(b.dataset.ov) === Store.match.overs);
    });
    const custom = $("oversCustom");
    if (!Data.OVER_PRESETS.includes(Store.match.overs)) custom.value = Store.match.overs;
  }

  /* ---------- team size ---------- */
  function renderSizes() {
    document.querySelectorAll(".ts-size").forEach((inp) => { inp.value = Store.match.teams[+inp.dataset.team].size; });
  }

  /* ---------- players editor ---------- */
  function openPlayers(team) {
    const t = Store.match.teams[team];
    $("playersModalTitle").textContent = t.name + " — Players (" + t.size + " a side)";
    const list = $("playersList");
    list.innerHTML = t.players.slice(0, t.size).map((p, idx) => `
      <div class="pe-item">
        <span class="rnum">${idx + 1}</span>
        <input class="pe-name" data-team="${team}" data-idx="${idx}" maxlength="18"
               value="${esc(p.name)}" placeholder="${esc(poolName(team, idx))}" />
        <button class="pe-role ${t.captain === idx ? "on" : ""}" data-role="captain" data-team="${team}" data-idx="${idx}" title="Captain">C</button>
        <button class="pe-role ${t.wk === idx ? "on" : ""}" data-role="wk" data-team="${team}" data-idx="${idx}" title="Wicketkeeper">WK</button>
      </div>`).join("");

    list.querySelectorAll(".pe-name").forEach((inp) => {
      inp.addEventListener("change", (e) => {
        const tm = +e.target.dataset.team, ix = +e.target.dataset.idx;
        Store.match.teams[tm].players[ix].name = e.target.value.trim();
        Store.save();
      });
    });
    list.querySelectorAll(".pe-role").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tm = +btn.dataset.team, ix = +btn.dataset.idx, role = btn.dataset.role;
        Store.match.teams[tm][role] = ix;
        Store.save();
        openPlayers(tm); // re-render to move highlight
      });
    });
    $("playersModal").classList.remove("hidden");
  }

  /* ---------- IPL quick-pick ---------- */
  function renderIplOptions() {
    const teams = (Data.IPL_TEAMS || []);
    document.querySelectorAll(".ipl-select").forEach((sel) => {
      sel.innerHTML = '<option value="">⚡ Quick-pick a team…</option>' +
        teams.map((t, idx) => `<option value="${idx}">${esc(t.team_name)}</option>`).join("");
    });
  }
  function applyIpl(team, iplIdx) {
    const ipl = (Data.IPL_TEAMS || [])[iplIdx];
    if (!ipl) return;
    const t = Store.match.teams[team];
    t.name = ipl.team_name;
    t.color = Data.brighten(ipl.color_code || "#2ee6a6");
    t.size = ipl.playing_11.length;
    ipl.playing_11.forEach((nm, k) => { if (t.players[k]) t.players[k].name = nm; });
    const ci = ipl.playing_11.indexOf(ipl.captain);
    const wi = ipl.playing_11.indexOf(ipl.wicketkeeper);
    t.captain = ci >= 0 ? ci : 0;
    t.wk = wi >= 0 ? wi : 1;
    Store.save();
    const inp = document.querySelector('.ts-name[data-team="' + team + '"]');
    if (inp) inp.value = t.name;
    renderColors();
    renderSizes();
  }

  /* ---------- finalize ---------- */
  function finalizeNames() {
    Store.match.teams.forEach((t, ti) => {
      t.players.forEach((p, idx) => { if (!p.name) p.name = poolName(ti, idx); });
    });
    Store.save();
  }

  /* ---------- init & wiring ---------- */
  function init() {
    // names
    document.querySelectorAll(".ts-name").forEach((inp) => {
      inp.value = Store.match.teams[+inp.dataset.team].name;
      inp.addEventListener("change", (e) => {
        Store.match.teams[+e.target.dataset.team].name = e.target.value.trim() || ("Team " + (+e.target.dataset.team === 0 ? "A" : "B"));
        e.target.value = Store.match.teams[+e.target.dataset.team].name;
        Store.save();
      });
    });

    renderColors();
    renderOvers();
    renderSizes();
    renderIplOptions();

    // team size (players per side)
    document.querySelectorAll(".ts-size").forEach((inp) =>
      inp.addEventListener("change", (e) => {
        const tm = +e.target.dataset.team;
        let v = parseInt(e.target.value, 10);
        if (isNaN(v)) v = 11;
        v = Math.min(11, Math.max(2, v));
        const t = Store.match.teams[tm];
        t.size = v;
        if (t.captain >= v) t.captain = 0;
        if (t.wk >= v) t.wk = v > 1 ? 1 : 0;
        e.target.value = v;
        Store.save();
      }));

    // IPL quick-pick
    document.querySelectorAll(".ipl-select").forEach((sel) =>
      sel.addEventListener("change", (e) => {
        if (e.target.value !== "") applyIpl(+e.target.dataset.team, +e.target.value);
      }));

    // colour pick (event delegation)
    document.querySelectorAll(".color-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        const b = e.target.closest(".swatch");
        if (!b) return;
        Store.match.teams[+b.dataset.team].color = b.dataset.color;
        Store.save();
        renderColors();
      });
    });

    document.querySelectorAll(".ts-players-btn").forEach((b) =>
      b.addEventListener("click", () => openPlayers(+b.dataset.team)));
    $("closePlayers").addEventListener("click", () => $("playersModal").classList.add("hidden"));

    // overs
    document.querySelectorAll(".ov-preset").forEach((b) =>
      b.addEventListener("click", () => {
        Store.match.overs = Number(b.dataset.ov);
        $("oversCustom").value = "";
        Store.save(); renderOvers();
      }));
    $("oversCustom").addEventListener("input", (e) => {
      let v = parseInt(e.target.value, 10);
      if (!isNaN(v)) { v = Math.min(50, Math.max(1, v)); Store.match.overs = v; Store.save(); renderOvers(); }
    });

    $("toTossBtn").addEventListener("click", () => {
      finalizeNames();
      Store.match.phase = "toss";
      Store.save();
      Toss.enter();
    });
  }

  function refresh() { renderColors(); renderOvers(); renderSizes(); }

  return { init, refresh, openPlayers };
})();
