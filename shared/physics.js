/*
 * Skillshot – gemeinsame, deterministische Physik.
 * Läuft identisch im Browser (Vorschau + Animation) und auf dem Server (autoritatives Ergebnis).
 * In der Simulation werden nur + - * / und sqrt verwendet -> reproduzierbar.
 */
(function (root, factory) {
  const P = factory();
  if (typeof module === 'object' && module.exports) module.exports = P;
  else root.SkillPhysics = P;
})(typeof self !== 'undefined' ? self : this, function () {
  const DT = 1 / 120;
  const STOP_SPEED = 5;

  /**
   * Einstellbare Spielwerte. Der Server liest sie aus config.json (siehe config.example.json)
   * und schickt sie an alle Clients -> Vorschau, Animation und Server rechnen identisch.
   */
  const DEFAULT_CONFIG = {
    maxSpeed: 3400,        // Abschussgeschwindigkeit bei 100 % Kraft (px/s)
    speedCap: 5000,        // absolute Höchstgeschwindigkeit, z. B. nach Boosts (px/s)
    dragDistance: 320,     // Ziehweg in Bildschirm-Pixeln für 100 % Kraft
    maxShots: 7,           // Schläge pro Bahn
    missPenalty: 1,        // Zusatzpunkte, wenn nicht eingelocht (Punkte = maxShots + missPenalty)
    waterPenalty: 0,       // Strafschläge bei Wasser
    ballRadius: 8,
    holeRadius: 14,
    captureSpeed: 560,     // langsamer als das -> Ball fällt ins Loch
    holePull: 2600,        // Sog des Lochs (px/s²)
    maxShotTime: 40,       // Sekunden, nach denen ein Schlag hart beendet wird
    surfaces: {            // decel = konstante Bremsung (px/s²), drag = geschwindigkeitsabhängige Bremsung
      grass: { decel: 220, drag: 0.32 },
      sand: { decel: 1250, drag: 2.6 },
      ice: { decel: 40, drag: 0.04 },
    },
    bounce: {              // Rückprall-Faktor (1 = verlustfrei)
      wall: 0.78, block: 0.72, border: 0.75, bumper: 1.05, bumperKick: 260, ball: 0.55,
    },
    slopeFactor: 1,        // Multiplikator für alle Hänge
    boostFactor: 1,        // Multiplikator für alle Boosts
    preview: {             // Flugbahn-Vorschau (nur Darstellung)
      width: 4,            // Linienstärke am Ball
      minWidth: 1.2,       // Mindestdicke am Ende
      fade: 0.8,           // 0 = gar nicht verblassen, 1 = am Ende unsichtbar
      fadeLength: 1500,    // nach so vielen px Weg ist die Linie maximal dünn/verblasst
    },
    holeEndDelay: 5.5,     // Sekunden Punktetabelle zwischen den Bahnen
    maxPlayers: 8,
  };

  // Standardwerte für neue Objekte im Editor
  const DEFAULTS = {
    wall: { t: 14 },
    bumper: { r: 24 },
    slope: { angle: 0, strength: 320 },
    boost: { angle: 0, strength: 2400 },
  };

  let K = clone(DEFAULT_CONFIG);
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /** tief zusammenführen; nur Zahlen mit bekanntem Schlüssel werden übernommen */
  function mergeNum(base, over) {
    const out = clone(base);
    if (!over || typeof over !== 'object') return out;
    for (const k of Object.keys(base)) {
      if (!(k in over)) continue;
      if (typeof base[k] === 'object') out[k] = mergeNum(base[k], over[k]);
      else { const v = Number(over[k]); if (Number.isFinite(v)) out[k] = v; }
    }
    return out;
  }

  function configure(cfg) {
    const c = mergeNum(DEFAULT_CONFIG, cfg);
    const lim = (v, a, b) => Math.max(a, Math.min(b, v));
    c.maxSpeed = lim(c.maxSpeed, 50, 20000);
    c.speedCap = lim(Math.max(c.speedCap, c.maxSpeed), 50, 30000);
    c.dragDistance = lim(c.dragDistance, 30, 2000);
    c.maxShots = Math.round(lim(c.maxShots, 1, 50));
    c.missPenalty = Math.round(lim(c.missPenalty, 0, 50));
    c.waterPenalty = Math.round(lim(c.waterPenalty, 0, 10));
    c.ballRadius = lim(c.ballRadius, 2, 40);
    c.holeRadius = lim(c.holeRadius, c.ballRadius + 1, 80);
    c.maxShotTime = lim(c.maxShotTime, 2, 120);
    c.holeEndDelay = lim(c.holeEndDelay, 0, 60);
    c.maxPlayers = Math.round(lim(c.maxPlayers, 1, 32));
    c.preview.width = lim(c.preview.width, 0.5, 20);
    c.preview.minWidth = lim(c.preview.minWidth, 0.3, c.preview.width);
    c.preview.fade = lim(c.preview.fade, 0, 1);
    c.preview.fadeLength = lim(c.preview.fadeLength, 50, 100000);
    K = c;
    return K;
  }

  function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }
  function deg2vec(deg) { const a = (deg * Math.PI) / 180; return [Math.cos(a), Math.sin(a)]; }

  /** Rechteck normalisieren (negative Breite/Höhe erlaubt) */
  function rectOf(o) {
    const x = num(o.x, 0), y = num(o.y, 0), w = num(o.w, 0), h = num(o.h, 0);
    return { x1: Math.min(x, x + w), y1: Math.min(y, y + h), x2: Math.max(x, x + w), y2: Math.max(y, y + h) };
  }

  /** Map in schnell prüfbare Strukturen übersetzen */
  function compile(map) {
    const W = num(map.width, 1200), H = num(map.height, 800);
    const solids = [];
    const zones = [];
    // unsichtbare Außenbande
    const B = 200;
    const eb = K.bounce.border;
    solids.push({ kind: 'rect', x1: -B, y1: -B, x2: W + B, y2: 0, e: eb });
    solids.push({ kind: 'rect', x1: -B, y1: H, x2: W + B, y2: H + B, e: eb });
    solids.push({ kind: 'rect', x1: -B, y1: 0, x2: 0, y2: H, e: eb });
    solids.push({ kind: 'rect', x1: W, y1: 0, x2: W + B, y2: H, e: eb });

    const objs = map.objects || [];
    for (let src = 0; src < objs.length; src++) {
      const o = objs[src];
      const n0 = solids.length;
      switch (o.type) {
        case 'wall':
          solids.push({
            kind: 'seg', ax: num(o.x1, 0), ay: num(o.y1, 0), bx: num(o.x2, 0), by: num(o.y2, 0),
            rad: num(o.t, DEFAULTS.wall.t) / 2, e: K.bounce.wall,
          });
          break;
        case 'block': {
          const r = rectOf(o);
          solids.push({ kind: 'rect', ...r, e: K.bounce.block });
          break;
        }
        case 'bumper':
          solids.push({ kind: 'circle', x: num(o.x, 0), y: num(o.y, 0), r: Math.max(4, num(o.r, DEFAULTS.bumper.r)), e: K.bounce.bumper, kick: K.bounce.bumperKick });
          break;
        case 'sand': case 'ice': case 'water':
          zones.push({ kind: o.type, ...rectOf(o), fx: 0, fy: 0, src });
          break;
        case 'slope': case 'boost': {
          const d = DEFAULTS[o.type];
          const [cx, cy] = deg2vec(num(o.angle, d.angle));
          const s = num(o.strength, d.strength) * (o.type === 'slope' ? K.slopeFactor : K.boostFactor);
          zones.push({ kind: o.type, ...rectOf(o), fx: cx * s, fy: cy * s, src });
          break;
        }
      }
      for (let k = n0; k < solids.length; k++) solids[k].src = src;
    }
    const start = map.start || { x: 100, y: H / 2 };
    const hole = map.hole || { x: W - 100, y: H / 2 };
    return { W, H, solids, zones, start: { x: num(start.x, 100), y: num(start.y, H / 2) }, hole: { x: num(hole.x, W - 100), y: num(hole.y, H / 2) } };
  }

  /**
   * Liegende Gegnerbälle als feste Hindernisse hinzufügen.
   * balls: flaches Array [x1,y1,x2,y2,...]. Bälle, die den Schussstart überlappen (z. B. alle am Abschlag), werden ignoriert.
   */
  function withBalls(cm, balls, sx, sy) {
    if (!balls || !balls.length) return cm;
    const extra = [];
    const min = K.ballRadius * 2 + 0.5;
    for (let i = 0; i + 1 < balls.length; i += 2) {
      const x = balls[i], y = balls[i + 1];
      if (sx != null) { const dx = x - sx, dy = y - sy; if (dx * dx + dy * dy < min * min) continue; }
      extra.push({ kind: 'circle', x, y, r: K.ballRadius, e: K.bounce.ball, kick: 0, ball: true });
    }
    if (!extra.length) return cm;
    return Object.assign({}, cm, { solids: cm.solids.concat(extra) });
  }

  function createState(x, y, vx, vy) {
    return { x, y, vx, vy, t: 0, slow: 0, done: false, result: null, sx: x, sy: y, bounce: false, hitV: 0, hit: null };
  }

  function shotVelocity(angle, power) {
    power = Math.max(0, Math.min(1, num(power, 0)));
    const sp = power * K.maxSpeed;
    return { vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp };
  }

  function collide(cm, s) {
    const r = K.ballRadius;
    for (let i = 0; i < cm.solids.length; i++) {
      const o = cm.solids[i];
      let nx = 0, ny = 0, pen = 0;
      if (o.kind === 'seg') {
        const dx = o.bx - o.ax, dy = o.by - o.ay;
        const l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((s.x - o.ax) * dx + (s.y - o.ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = o.ax + dx * t, py = o.ay + dy * t;
        const ex = s.x - px, ey = s.y - py;
        const d2 = ex * ex + ey * ey;
        const rr = r + o.rad;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        if (d > 1e-9) { nx = ex / d; ny = ey / d; } else if (l2 > 0) { const l = Math.sqrt(l2); nx = -dy / l; ny = dx / l; } else { nx = 1; ny = 0; }
        pen = rr - d;
      } else if (o.kind === 'circle') {
        const ex = s.x - o.x, ey = s.y - o.y;
        const d2 = ex * ex + ey * ey;
        const rr = r + o.r;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        if (d > 1e-9) { nx = ex / d; ny = ey / d; } else { nx = 1; ny = 0; }
        pen = rr - d;
      } else { // rect
        if (s.x < o.x1 - r || s.x > o.x2 + r || s.y < o.y1 - r || s.y > o.y2 + r) continue;
        const cx = s.x < o.x1 ? o.x1 : s.x > o.x2 ? o.x2 : s.x;
        const cy = s.y < o.y1 ? o.y1 : s.y > o.y2 ? o.y2 : s.y;
        const ex = s.x - cx, ey = s.y - cy;
        const d2 = ex * ex + ey * ey;
        if (d2 > 1e-12) {
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2);
          nx = ex / d; ny = ey / d; pen = r - d;
        } else {
          // Mittelpunkt im Rechteck -> kürzester Weg hinaus
          const l = s.x - o.x1, rt = o.x2 - s.x, tp = s.y - o.y1, bt = o.y2 - s.y;
          let m = l; nx = -1; ny = 0;
          if (rt < m) { m = rt; nx = 1; ny = 0; }
          if (tp < m) { m = tp; nx = 0; ny = -1; }
          if (bt < m) { m = bt; nx = 0; ny = 1; }
          pen = m + r;
        }
      }
      // auflösen
      s.x += nx * pen; s.y += ny * pen;
      const vn = s.vx * nx + s.vy * ny;
      if (vn < 0) {
        s.vx -= (1 + o.e) * vn * nx;
        s.vy -= (1 + o.e) * vn * ny;
        if (o.kick) { s.vx += nx * o.kick; s.vy += ny * o.kick; }
        if (vn < -40) { s.bounce = true; if (-vn > s.hitV) { s.hitV = -vn; s.hit = o; } }
      }
    }
  }

  function inRect(z, x, y) { return x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2; }

  /** einen Zeitschritt simulieren */
  function step(cm, s) {
    if (s.done) return;
    s.bounce = false; s.hitV = 0; s.hit = null;
    const SURF = K.surfaces, HOLE_R = K.holeRadius;
    let ax = 0, ay = 0, surf = SURF.grass, water = false;
    for (let i = 0; i < cm.zones.length; i++) {
      const z = cm.zones[i];
      if (!inRect(z, s.x, s.y)) continue;
      if (z.kind === 'water') water = true;
      else if (z.kind === 'sand') surf = SURF.sand;
      else if (z.kind === 'ice') surf = SURF.ice;
      else { ax += z.fx; ay += z.fy; }
    }
    if (water) { s.done = true; s.result = 'water'; return; }

    // Lochsog
    const hx = cm.hole.x - s.x, hy = cm.hole.y - s.y;
    const hd = Math.sqrt(hx * hx + hy * hy);
    if (hd < HOLE_R && hd > 1e-6) { ax += (hx / hd) * K.holePull; ay += (hy / hd) * K.holePull; }

    s.vx += ax * DT; s.vy += ay * DT;
    let sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (sp > 0) {
      let ns = sp - (surf.decel + surf.drag * sp) * DT;
      if (ns < 0) ns = 0;
      if (ns > K.speedCap) ns = K.speedCap;
      const k = ns / sp;
      s.vx *= k; s.vy *= k; sp = ns;
    }

    // Bewegung in Teilschritten (kein Tunneln durch dünne Wände)
    const dist = sp * DT;
    const n = Math.max(1, Math.ceil(dist / (K.ballRadius * 0.35)));
    const sdt = DT / n;
    for (let i = 0; i < n; i++) {
      s.x += s.vx * sdt; s.y += s.vy * sdt;
      collide(cm, s);
      const dx = cm.hole.x - s.x, dy = cm.hole.y - s.y;
      const d2 = dx * dx + dy * dy;
      const cr = Math.max(1, HOLE_R - 3);
      if (d2 < cr * cr) {
        const v2 = s.vx * s.vx + s.vy * s.vy;
        if (v2 < K.captureSpeed * K.captureSpeed) {
          s.x = cm.hole.x; s.y = cm.hole.y; s.vx = 0; s.vy = 0;
          s.done = true; s.result = 'sunk'; s.t += DT; return;
        }
      }
    }

    s.t += DT;
    sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    const a2 = ax * ax + ay * ay;
    if (sp < STOP_SPEED) {
      if (a2 < surf.decel * surf.decel) { s.vx = 0; s.vy = 0; s.done = true; s.result = 'rest'; return; }
    }
    if (sp < STOP_SPEED * 6) s.slow += DT; else s.slow = 0;
    if (s.slow > 1.2 || s.t > K.maxShotTime) { s.vx = 0; s.vy = 0; s.done = true; s.result = 'rest'; }
  }

  /**
   * Kompletten Schlag simulieren.
   * opts.record: Pfadpunkte sammeln, opts.every: jeden n-ten Schritt, opts.maxTime: Abbruch (Vorschau)
   */
  function simulate(cm, x, y, vx, vy, opts) {
    opts = opts || {};
    const s = createState(x, y, vx, vy);
    const every = opts.every || 2;
    const maxT = Math.min(opts.maxTime || 1e9, K.maxShotTime + 1);
    const points = opts.record ? [x, y] : null;
    const bounces = opts.record ? [] : null;
    let steps = 0;
    while (!s.done && s.t < maxT) {
      step(cm, s);
      steps++;
      if (points) {
        if (s.bounce) { bounces.push(s.x, s.y); points.push(s.x, s.y); }
        else if (steps % every === 0 || s.done) points.push(s.x, s.y);
      }
    }
    return { x: s.x, y: s.y, result: s.done ? s.result : 'cut', steps, time: s.t, points, bounces };
  }

  /** Map grob prüfen und bereinigen (Server + Editor) */
  function sanitizeMap(m) {
    if (!m || typeof m !== 'object') throw new Error('Ungültige Map');
    const W = Math.max(300, Math.min(4000, Math.round(num(m.width, 1200))));
    const H = Math.max(300, Math.min(4000, Math.round(num(m.height, 800))));
    const str = (v, d, l) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, l) : d);
    const out = {
      name: str(m.name, 'Unbenannt', 40),
      author: str(m.author, 'Anonym', 30),
      par: Math.max(1, Math.min(7, Math.round(num(m.par, 3)))),
      width: W, height: H,
      start: { x: num(m.start && m.start.x, 100), y: num(m.start && m.start.y, H / 2) },
      hole: { x: num(m.hole && m.hole.x, W - 100), y: num(m.hole && m.hole.y, H / 2) },
      objects: [],
    };
    const keys = {
      wall: ['x1', 'y1', 'x2', 'y2', 't'], block: ['x', 'y', 'w', 'h'], bumper: ['x', 'y', 'r'],
      sand: ['x', 'y', 'w', 'h'], ice: ['x', 'y', 'w', 'h'], water: ['x', 'y', 'w', 'h'],
      slope: ['x', 'y', 'w', 'h', 'angle', 'strength'], boost: ['x', 'y', 'w', 'h', 'angle', 'strength'],
    };
    for (const o of (Array.isArray(m.objects) ? m.objects : []).slice(0, 600)) {
      if (!o || !keys[o.type]) continue;
      const c = { type: o.type };
      for (const k of keys[o.type]) c[k] = Math.round(num(o[k], 0) * 100) / 100;
      if (o.type === 'wall' && !c.t) c.t = DEFAULTS.wall.t;
      if (o.type === 'bumper' && !c.r) c.r = DEFAULTS.bumper.r;
      if (o.type === 'slope' || o.type === 'boost') {
        if (!o.strength && o.strength !== 0) c.strength = DEFAULTS[o.type].strength;
        c.strength = Math.max(0, Math.min(6000, c.strength));
      }
      out.objects.push(c);
    }
    return out;
  }

  const api = {
    DT, DEFAULTS, DEFAULT_CONFIG,
    configure, compile, withBalls, createState, step, simulate, shotVelocity, sanitizeMap,
  };
  // Live-Werte (ändern sich mit configure)
  Object.defineProperties(api, {
    config: { get: () => K },
    BALL_R: { get: () => K.ballRadius },
    HOLE_R: { get: () => K.holeRadius },
    MAX_SPEED: { get: () => K.maxSpeed },
    MAX_SHOTS: { get: () => K.maxShots },
    MISS_SCORE: { get: () => K.maxShots + K.missPenalty },
  });
  return api;
});
