/* =====================================================================
   sound.js — synthesized sound effects via Web Audio API (no asset files)
   Exposed as global `Sound`.  Traditional cricket cues:
     four/six -> bright cheer tones, wicket -> sad descend,
     milestone/win -> fanfare, coin -> metallic ding, tick -> soft.
   ===================================================================== */
window.Sound = (function () {
  let ctx = null;
  let enabled = true;

  function init() {
    if (ctx) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { ctx = null; }
  }
  function setEnabled(v) { enabled = v; }

  // a single tone with an ADSR-ish envelope
  function tone(freq, start, dur, type, peak) {
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak || 0.25, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function glide(f1, f2, start, dur, type, peak) {
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(f1, t0);
    osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak || 0.22, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const SEQ = {
    tick:      () => tone(420, 0, 0.06, "triangle", 0.12),
    four:      () => { tone(523, 0, 0.12, "triangle", 0.2); tone(659, 0.1, 0.16, "triangle", 0.2); },
    six:       () => { tone(523, 0, 0.12, "sawtooth", 0.18); tone(659, 0.1, 0.12, "sawtooth", 0.18); tone(784, 0.2, 0.22, "sawtooth", 0.2); },
    wicket:    () => { glide(440, 120, 0, 0.5, "sawtooth", 0.25); },
    milestone: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25, "triangle", 0.22)); },
    win:       () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.14, 0.32, "triangle", 0.24)); },
    coin:      () => { tone(1200, 0, 0.08, "square", 0.12); tone(1600, 0.05, 0.12, "square", 0.1); },
    start:     () => { tone(392, 0, 0.12, "triangle", 0.2); tone(587, 0.12, 0.2, "triangle", 0.2); },
  };

  function play(name) {
    if (!enabled) return;
    init();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const fn = SEQ[name];
    if (fn) try { fn(); } catch (e) { /* ignore */ }
  }

  return { init, setEnabled, play };
})();
