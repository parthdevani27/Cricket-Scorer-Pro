/* =====================================================================
   data.js — static data: name pools, colour palette, constants
   Exposed as global `Data`.
   ===================================================================== */
window.Data = (function () {
  const NAMES_A = [
    "Rohit", "Kohli", "Rahul", "Surya", "Pant", "Hardik", "Jadeja",
    "Ashwin", "Bumrah", "Shami", "Siraj", "Gill", "Iyer", "Axar", "Kuldeep",
  ];
  const NAMES_B = [
    "Warner", "Smith", "Maxwell", "Marsh", "Carey", "Cummins", "Starc",
    "Zampa", "Hazlewood", "Head", "Stoinis", "Green", "Labuschagne", "Agar",
  ];

  // team colour choices (name + hex)
  const COLORS = [
    "#2ee6a6", // emerald
    "#29c0f0", // cyan
    "#f59e0b", // amber
    "#fb5d7a", // rose
    "#a78bfa", // violet
    "#38bdf8", // sky
    "#f472b6", // pink
    "#facc15", // yellow
    "#4ade80", // green
    "#fb923c", // orange
    "#e2e8f0", // silver
    "#818cf8", // indigo
  ];

  const OVER_PRESETS = [2, 5, 10, 15, 20];

  const WICKET_TYPES = [
    "Bowled", "Caught", "LBW", "Run Out", "Stumped", "Hit Wicket",
  ];

  // milestones that trigger a celebration
  const MILESTONES = [50, 100, 150, 200];

  // ensure a colour is bright enough to read on the dark UI; lighten if too dark
  function brighten(hex) {
    try {
      const h = hex.replace("#", "");
      let r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (lum < 0.42) {
        const k = 0.42 / Math.max(0.08, lum);
        r = Math.min(255, Math.round(r * k + 40));
        g = Math.min(255, Math.round(g * k + 40));
        b = Math.min(255, Math.round(b * k + 40));
      }
      return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    } catch (e) { return hex; }
  }

  return { NAMES_A, NAMES_B, COLORS, OVER_PRESETS, WICKET_TYPES, MILESTONES, brighten };
})();
