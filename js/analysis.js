/* =====================================================================
   analysis.js — match analytics rendered as lightweight SVG charts.
   Tabs: projected · winprob · summary · overgraph · worm
   Exposed as global `Analysis`.
   ===================================================================== */
window.Analysis = (function () {
  const BPO = Store.BALLS_PER_OVER;

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function teamColor(t) { return Store.match.teams[t].color; }
  function teamName(t) { return Store.match.teams[t].name; }

  /* ---------------- PROJECTED ---------------- */
  function projected() {
    const i = Store.inn();
    const oversTotal = Store.match.overs;
    const ballsBowled = i.legalBalls;
    const ballsLeft = oversTotal * BPO - ballsBowled;
    const crr = Store.crr();
    if (ballsLeft <= 0) return `<p class="empty-msg">Innings complete — no balls left to project.</p>`;
    const remOvers = ballsLeft / BPO;
    const variants = [
      { d: -2, label: "If RR −2" },
      { d: 0, label: "At current RR" },
      { d: +2, label: "If RR +2" },
    ];
    const col = teamColor(i.battingTeam);
    const cards = variants.map((v) => {
      const rr = Math.max(0, crr + v.d);
      const proj = Math.round(i.total + rr * remOvers);
      const hot = v.d === 0;
      return `<div class="proj-card ${hot ? "hot" : ""}" style="${hot ? `border-color:${col};box-shadow:0 8px 24px -10px ${col}` : ""}">
        <div class="proj-label">${v.label}</div>
        <div class="proj-score num" style="${hot ? `color:${col}` : ""}">${proj}</div>
        <div class="proj-rr">@ ${rr.toFixed(2)} RR</div>
      </div>`;
    }).join("");
    return `
      <div class="proj-head">Current: <b class="num">${i.total}/${i.wickets}</b> in ${Store.oversStr(ballsBowled)} ov · CRR <b class="num">${crr.toFixed(2)}</b></div>
      <div class="proj-grid">${cards}</div>
      <p class="chart-note">Projection = current score + assumed run-rate × ${remOvers.toFixed(1)} overs remaining.</p>`;
  }

  /* ---------------- WIN PROBABILITY ---------------- */
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  function winProb() {
    const m = Store.match;
    const i = Store.inn();
    let pBat; // probability the *batting* team (this innings) wins
    let batTeam = i.battingTeam, bowlTeam = i.bowlingTeam;

    if (m.current === 0) {
      // 1st innings: momentum from run rate vs a par rate for the format
      const par = m.overs <= 5 ? 9 : m.overs <= 10 ? 8.5 : m.overs <= 20 ? 8 : 6;
      const crr = Store.crr();
      const maxW = i.bat.length - 1;
      const wktFactor = (maxW - i.wickets) / maxW;
      pBat = sigmoid((crr - par) * 0.25) * (0.6 + 0.4 * wktFactor);
      pBat = Math.min(0.85, Math.max(0.15, pBat));
    } else {
      const needed = m.target - i.total;
      const ballsLeft = m.overs * BPO - i.legalBalls;
      if (i.inningsOver || needed <= 0) {
        pBat = needed <= 0 ? 1 : 0;
      } else if (ballsLeft <= 0) {
        pBat = 0;
      } else {
        const rrr = needed / (ballsLeft / BPO);
        const crr = Store.crr();
        const wktsLeft = (i.bat.length - 1) - i.wickets;
        const x = (crr - rrr) * 0.55 + (wktsLeft - 5) * 0.18 - (rrr - 8) * 0.04;
        pBat = Math.min(0.97, Math.max(0.03, sigmoid(x)));
      }
    }
    const pBow = 1 - pBat;
    const cBat = teamColor(batTeam), cBow = teamColor(bowlTeam);
    const pctBat = Math.round(pBat * 100), pctBow = 100 - Math.round(pBat * 100);
    return `
      <div class="wp-title">Win Probability</div>
      <div class="wp-bar">
        <div class="wp-seg" style="width:${pctBat}%;background:${cBat}">${pctBat >= 12 ? pctBat + "%" : ""}</div>
        <div class="wp-seg" style="width:${pctBow}%;background:${cBow}">${pctBow >= 12 ? pctBow + "%" : ""}</div>
      </div>
      <div class="wp-legend">
        <span><i style="background:${cBat}"></i>${esc(teamName(batTeam))} ${pctBat}%</span>
        <span><i style="background:${cBow}"></i>${esc(teamName(bowlTeam))} ${pctBow}%</span>
      </div>
      <p class="chart-note">${m.current === 0 ? "1st innings — based on run rate vs a par score." : "Based on required rate, wickets in hand & balls left."}</p>`;
  }

  /* ---------------- SUMMARY ---------------- */
  function summaryFor(idx) {
    const m = Store.match;
    const i = m.innings[idx];
    if (!i) return "";
    const bt = m.teams[i.battingTeam], bw = m.teams[i.bowlingTeam];
    const batRows = i.bat.map((p, k) => ({ p, k }))
      .filter((o) => o.p.balls > 0 || o.p.status === "out" || o.k === i.striker || o.k === i.nonStriker)
      .map((o) => {
        const onStrike = (o.k === i.striker || o.k === i.nonStriker) && !i.inningsOver;
        const status = o.p.status === "out" ? esc(o.p.out) : o.p.status === "retired" ? "retired" : onStrike ? "not out" : "—";
        return `<tr><td class="nm">${esc(bt.players[o.k].name || "Player " + (o.k + 1))}${onStrike ? ' <span class="no">*</span>' : ""}<div class="how">${status}</div></td>
          <td class="num">${o.p.runs}</td><td class="num">${o.p.balls}</td><td class="num">${o.p.fours}</td><td class="num">${o.p.sixes}</td><td class="num">${Store.sr(o.p)}</td></tr>`;
      }).join("");
    const bowlRows = i.bowl.map((p, k) => ({ p, k }))
      .filter((o) => o.p.balls > 0 || o.p.used)
      .map((o) => `<tr><td class="nm">${esc(bw.players[o.k].name || "Player " + (o.k + 1))}</td>
        <td class="num">${Store.oversStr(o.p.balls)}</td><td class="num">${o.p.maidens}</td><td class="num">${o.p.runs}</td><td class="num">${o.p.wickets}</td><td class="num">${Store.econ(o.p)}</td></tr>`).join("");
    return `
      <div class="sum-block">
        <div class="sum-team" style="color:${bt.color}">${esc(bt.name)} — ${i.total}/${i.wickets} <span class="sum-ov">(${Store.oversStr(i.legalBalls)} ov)</span></div>
        <table class="sum-table"><thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>${batRows || '<tr><td colspan="6" class="empty-msg">Yet to bat</td></tr>'}</tbody></table>
        <div class="sum-sub">Bowling — ${esc(bw.name)}</div>
        <table class="sum-table"><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody>${bowlRows || '<tr><td colspan="6" class="empty-msg">—</td></tr>'}</tbody></table>
      </div>`;
  }
  function summary() {
    const m = Store.match;
    let html = summaryFor(0);
    if (m.innings.length > 1) html += summaryFor(1);
    return html;
  }

  /* ---------------- OVER GRAPH ---------------- */
  let overGraphSel = null;                          // chosen innings index (null = current)
  function setOverGraph(idx) { overGraphSel = idx; }
  function resetOverGraph() { overGraphSel = null; }

  function overGraph() {
    const m = Store.match;
    const sel = overGraphSel != null ? overGraphSel : m.current;
    const i = m.innings[sel];
    if (!i) return `<p class="empty-msg">No data yet.</p>`;

    // team toggle (only when a 2nd innings exists)
    let toggle = "";
    if (m.innings.length > 1) {
      toggle = `<div class="ograph-toggle">` + m.innings.map((inn, k) =>
        `<button class="ograph-team${k === sel ? " on" : ""}" data-inn="${k}" style="--tc:${teamColor(inn.battingTeam)}">${esc(teamName(inn.battingTeam))}</button>`).join("") + `</div>`;
    }

    const overs = i.overs.slice();
    // include the in-progress over
    if (i.thisOver.length) {
      overs.push({ num: overs.length + 1, runs: i.thisOver.reduce((s, c) => s + c.runs, 0), wickets: i.thisOver.filter((c) => c.cls === "w").length, partial: true });
    }
    if (!overs.length) return toggle + `<p class="empty-msg">No overs bowled yet.</p>`;
    const col = teamColor(i.battingTeam);
    const W = 320, H = 180, padL = 24, padB = 22, padT = 10;
    const maxR = Math.max(6, ...overs.map((o) => o.runs));
    const bw = (W - padL - 6) / overs.length;
    const bars = overs.map((o, idx) => {
      const h = (o.runs / maxR) * (H - padB - padT);
      const x = padL + idx * bw + 2;
      const y = H - padB - h;
      // one dot per wicket that fell in this over
      let wkt = "";
      if (o.wickets > 0) {
        const cx0 = x + (bw - 4) / 2;
        const cy = Math.max(padT + 4, y - 8);
        for (let wi = 0; wi < o.wickets; wi++) {
          const off = (wi - (o.wickets - 1) / 2) * 11;
          wkt += `<circle cx="${(cx0 + off).toFixed(1)}" cy="${cy}" r="4" fill="#fb5d7a" stroke="#0a0e1a" stroke-width="1"></circle>`;
        }
      }
      return `<rect x="${x}" y="${y}" width="${bw - 4}" height="${Math.max(1, h)}" rx="2" fill="${o.partial ? col + "88" : col}"></rect>
        <text x="${x + (bw - 4) / 2}" y="${H - padB + 12}" class="ax" text-anchor="middle">${o.num}</text>
        <text x="${x + (bw - 4) / 2}" y="${y - (o.wickets ? 14 : 4)}" class="bl" text-anchor="middle">${o.runs}</text>${wkt}`;
    }).join("");
    return `
      ${toggle}
      <div class="chart-title" style="color:${col}">Runs per Over — ${esc(teamName(i.battingTeam))}</div>
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg">
        <line x1="${padL}" y1="${H - padB}" x2="${W - 2}" y2="${H - padB}" class="axis"></line>
        ${bars}
      </svg>
      <p class="chart-note"><span class="wkt-dot"></span> red dot = wicket fell in that over.</p>`;
  }

  /* ---------------- WORM (comparison) ---------------- */
  function niceNum(x) {
    if (x <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / pow;
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * pow;
  }
  function worm() {
    const m = Store.match;
    if (!m.innings.length) return `<p class="empty-msg">No data yet.</p>`;
    const W = 340, H = 220, padL = 34, padB = 30, padT = 12, padR = 10;
    const oversTotal = m.overs;
    function series(i) {
      const pts = [{ over: 0, runs: 0 }];
      i.overs.forEach((o) => pts.push({ over: o.num, runs: o.cumRuns }));
      if (i.thisOver.length) pts.push({ over: i.legalBalls / BPO, runs: i.total });
      return pts;
    }
    const sets = m.innings.map((i, idx) => ({ pts: series(i), color: teamColor(i.battingTeam), name: teamName(i.battingTeam), idx }));
    const rawMax = Math.max(10, ...sets.flatMap((s) => s.pts.map((p) => p.runs)), m.target || 0);
    const yStep = niceNum(rawMax / 4);
    const yMax = Math.ceil(rawMax / yStep) * yStep;
    const xs = (ov) => padL + (ov / oversTotal) * (W - padL - padR);
    const ys = (r) => H - padB - (r / yMax) * (H - padB - padT);

    // gridlines + run labels (y)
    let grid = "";
    for (let r = 0; r <= yMax + 0.001; r += yStep) {
      const y = ys(r);
      grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" class="grid"></line>`;
      grid += `<text x="${padL - 5}" y="${(y + 3).toFixed(1)}" class="ax" text-anchor="end">${r}</text>`;
    }
    // gridlines + over labels (x)
    const xStep = oversTotal <= 6 ? 1 : oversTotal <= 12 ? 2 : oversTotal <= 24 ? 4 : 5;
    for (let o = 0; o <= oversTotal; o += xStep) {
      const x = xs(o);
      grid += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${H - padB}" class="grid"></line>`;
      grid += `<text x="${x.toFixed(1)}" y="${H - padB + 13}" class="ax" text-anchor="middle">${o}</text>`;
    }

    const lines = sets.map((s) => {
      const d = s.pts.map((p, k) => (k ? "L" : "M") + xs(p.over).toFixed(1) + " " + ys(p.runs).toFixed(1)).join(" ");
      const dots = s.pts.map((p) => `<circle cx="${xs(p.over).toFixed(1)}" cy="${ys(p.runs).toFixed(1)}" r="2.6" fill="${s.color}"></circle>`).join("");
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"></path>${dots}`;
    }).join("");
    const targetLine = m.target
      ? `<line x1="${padL}" y1="${ys(m.target).toFixed(1)}" x2="${W - padR}" y2="${ys(m.target).toFixed(1)}" stroke="#fbbf24" stroke-dasharray="4 3" stroke-width="1.5"></line>
         <text x="${W - padR}" y="${(ys(m.target) - 4).toFixed(1)}" class="ax" text-anchor="end" fill="#fbbf24">Target ${m.target}</text>` : "";
    const legend = sets.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("");
    return `
      <div class="chart-title">Run Comparison (worm)</div>
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg">
        ${grid}
        <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" class="axis"></line>
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" class="axis"></line>
        ${targetLine}${lines}
        <text x="${(padL + (W - padL - padR) / 2).toFixed(0)}" y="${H - 4}" class="axt" text-anchor="middle">Overs →</text>
        <text x="10" y="${padT + 4}" class="axt" text-anchor="start">Runs</text>
      </svg>
      <div class="wp-legend">${legend}</div>
      <p class="chart-note">Each dot marks an over's end — read the run total against the left axis, overs along the bottom.</p>`;
  }

  function render(tab) {
    switch (tab) {
      case "projected": return projected();
      case "winprob": return winProb();
      case "summary": return summary();
      case "overgraph": return overGraph();
      case "worm": return worm();
      default: return "";
    }
  }

  return { render, setOverGraph, resetOverGraph };
})();
