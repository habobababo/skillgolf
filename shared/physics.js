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
    pucks: {               // bewegliche Pucks (mindestens 10 pro Bahn)
      count: 12,
      ballMass: 1,         // Masse des Golfballs im Vergleich
      bounce: 0.8,         // Elastizität bei Stößen
      friction: 1.4,       // Reibungsfaktor gegenüber dem Ball
      light: { mass: 0.6, radius: 11, share: 0.4 },
      medium: { mass: 2.5, radius: 13, share: 0.35 },
      heavy: { mass: 14, radius: 16, share: 0.25 },
    },
    ultimate: {            // „next BALL is ULTIMATE BALL“
      afterShots: 5,       // nach so vielen Schlägen ist der nächste Schlag erzwungen Ultimate (0 = aus)
      kickRadius: 2500,    // Reichweite des Wegkick-Stoßes
      kickForce: 3000,     // Stärke des Stoßes (schwere Pucks fliegen weniger weit)
      slowmo: 0.3,         // Zeitlupen-Faktor während der Steuerung
      steerTime: 3,        // Spielsekunden, die der Ball gesteuert werden kann
      steerAccel: 2600,    // Steuer-Beschleunigung (px/s²)
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
    c.pucks.count = Math.round(lim(c.pucks.count, 10, 60));
    for (const k of ['light', 'medium', 'heavy']) { c.pucks[k].mass = lim(c.pucks[k].mass, 0.05, 1000); c.pucks[k].radius = lim(c.pucks[k].radius, 4, 60); }
    c.pucks.ballMass = lim(c.pucks.ballMass, 0.05, 1000);
    c.ultimate.afterShots = Math.round(lim(c.ultimate.afterShots, 0, 50));
    c.ultimate.slowmo = lim(c.ultimate.slowmo, 0.05, 1);
    c.ultimate.steerTime = lim(c.ultimate.steerTime, 0, 20);
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

  // ---------------------------------------------------------------- Zustand
  /**
   * Ball-Zustand inkl. beweglicher Pucks.
   * pucks: [{x,y,r,m,c,alive}] – c = 'light' | 'medium' | 'heavy'
   * opts.kick: Ultimate-Stoß beim Abschlag, opts.inputs: Steuer-Beschleunigung pro Schritt [ax0,ay0,ax1,ay1,…]
   */
  function createState(x, y, vx, vy, pucks, opts) {
    opts = opts || {};
    const s = {
      x, y, vx, vy, t: 0, n: 0, slow: 0, done: false, allDone: false, result: null, sx: x, sy: y,
      bounce: false, hitV: 0, hit: null, pucks: pucks ? clonePucks(pucks) : [], inputs: opts.inputs || null, pevents: [],
    };
    if (opts.kick) ultimateKick(s);
    return s;
  }
  function clonePucks(p) { return p.map((q) => ({ x: q.x, y: q.y, vx: q.vx || 0, vy: q.vy || 0, r: q.r, m: q.m, c: q.c, alive: q.alive !== false })); }
  function exportPucks(s) { return s.pucks.map((q) => ({ x: q.x, y: q.y, r: q.r, m: q.m, c: q.c, alive: q.alive })); }

  /** Ultimate: alle Pucks vom Ball wegschleudern (schwere weniger) */
  function ultimateKick(s) {
    const U = K.ultimate;
    for (const q of s.pucks) {
      if (!q.alive) continue;
      let dx = q.x - s.x, dy = q.y - s.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
      if (d > U.kickRadius) continue;
      const f = U.kickForce * (1 - 0.6 * d / U.kickRadius) / Math.sqrt(q.m);
      q.vx += dx / d * f; q.vy += dy / d * f;
    }
  }

  function shotVelocity(angle, power) {
    power = Math.max(0, Math.min(1, num(power, 0)));
    const sp = power * K.maxSpeed;
    return { vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp };
  }

  /** Körper b (Radius r) gegen feste Objekte; rec = Treffer für Effekte merken */
  function collideStatic(cm, b, r, rec) {
    for (let i = 0; i < cm.solids.length; i++) {
      const o = cm.solids[i];
      let nx = 0, ny = 0, pen = 0;
      if (o.kind === 'seg') {
        const dx = o.bx - o.ax, dy = o.by - o.ay;
        const l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((b.x - o.ax) * dx + (b.y - o.ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = b.x - (o.ax + dx * t), ey = b.y - (o.ay + dy * t);
        const d2 = ex * ex + ey * ey, rr = r + o.rad;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        if (d > 1e-9) { nx = ex / d; ny = ey / d; } else if (l2 > 0) { const l = Math.sqrt(l2); nx = -dy / l; ny = dx / l; } else { nx = 1; ny = 0; }
        pen = rr - d;
      } else if (o.kind === 'circle') {
        const ex = b.x - o.x, ey = b.y - o.y;
        const d2 = ex * ex + ey * ey, rr = r + o.r;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        if (d > 1e-9) { nx = ex / d; ny = ey / d; } else { nx = 1; ny = 0; }
        pen = rr - d;
      } else {
        if (b.x < o.x1 - r || b.x > o.x2 + r || b.y < o.y1 - r || b.y > o.y2 + r) continue;
        const cx = b.x < o.x1 ? o.x1 : b.x > o.x2 ? o.x2 : b.x;
        const cy = b.y < o.y1 ? o.y1 : b.y > o.y2 ? o.y2 : b.y;
        const ex = b.x - cx, ey = b.y - cy, d2 = ex * ex + ey * ey;
        if (d2 > 1e-12) {
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2);
          nx = ex / d; ny = ey / d; pen = r - d;
        } else {
          const l = b.x - o.x1, rt = o.x2 - b.x, tp = b.y - o.y1, bt = o.y2 - b.y;
          let m = l; nx = -1; ny = 0;
          if (rt < m) { m = rt; nx = 1; ny = 0; }
          if (tp < m) { m = tp; nx = 0; ny = -1; }
          if (bt < m) { m = bt; nx = 0; ny = 1; }
          pen = m + r;
        }
      }
      b.x += nx * pen; b.y += ny * pen;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + o.e) * vn * nx;
        b.vy -= (1 + o.e) * vn * ny;
        if (o.kick) { b.vx += nx * o.kick; b.vy += ny * o.kick; }
        if (rec && vn < -40) { b.bounce = true; if (-vn > b.hitV) { b.hitV = -vn; b.hit = o; } }
      }
    }
  }

  /** Stoß zweier Kreise; Masse 0 = unbeweglich. Gibt die Aufprallgeschwindigkeit zurück. */
  function collidePair(a, ma, b, mb, e, ra, rb) {
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, rr = ra + rb;
    if (d2 >= rr * rr) return 0;
    const ia = ma > 0 ? 1 / ma : 0, ib = mb > 0 ? 1 / mb : 0, sum = ia + ib;
    if (sum === 0) return 0;
    const d = Math.sqrt(d2);
    let nx = 1, ny = 0;
    if (d > 1e-9) { nx = dx / d; ny = dy / d; }
    const pen = rr - d;
    a.x -= nx * pen * ia / sum; a.y -= ny * pen * ia / sum;
    b.x += nx * pen * ib / sum; b.y += ny * pen * ib / sum;
    const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vrel >= 0) return 0;
    const j = -(1 + e) * vrel / sum;
    a.vx -= j * ia * nx; a.vy -= j * ia * ny;
    b.vx += j * ib * nx; b.vy += j * ib * ny;
    return -vrel;
  }

  function inRect(z, x, y) { return x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2; }

  /** Kräfte + Reibung für einen Körper; gibt false zurück, wenn er im Wasser landet */
  function applyForces(cm, b, fric, extraAx, extraAy) {
    const SURF = K.surfaces;
    let ax = extraAx, ay = extraAy, surf = SURF.grass;
    for (let i = 0; i < cm.zones.length; i++) {
      const z = cm.zones[i];
      if (!inRect(z, b.x, b.y)) continue;
      if (z.kind === 'water') return false;
      else if (z.kind === 'sand') surf = SURF.sand;
      else if (z.kind === 'ice') surf = SURF.ice;
      else { ax += z.fx; ay += z.fy; }
    }
    b.vx += ax * DT; b.vy += ay * DT;
    const dec = surf.decel * fric;
    let sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp > 0) {
      let ns = sp - (dec + surf.drag * sp) * DT;
      if (ns < 0) ns = 0;
      if (ns > K.speedCap) ns = K.speedCap;
      const k = ns / sp;
      b.vx *= k; b.vy *= k; sp = ns;
    }
    b._a2 = ax * ax + ay * ay; b._dec = dec; b._sp = sp;
    return true;
  }

  /** einen Zeitschritt simulieren (Ball + Pucks) */
  function step(cm, s) {
    if (s.allDone) return;
    const HOLE_R = K.holeRadius, PK = K.pucks, BR = K.ballRadius;
    s.bounce = false; s.hitV = 0; s.hit = null;
    let maxSp = 0;

    // --- Ball: Kräfte
    if (!s.done) {
      let ex = 0, ey = 0;
      const hx = cm.hole.x - s.x, hy = cm.hole.y - s.y, hd = Math.sqrt(hx * hx + hy * hy);
      if (hd < HOLE_R && hd > 1e-6) { ex += (hx / hd) * K.holePull; ey += (hy / hd) * K.holePull; }
      if (s.inputs && s.n * 2 + 1 < s.inputs.length) { ex += s.inputs[s.n * 2]; ey += s.inputs[s.n * 2 + 1]; }
      if (!applyForces(cm, s, 1, ex, ey)) { s.done = true; s.result = 'water'; }
      else maxSp = s._sp;
    }
    // --- Pucks: Kräfte
    for (let i = 0; i < s.pucks.length; i++) {
      const q = s.pucks[i];
      if (!q.alive) continue;
      if (!applyForces(cm, q, PK.friction, 0, 0)) { q.alive = false; q.vx = q.vy = 0; s.pevents.push({ type: 'sink', x: q.x, y: q.y, c: q.c }); continue; }
      if (q._sp < STOP_SPEED && q._a2 < q._dec * q._dec) { q.vx = 0; q.vy = 0; q._sp = 0; }
      if (q._sp > maxSp) maxSp = q._sp;
    }

    // --- Bewegung in Teilschritten
    const n = Math.max(1, Math.ceil(maxSp * DT / (BR * 0.35)));
    const sdt = DT / n;
    const ballSolid = s.result !== 'sunk' && s.result !== 'water';
    for (let k = 0; k < n; k++) {
      if (!s.done) { s.x += s.vx * sdt; s.y += s.vy * sdt; collideStatic(cm, s, BR, true); }
      for (let i = 0; i < s.pucks.length; i++) {
        const q = s.pucks[i];
        if (!q.alive || (q.vx === 0 && q.vy === 0)) continue;
        q.x += q.vx * sdt; q.y += q.vy * sdt;
        collideStatic(cm, q, q.r, false);
      }
      if (ballSolid) {
        for (let i = 0; i < s.pucks.length; i++) {
          const q = s.pucks[i];
          if (!q.alive) continue;
          const imp = collidePair(s, s.done ? 0 : PK.ballMass, q, q.m, PK.bounce, BR, q.r);
          if (imp > 40 && !s.done) { s.bounce = true; if (imp > s.hitV) { s.hitV = imp; s.hit = { kind: 'puck', c: q.c, m: q.m }; } }
        }
      }
      for (let i = 0; i < s.pucks.length; i++) {
        const a = s.pucks[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < s.pucks.length; j++) {
          const b = s.pucks[j];
          if (!b.alive || (a.vx === 0 && a.vy === 0 && b.vx === 0 && b.vy === 0)) continue;
          const imp = collidePair(a, a.m, b, b.m, PK.bounce, a.r, b.r);
          if (imp > 120 && s.pevents.length < 200) s.pevents.push({ type: 'pp', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: imp });
        }
      }
      if (!s.done) {
        const dx = cm.hole.x - s.x, dy = cm.hole.y - s.y, cr = Math.max(1, HOLE_R - 3);
        if (dx * dx + dy * dy < cr * cr && s.vx * s.vx + s.vy * s.vy < K.captureSpeed * K.captureSpeed) {
          s.x = cm.hole.x; s.y = cm.hole.y; s.vx = 0; s.vy = 0; s.done = true; s.result = 'sunk';
        }
      }
    }

    s.t += DT; s.n++;
    // --- Ball-Ende
    if (!s.done) {
      const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (sp < STOP_SPEED && s._a2 < s._dec * s._dec) { s.vx = 0; s.vy = 0; s.done = true; s.result = 'rest'; }
      else {
        if (sp < STOP_SPEED * 6) s.slow += DT; else s.slow = 0;
        if (s.slow > 1.2) { s.vx = 0; s.vy = 0; s.done = true; s.result = 'rest'; }
      }
    }
    // --- Pucks-Ende
    let moving = false;
    for (let i = 0; i < s.pucks.length; i++) {
      const q = s.pucks[i];
      if (!q.alive) continue;
      if (q.vx * q.vx + q.vy * q.vy < STOP_SPEED * STOP_SPEED) { q.vx = 0; q.vy = 0; }
      if (q.vx !== 0 || q.vy !== 0) moving = true;
    }
    if (s.t > K.maxShotTime) {
      if (!s.done) { s.done = true; s.result = 'rest'; s.vx = 0; s.vy = 0; }
      for (const q of s.pucks) { q.vx = 0; q.vy = 0; }
      moving = false;
    }
    s.allDone = s.done && !moving;
  }

  /**
   * Kompletten Schlag simulieren.
   * opts: record (Pfade sammeln), every, maxTime (Vorschau-Abbruch), pucks, kick, inputs
   */
  function simulate(cm, x, y, vx, vy, opts) {
    opts = opts || {};
    const s = createState(x, y, vx, vy, opts.pucks, opts);
    const every = opts.every || 2;
    const maxT = Math.min(opts.maxTime || 1e9, K.maxShotTime + 1);
    const points = opts.record ? [x, y] : null;
    const bounces = opts.record ? [] : null;
    const ppaths = opts.record ? s.pucks.map((q) => [q.x, q.y]) : null;
    let ballDoneAt = -1;
    while (!s.allDone && s.t < maxT) {
      step(cm, s);
      if (points) {
        if (!s.done || ballDoneAt < 0) {
          if (s.bounce) { bounces.push(s.x, s.y); points.push(s.x, s.y); }
          else if (s.n % every === 0 || s.done) points.push(s.x, s.y);
        }
        if (s.n % (every * 2) === 0) for (let i = 0; i < s.pucks.length; i++) {
          const q = s.pucks[i], pp = ppaths[i];
          if (q.alive && (pp[pp.length - 2] !== q.x || pp[pp.length - 1] !== q.y)) pp.push(q.x, q.y);
        }
      }
      if (s.done && ballDoneAt < 0) ballDoneAt = s.t;
    }
    if (ppaths) for (let i = 0; i < s.pucks.length; i++) { const q = s.pucks[i]; ppaths[i].push(q.x, q.y); }
    return {
      x: s.x, y: s.y, result: s.done ? s.result : 'cut', steps: s.n, time: s.t, ballTime: ballDoneAt < 0 ? s.t : ballDoneAt,
      points, bounces, ppaths, pucks: exportPucks(s),
    };
  }

  // ---------------------------------------------------------------- Pucks verteilen
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** mindestens 10 Pucks zufällig, aber nicht in Hindernissen, Wasser, am Loch oder Abschlag */
  function spawnPucks(cm, seed) {
    const R = rng(seed), PK = K.pucks, out = [];
    const count = Math.max(10, Math.round(PK.count));
    const classes = ['light', 'medium', 'heavy'];
    const shares = classes.map((c) => Math.max(0, PK[c].share));
    const tot = shares.reduce((a, b) => a + b, 0) || 1;
    for (let tries = 0; out.length < count && tries < 6000; tries++) {
      let u = R() * tot, ci = 0;
      while (ci < 2 && u > shares[ci]) { u -= shares[ci]; ci++; }
      const c = classes[ci], r = PK[c].radius, m = PK[c].mass;
      const x = r + 10 + R() * (cm.W - 2 * r - 20), y = r + 10 + R() * (cm.H - 2 * r - 20);
      if ((x - cm.hole.x) ** 2 + (y - cm.hole.y) ** 2 < 80 * 80) continue;
      if ((x - cm.start.x) ** 2 + (y - cm.start.y) ** 2 < 90 * 90) continue;
      if (cm.zones.some((z) => z.kind === 'water' && x > z.x1 - r && x < z.x2 + r && y > z.y1 - r && y < z.y2 + r)) continue;
      if (out.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < (q.r + r + 8) ** 2)) continue;
      const t = { x, y, vx: 0, vy: 0, hitV: 0 };
      collideStatic(cm, t, r + 4, false);
      if (t.x !== x || t.y !== y) continue;
      out.push({ x: Math.round(x), y: Math.round(y), r, m, c, alive: true });
    }
    return out;
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
    configure, compile, withBalls, createState, step, simulate, shotVelocity, sanitizeMap, spawnPucks, exportPucks,
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
