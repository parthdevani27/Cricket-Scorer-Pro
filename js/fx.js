/* =====================================================================
   fx.js — Three.js visual effects
     • Animated 3D coin (toss)
     • Low-poly batsman character (idle / happy / sad)
     • Fullscreen fireworks + confetti celebrations (team coloured)
   All guarded: if WebGL / THREE is unavailable the app still works.
   Exposed as global `FX`.
   ===================================================================== */
window.FX = (function () {
  const HAS_THREE = typeof THREE !== "undefined";

  function hex(c) { try { return new THREE.Color(c); } catch (e) { return new THREE.Color("#2ee6a6"); } }
  function sizeOf(canvas) {
    const r = canvas.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }

  /* =================================================================
     COIN
     ================================================================= */
  const coin = { ready: false };

  function faceTexture(emoji, label, bg) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(128, 110, 20, 128, 128, 130);
    grad.addColorStop(0, "#fff6cf");
    grad.addColorStop(0.5, bg);
    grad.addColorStop(1, "#9a6b00");
    g.fillStyle = grad;
    g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#7a5200"; g.lineWidth = 8; g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "120px serif";
    g.fillText(emoji, 128, 120);
    g.fillStyle = "#5a3d00"; g.font = "bold 38px Montserrat, sans-serif";
    g.fillText(label, 128, 210);
    return new THREE.CanvasTexture(c);
  }

  function initCoin() {
    if (!HAS_THREE || coin.ready) return;
    const canvas = document.getElementById("coinCanvas");
    if (!canvas) return;
    try {
      const { w, h } = sizeOf(canvas);
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w, h, false);
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      cam.position.set(0, 0, 5);
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const dir = new THREE.DirectionalLight(0xffffff, 0.8);
      dir.position.set(2, 4, 5); scene.add(dir);

      const geo = new THREE.CylinderGeometry(1.3, 1.3, 0.18, 60);
      geo.rotateX(Math.PI / 2); // round faces now point along Z (toward camera)
      const side = new THREE.MeshStandardMaterial({ color: 0xd9a400, metalness: 0.9, roughness: 0.35 });
      const heads = new THREE.MeshStandardMaterial({ map: faceTexture("👑", "HEADS", "#f0c040"), metalness: 0.5, roughness: 0.5 });
      const tails = new THREE.MeshStandardMaterial({ map: faceTexture("🏏", "TAILS", "#e8b830"), metalness: 0.5, roughness: 0.5 });
      const mesh = new THREE.Mesh(geo, [side, heads, tails]);
      scene.add(mesh);

      coin.renderer = renderer; coin.scene = scene; coin.cam = cam; coin.mesh = mesh;
      coin.ready = true; coin.spinning = false;
      coin.baseY = 0;
      renderer.render(scene, cam);

      // idle slow spin
      function idle() {
        if (!coin.ready) return;
        if (!coin.spinning) { mesh.rotation.z += 0.01; renderer.render(scene, cam); }
        coin.idleReq = requestAnimationFrame(idle);
      }
      idle();
    } catch (e) { coin.ready = false; }
  }

  // result: "heads" | "tails". cb called when finished.
  function flipCoin(result, cb) {
    if (!coin.ready) { if (cb) cb(); return; }
    coin.spinning = true;
    const mesh = coin.mesh;
    const spins = 6 + Math.floor(Math.random() * 3);
    // heads faces camera at rotation.x = 0 (mod 2π); tails at π
    const target = spins * Math.PI * 2 + (result === "tails" ? Math.PI : 0);
    const startX = mesh.rotation.x;
    const dur = 2200;
    const t0 = performance.now();
    function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      mesh.rotation.x = startX + (target - startX) * ease;
      mesh.position.y = Math.sin(p * Math.PI) * 1.6; // hop
      coin.renderer.render(coin.scene, coin.cam);
      if (p < 1) requestAnimationFrame(step);
      else {
        mesh.rotation.x = (result === "tails" ? Math.PI : 0);
        mesh.position.y = 0;
        coin.spinning = false;
        coin.renderer.render(coin.scene, coin.cam);
        if (cb) cb();
      }
    }
    requestAnimationFrame(step);
  }

  /* =================================================================
     CHARACTER  (low-poly batsman beside the striker)
     ================================================================= */
  const ch = { ready: false, mood: "idle", moodUntil: 0 };

  // small helper: a pivot group at a joint position
  function joint(x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); return g; }
  function mesh(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); return m; }

  function buildCharacter(color) {
    const root = new THREE.Group();
    const c = hex(color);
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48c, roughness: 0.85 });
    const jersey = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.05 });
    const jersey2 = new THREE.MeshStandardMaterial({ color: c.clone().offsetHSL(0, 0, -0.12), roughness: 0.55 });
    const white = new THREE.MeshStandardMaterial({ color: 0xeef2f7, roughness: 0.7 });
    const trouser = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.75 });
    const helmetM = new THREE.MeshStandardMaterial({ color: 0x141b2e, roughness: 0.4, metalness: 0.25 });
    const grilleM = new THREE.MeshStandardMaterial({ color: 0x3a4459, roughness: 0.5, metalness: 0.6 });
    const willow = new THREE.MeshStandardMaterial({ color: 0xe7c98f, roughness: 0.6 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.8 });

    /* ---- lower body (legs hang from hips at y≈1.35) ---- */
    root.add(mesh(new THREE.BoxGeometry(0.62, 0.42, 0.42), trouser, 0, 1.34, 0)); // pelvis

    function leg(side) {
      const hip = joint(0.18 * side, 1.36, 0);
      const thigh = mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.66, 14), trouser, 0, -0.33, 0);
      hip.add(thigh);
      const knee = joint(0, -0.66, 0); hip.add(knee);
      const shin = mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.62, 14), trouser, 0, -0.31, 0);
      knee.add(shin);
      // batting pad strapped to the shin
      const pad = mesh(new THREE.BoxGeometry(0.28, 0.66, 0.16), white, 0, -0.3, 0.13);
      pad.geometry.translate(0, 0, 0);
      knee.add(pad);
      const padTop = mesh(new THREE.BoxGeometry(0.26, 0.18, 0.14), white, 0, 0.04, 0.13); knee.add(padTop);
      // shoe
      const shoe = mesh(new THREE.BoxGeometry(0.2, 0.13, 0.4), white, 0, -0.66, 0.08); knee.add(shoe);
      const stud = mesh(new THREE.BoxGeometry(0.2, 0.04, 0.4), jersey2, 0, -0.72, 0.08); knee.add(stud);
      return { hip, knee };
    }
    const legL = leg(-1), legR = leg(1);

    /* ---- upper body pivots at the waist (so it can lean / slump) ---- */
    const upper = joint(0, 1.36, 0); root.add(upper);
    // torso (tapered) + a contrast chest band
    upper.add(mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.92, 18), jersey, 0, 0.5, 0));
    upper.add(mesh(new THREE.CylinderGeometry(0.305, 0.34, 0.18, 18), jersey2, 0, 0.74, 0)); // collar band
    upper.add(mesh(new THREE.SphereGeometry(0.2, 14, 14), jersey, -0.3, 0.92, 0)); // shoulder caps
    upper.add(mesh(new THREE.SphereGeometry(0.2, 14, 14), jersey, 0.3, 0.92, 0));
    // neck
    upper.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10), skin, 0, 1.0, 0));

    // head — a real human face (eyes, brows, nose, mouth, ears, chin) + team cap
    const hairM = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.95 });
    const eyeW = new THREE.MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.35 });
    const eyeD = new THREE.MeshStandardMaterial({ color: 0x161a22, roughness: 0.3 });
    const lipsM = new THREE.MeshStandardMaterial({ color: 0xc06a52, roughness: 0.7 });

    const head = joint(0, 1.14, 0); upper.add(head);
    // skull + jaw/chin (slightly egg-shaped)
    const skull = mesh(new THREE.SphereGeometry(0.26, 28, 28), skin, 0, 0, 0);
    skull.scale.set(0.96, 1.06, 0.98); head.add(skull);
    head.add(mesh(new THREE.SphereGeometry(0.17, 18, 18), skin, 0, -0.13, 0.03)); // chin/jaw
    // ears
    [-1, 1].forEach((s) => head.add(mesh(new THREE.SphereGeometry(0.055, 12, 12), skin, 0.25 * s, -0.02, -0.01)));
    // eyes (white + dark iris) and eyebrows
    [-1, 1].forEach((s) => {
      head.add(mesh(new THREE.SphereGeometry(0.05, 14, 14), eyeW, 0.095 * s, 0.05, 0.225));
      head.add(mesh(new THREE.SphereGeometry(0.026, 12, 12), eyeD, 0.1 * s, 0.05, 0.258));
      head.add(mesh(new THREE.BoxGeometry(0.09, 0.022, 0.03), hairM, 0.1 * s, 0.12, 0.235));
    });
    // nose + mouth
    head.add(mesh(new THREE.SphereGeometry(0.045, 12, 12), skin, 0, -0.01, 0.255));
    head.add(mesh(new THREE.BoxGeometry(0.1, 0.024, 0.02), lipsM, 0, -0.105, 0.235));
    // hair at the back of the head + sideburns (face left open)
    head.add(mesh(new THREE.SphereGeometry(0.225, 18, 18), hairM, 0, 0.0, -0.12));
    [-1, 1].forEach((s) => head.add(mesh(new THREE.BoxGeometry(0.045, 0.13, 0.13), hairM, 0.235 * s, -0.03, 0.0)));
    // team cap: rounded crown + short peak + button
    head.add(mesh(new THREE.SphereGeometry(0.285, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), jersey, 0, 0.07, 0));
    head.add(mesh(new THREE.SphereGeometry(0.03, 8, 8), jersey2, 0, 0.345, 0));
    head.add(mesh(new THREE.BoxGeometry(0.36, 0.045, 0.17), jersey2, 0, 0.085, 0.22));

    /* ---- arms (shoulder -> elbow -> glove) ---- */
    function arm(side) {
      const sh = joint(0.32 * side, 0.9, 0); upper.add(sh);
      sh.add(mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.5, 12), jersey, 0, -0.25, 0));
      const el = joint(0, -0.5, 0); sh.add(el);
      el.add(mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.46, 12), skin, 0, -0.23, 0));
      // batting glove
      const glove = joint(0, -0.46, 0); el.add(glove);
      glove.add(mesh(new THREE.BoxGeometry(0.17, 0.2, 0.16), white, 0, -0.06, 0));
      return { sh, el, glove };
    }
    const armL = arm(-1), armR = arm(1);

    /* ---- bat, held in the right glove ---- */
    const bat = new THREE.Group();
    bat.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 10), grip, 0, 0.32, 0)); // handle
    const blade = mesh(new THREE.BoxGeometry(0.17, 0.86, 0.085), willow, 0, -0.32, 0);
    bat.add(blade);
    bat.add(mesh(new THREE.BoxGeometry(0.17, 0.18, 0.13), willow, 0, -0.72, -0.02)); // bulge at the toe
    armR.glove.add(bat);
    bat.position.set(0, -0.1, 0.12);

    root.userData = {
      upper, head, bat,
      shL: armL.sh, elL: armL.el, gloveL: armL.glove,
      shR: armR.sh, elR: armR.el, gloveR: armR.glove,
      hipL: legL.hip, kneeL: legL.knee, hipR: legR.hip, kneeR: legR.knee,
      baseRotY: -0.42,
    };
    root.rotation.y = -0.42; // 3/4 side-on stance
    return root;
  }

  /* base batting stance — applied every frame, then the mood layers on top */
  function applyStance(u) {
    u.upper.rotation.set(0.12, 0.05, 0);
    u.head.rotation.set(0.02, 0, 0);
    // legs: side-on, knees flexed, front foot forward
    u.hipL.rotation.set(-0.22, 0, 0.04); u.kneeL.rotation.set(0.42, 0, 0);
    u.hipR.rotation.set(0.16, 0, -0.04); u.kneeR.rotation.set(0.3, 0, 0);
    // arms gripping the bat low in front
    u.shR.rotation.set(0.7, 0, 0.55); u.elR.rotation.set(-0.7, 0, 0);
    u.shL.rotation.set(0.85, 0, -0.45); u.elL.rotation.set(-0.95, 0, 0);
    u.gloveL.rotation.set(0, 0, 0); u.gloveR.rotation.set(0, 0, 0);
    u.bat.rotation.set(0.15, 0, 0.05);
  }

  // auto-fit the camera to the whole model so nothing (esp. the head) is cropped
  function frameChar() {
    const cam = ch.cam, obj = ch.mesh;
    if (!cam || !obj) return;
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(obj);
    if (!isFinite(box.min.x) || box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y);
    const fitH = (maxSize / 2) / Math.tan((Math.PI * cam.fov) / 360);
    const fitW = fitH / cam.aspect;
    // extra head/jump room so the raised-bat celebration also stays in frame
    const dist = 1.45 * Math.max(fitH, fitW);
    cam.position.set(center.x + dist * 0.14, center.y + dist * 0.04, center.z + dist);
    cam.near = Math.max(0.1, dist / 100);
    cam.far = dist * 100;
    cam.updateProjectionMatrix();
    cam.lookAt(center.x, center.y, center.z);
  }

  function initCharacter(color) {
    if (!HAS_THREE) return;
    const canvas = document.getElementById("charCanvas");
    if (!canvas) return;
    try {
      const { w, h } = sizeOf(canvas);
      if (!ch.ready) {
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(w, h, false);
        const scene = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
        scene.add(new THREE.AmbientLight(0xffffff, 0.78));
        const d = new THREE.DirectionalLight(0xffffff, 0.85);
        d.position.set(3, 6, 4); scene.add(d);
        const rim = new THREE.DirectionalLight(0x88bbff, 0.45);
        rim.position.set(-4, 2, -3); scene.add(rim);
        ch.renderer = renderer; ch.scene = scene; ch.cam = cam;
        ch.ready = true;
        loopChar();
      } else {
        ch.renderer.setSize(w, h, false);
        ch.cam.aspect = w / h; ch.cam.updateProjectionMatrix();
      }
      // (re)build mesh with team colour
      if (ch.mesh) ch.scene.remove(ch.mesh);
      ch.mesh = buildCharacter(color);
      ch.scene.add(ch.mesh);
      frameChar();
      ch.t0 = performance.now();
    } catch (e) { ch.ready = false; }
  }

  function setCharColor(color) { if (ch.ready) initCharacter(color); }

  const MOOD_MS = 2200;
  function charMood(mood) {
    if (!ch.ready) return;
    ch.mood = mood;
    ch.moodUntil = performance.now() + (mood === "idle" ? 0 : MOOD_MS);
    ch.moodStart = performance.now();
  }

  function loopChar() {
    if (!ch.ready) return;
    const now = performance.now();
    const m = ch.mesh;
    if (m) {
      const t = (now - (ch.t0 || now)) / 1000;
      const u = m.userData;
      if (ch.mood !== "idle" && now > ch.moodUntil) ch.mood = "idle";
      const mp = ch.moodStart ? Math.min(1, (now - ch.moodStart) / MOOD_MS) : 0;

      // start from the batting stance every frame
      applyStance(u);
      m.position.set(0, 0, 0);
      m.rotation.set(0, u.baseRotY, 0);

      if (ch.mood === "happy") {
        // a 2-hop celebration: bat raised high, front arm pumping, head up
        const hop = Math.abs(Math.sin(mp * Math.PI * 2)) * 0.55 * (1 - mp * 0.25);
        m.position.y = hop;
        m.rotation.y = u.baseRotY + Math.sin(mp * Math.PI * 3) * 0.35;
        m.rotation.z = Math.sin(mp * Math.PI * 6) * 0.04;
        u.upper.rotation.set(-0.12, 0.05, 0);
        u.head.rotation.set(-0.25, 0, 0);
        // right arm thrusts the bat overhead
        u.shR.rotation.set(-2.5, 0, 0.25); u.elR.rotation.set(-0.15, 0, 0);
        u.bat.rotation.set(0.1, 0, 0);
        // left arm fist-pumps
        const pump = Math.sin(mp * Math.PI * 6);
        u.shL.rotation.set(-1.7 - pump * 0.5, 0, -0.3); u.elL.rotation.set(-1.3 - pump * 0.4, 0, 0);
        // legs spring with each hop
        const spr = Math.abs(Math.sin(mp * Math.PI * 2)) * 0.25;
        u.kneeL.rotation.x = 0.42 + spr; u.kneeR.rotation.x = 0.3 + spr;
      } else if (ch.mood === "sad") {
        // dejected: shoulders slump, head drops, bat drags, slow turn away
        const e = mp * mp * (3 - 2 * mp); // smoothstep
        m.position.y = -0.16 * e;
        m.rotation.y = u.baseRotY - 0.5 * e;
        u.upper.rotation.set(0.12 + 0.55 * e, 0.05, 0);
        u.head.rotation.set(0.1 + 0.7 * e, -0.15 * e, 0);
        u.shR.rotation.set(0.35 + 0.2 * e, 0, 0.18); u.elR.rotation.set(-0.45, 0, 0);
        u.shL.rotation.set(0.3, 0, -0.18); u.elL.rotation.set(-0.4, 0, 0);
        u.bat.rotation.set(0.5 * e, 0, 0.05);
        u.hipL.rotation.x = -0.22 + 0.1 * e; u.hipR.rotation.x = 0.16 + 0.1 * e;
      } else {
        // idle: breathing, weight-shift sway, bat taps the pitch, head glances
        m.position.x = Math.sin(t * 0.9) * 0.04;
        m.position.y = Math.sin(t * 1.5) * 0.012;
        m.rotation.z = Math.sin(t * 0.9) * 0.025;
        m.rotation.y = u.baseRotY + Math.sin(t * 0.45) * 0.06;
        u.upper.rotation.x = 0.12 + Math.sin(t * 1.5) * 0.02; // breathing
        u.head.rotation.y = Math.sin(t * 0.6) * 0.22;
        const tap = (Math.sin(t * 2.1) * 0.5 + 0.5); // 0..1, bat taps ground
        u.elR.rotation.x = -0.7 - tap * 0.18;
        u.elL.rotation.x = -0.95 - tap * 0.12;
        u.bat.rotation.x = 0.15 + tap * 0.12;
        u.kneeL.rotation.x = 0.42 + Math.sin(t * 1.5) * 0.015;
      }
      ch.renderer.render(ch.scene, ch.cam);
    }
    ch.req = requestAnimationFrame(loopChar);
  }

  /* =================================================================
     FIREWORKS / CONFETTI  (fullscreen overlay)
     ================================================================= */
  const fw = { ready: false, systems: [], running: false };
  const fxEnvs = {};  // cache one renderer per canvas id (avoid WebGL context leaks)

  function initFx(canvasId) {
    if (!HAS_THREE) return null;
    const id = canvasId || "fxCanvas";
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const w = window.innerWidth, h = window.innerHeight;
    if (fxEnvs[id]) {
      const env = fxEnvs[id];
      if (env.w !== w || env.h !== h) { // window resized — update camera/renderer
        env.w = w; env.h = h;
        env.renderer.setSize(w, h, false);
        env.cam.left = -w / 2; env.cam.right = w / 2; env.cam.top = h / 2; env.cam.bottom = -h / 2;
        env.cam.updateProjectionMatrix();
      }
      return env;
    }
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w, h, false);
      const scene = new THREE.Scene();
      const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, -1000, 1000);
      cam.position.z = 10;
      const env = { renderer, scene, cam, w, h, canvas };
      fxEnvs[id] = env;
      return env;
    } catch (e) { return null; }
  }

  function burst(env, cx, cy, color, count) {
    const n = count || 110;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const vel = new Float32Array(n * 2);
    const base = hex(color);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = cx; positions[i * 3 + 1] = cy; positions[i * 3 + 2] = 0;
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 6;
      vel[i * 2] = Math.cos(a) * sp;
      vel[i * 2 + 1] = Math.sin(a) * sp;
      const c = base.clone();
      c.offsetHSL((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.3);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 7, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthTest: false });
    const pts = new THREE.Points(geo, mat);
    env.scene.add(pts);
    fw.systems.push({ env, pts, vel, born: performance.now(), life: 1500, type: "burst" });
  }

  function confetti(env, color) {
    const n = 160;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const vel = new Float32Array(n * 2);
    const palette = [hex(color), new THREE.Color("#ffffff"), hex(color).offsetHSL(0.1, 0, 0)];
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (Math.random() - 0.5) * env.w;
      positions[i * 3 + 1] = env.h / 2 + Math.random() * env.h * 0.5;
      positions[i * 3 + 2] = 0;
      vel[i * 2] = (Math.random() - 0.5) * 1.5;
      vel[i * 2 + 1] = -(1.5 + Math.random() * 2.5);
      const c = palette[i % palette.length];
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 9, vertexColors: true, transparent: true, opacity: 1, depthTest: false });
    const pts = new THREE.Points(geo, mat);
    env.scene.add(pts);
    fw.systems.push({ env, pts, vel, born: performance.now(), life: 4000, type: "confetti" });
  }

  function runLoop() {
    if (fw.running) return;
    fw.running = true;
    (function tick() {
      const now = performance.now();
      const envs = new Set();
      fw.systems = fw.systems.filter((s) => {
        const age = now - s.born;
        if (age > s.life) { s.env.scene.remove(s.pts); s.pts.geometry.dispose(); s.pts.material.dispose(); return false; }
        const pos = s.pts.geometry.attributes.position.array;
        const n = pos.length / 3;
        for (let i = 0; i < n; i++) {
          pos[i * 3] += s.vel[i * 2];
          pos[i * 3 + 1] += s.vel[i * 2 + 1];
          if (s.type === "burst") { s.vel[i * 2 + 1] -= 0.12; s.vel[i * 2] *= 0.99; s.vel[i * 2 + 1] *= 0.99; }
          else { s.vel[i * 2 + 1] -= 0.02; }
        }
        s.pts.geometry.attributes.position.needsUpdate = true;
        s.pts.material.opacity = Math.max(0, 1 - age / s.life);
        envs.add(s.env);
        return true;
      });
      envs.forEach((e) => e.renderer.render(e.scene, e.cam));
      if (fw.systems.length || fw.keepAlive) requestAnimationFrame(tick);
      else fw.running = false;
    })();
  }

  // one celebration sequence (used mid-match): bursts + confetti for ~4s
  function celebrate(color) {
    const env = initFx("fxCanvas");
    if (!env) return;
    let i = 0;
    const launch = () => {
      if (i >= 6) return;
      const cx = (Math.random() - 0.5) * env.w * 0.7;
      const cy = (Math.random() * 0.4 + 0.05) * env.h;
      burst(env, cx, cy, color, 110);
      i++;
      setTimeout(launch, 280);
    };
    launch();
    confetti(env, color);
    runLoop();
  }

  // small celebration (boundary / milestone): 1-2 bursts
  function pop(color, big) {
    const env = initFx("fxCanvas");
    if (!env) return;
    burst(env, (Math.random() - 0.5) * env.w * 0.5, env.h * 0.25, color, big ? 130 : 70);
    if (big) burst(env, (Math.random() - 0.5) * env.w * 0.5, env.h * 0.18, color, 90);
    runLoop();
  }

  // continuous celebration on the result screen
  function resultParty(color) {
    const env = initFx("resultCanvas");
    if (!env) return;
    fw.keepAlive = true;
    function wave() {
      if (!fw.keepAlive) return;
      burst(env, (Math.random() - 0.5) * env.w * 0.8, (Math.random() * 0.4 + 0.05) * env.h, color, 100);
      if (Math.random() < 0.4) confetti(env, color);
      fw.partyT = setTimeout(wave, 600);
    }
    wave();
    runLoop();
  }
  function stopParty() { fw.keepAlive = false; clearTimeout(fw.partyT); }

  function onResize() {
    [["coinCanvas", coin], ["charCanvas", ch]].forEach(([id, obj]) => {
      if (obj.ready && obj.renderer) {
        const c = document.getElementById(id);
        const { w, h } = sizeOf(c);
        obj.renderer.setSize(w, h, false);
        obj.cam.aspect = w / h; obj.cam.updateProjectionMatrix();
      }
    });
  }
  window.addEventListener("resize", onResize);

  return {
    initCoin, flipCoin,
    initCharacter, setCharColor, charMood,
    celebrate, pop, resultParty, stopParty,
  };
})();
