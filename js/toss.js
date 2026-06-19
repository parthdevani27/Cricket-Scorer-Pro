/* =====================================================================
   toss.js — toss screen: pick caller + call, flip the 3D coin,
   decide bat/bowl, set who bats first.  Exposed as global `Toss`.
   ===================================================================== */
window.Toss = (function () {
  const $ = (id) => document.getElementById(id);
  let st = { caller: null, call: null, result: null, winner: null, decision: null, flipped: false };

  function enter() {
    UI.showScreen("toss");
    st = { caller: null, call: null, result: null, winner: null, decision: null, flipped: false };
    Store.match.toss = null;
    renderTeams();
    document.querySelectorAll("#tossCall .call-btn").forEach((b) => b.classList.remove("sel"));
    $("tossResult").textContent = "";
    $("tossResult").className = "toss-result";
    $("tossDecision").classList.add("hidden");
    $("startMatchBtn").classList.add("hidden");
    $("flipBtn").disabled = true;
    $("flipBtn").textContent = "Flip the Coin";
    setTimeout(() => FX.initCoin(), 60);
  }

  function renderTeams() {
    const box = $("tossTeams");
    box.innerHTML = Store.match.teams.map((t, i) =>
      `<button class="toss-team" data-team="${i}" style="--tc:${t.color}">${UI.esc(t.name)}</button>`).join("");
    box.querySelectorAll(".toss-team").forEach((b) =>
      b.addEventListener("click", () => {
        st.caller = +b.dataset.team;
        box.querySelectorAll(".toss-team").forEach((x) => x.classList.toggle("sel", x === b));
        updateFlipState();
      }));
  }

  function updateFlipState() {
    $("flipBtn").disabled = !(st.caller != null && st.call && !st.flipped);
  }

  function wire() {
    document.querySelectorAll("#tossCall .call-btn").forEach((b) =>
      b.addEventListener("click", () => {
        st.call = b.dataset.call;
        document.querySelectorAll("#tossCall .call-btn").forEach((x) => x.classList.toggle("sel", x === b));
        updateFlipState();
      }));

    $("flipBtn").addEventListener("click", () => {
      if (st.flipped) return;
      st.flipped = true;
      $("flipBtn").disabled = true;
      $("flipBtn").textContent = "Flipping…";
      st.result = Math.random() < 0.5 ? "heads" : "tails";
      Sound.play("coin");
      FX.flipCoin(st.result, () => {
        st.winner = (st.call === st.result) ? st.caller : (st.caller === 0 ? 1 : 0);
        const rc = $("tossResult");
        rc.textContent = "It's " + st.result.toUpperCase() + "!";
        rc.className = "toss-result show";
        const wt = $("tossWonText");
        wt.innerHTML = `<b style="color:${Store.match.teams[st.winner].color}">${UI.esc(Store.match.teams[st.winner].name)}</b> won the toss`;
        $("tossDecision").classList.remove("hidden");
        $("flipBtn").textContent = "Flipped";
        Sound.play("start");
      });
    });

    document.querySelectorAll("#tossDecision .decision-btn").forEach((b) =>
      b.addEventListener("click", () => {
        st.decision = b.dataset.decide;
        document.querySelectorAll("#tossDecision .decision-btn").forEach((x) => x.classList.toggle("sel", x === b));
        const other = st.winner === 0 ? 1 : 0;
        Store.match.battingFirst = st.decision === "bat" ? st.winner : other;
        Store.match.toss = { caller: st.caller, call: st.call, result: st.result, winner: st.winner, decision: st.decision };
        Store.save();
        const bf = Store.match.battingFirst;
        $("tossWonText").innerHTML =
          `<b style="color:${Store.match.teams[st.winner].color}">${UI.esc(Store.match.teams[st.winner].name)}</b> won the toss & chose to <b>${st.decision}</b> · `
          + `<b style="color:${Store.match.teams[bf].color}">${UI.esc(Store.match.teams[bf].name)}</b> bat first`;
        $("startMatchBtn").classList.remove("hidden");
      }));

    $("startMatchBtn").addEventListener("click", () => {
      Engine.startMatch();
      App.enterMatch();
    });

    $("backToSetup").addEventListener("click", () => { UI.showScreen("setup"); Setup.refresh(); });
  }

  return { enter, wire };
})();
