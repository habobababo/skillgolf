/*
 * Skillgolf – gemeinsame, deterministische Physik.
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
    holePull: 2600,        // Sog direkt am Lochrand (px/s²)
    blackHole: {           // Das Loch ist ein schwarzes Loch und zieht Ball und Pucks an
      radius: 180,         // Reichweite der Anziehung (px), 0 = aus
      strength: 700,       // Anziehung im Zentrum (px/s²), nimmt nach außen quadratisch ab
      puckFactor: 1,       // Multiplikator für Pucks (schwere Pucks spüren zusätzlich weniger)
    },
    maxShotTime: 40,       // Sekunden, nach denen ein Schlag hart beendet wird
    surfaces: {            // decel = konstante Bremsung (px/s²), drag = geschwindigkeitsabhängige Bremsung
      grass: { decel: 220, drag: 0.32 },
      sand: { decel: 1250, drag: 2.6 },
      ice: { decel: 40, drag: 0.04 },
    },
    bounce: {              // Rückprall-Faktor (1 = verlustfrei)
      wall: 0.78, block: 0.72, border: 0.75, bumper: 1.05, bumperKick: 260, ball: 0.55,
      band: 1.3,           // Gummiband: über 1 = Ball kommt schneller zurück, als er kam
      bandKick: 140,       // zusätzlicher Schwung vom Gummiband
    },
    gravityPuck: {         // Jeder Spieler kann pro Bahn einen Gravitations-Puck abschießen (zählt nicht als Schlag)
      perHole: 1,
      speed: 1,            // Abschuss-Tempo relativ zum Ball
    },
    glass: {               // Glaswände: zerbrechen bei genug Tempo, sonst prallt man ab
      breakSpeed: 1100,    // ab diesem Aufprall-Tempo (px/s) zerbricht das Glas
      keep: 0.55,          // Anteil des Tempos, der nach dem Durchbrechen bleibt
      bounce: 0.6,         // Rückprall, wenn das Glas hält
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
      fieldCount: 1,
      bombs: {             // Bomben: scharf bei Berührung, Countdown (s) läuft erst nach dem Zug
        count: 3,          // Bomben pro Bahn (zusätzlich zu den Pucks)
        fromHole: 1,       // erst ab dieser Bahn (1 = immer)
        armFromShot: 2,    // Bomben werden erst ab diesem Schlag des Spielers scharf (davor normale Pucks)
        fuse: 5,
        bigShare: 0.5,     // Anteil großer Bomben (Rest klein)
        big: { radius: 20, mass: 3, blastRadius: 340, force: 3000, debris: 5 },
        small: { radius: 10, mass: 0.8, blastRadius: 190, force: 1900, debris: 3 },
        fieldChance: 0.01, // Chance, dass ein freigesprengter Puck Gravitation/Abstoßung hat
      },       // so viele Pucks pro Bahn bekommen ein Feld (zufällig Gravitation oder Abstoßung)
      attract: { radius: 230, strength: 900 },   // Gravitation: zieht den Ball an
      repel: { radius: 210, strength: 1100 },    // Abstoßung: drückt den Ball weg
    },
    ultimate: {            // „next BALL is ULTIMATE BALL“
      afterShots: 5,       // nach so vielen Schlägen ist der nächste Schlag erzwungen Ultimate (0 = aus)
      kickRadius: 2500,    // Reichweite des Wegkick-Stoßes
      kickForce: 3000,     // Stärke des Stoßes (schwere Pucks fliegen weniger weit)
      launchFactor: 0.5,   // Abschussgeschwindigkeit des Ultimate-Balls relativ zum normalen Schlag
      slowmo: 0.3,         // Zeitlupen-Faktor während der Steuerung
      steerTime: 6,        // Spielsekunden, die der Ball gesteuert werden kann
      steerAccel: 2600,    // Steuer-Beschleunigung (px/s²)
      pullAccel: 7000,     // linke Maustaste gedrückt: Ball wird kräftig zum Zeiger gezogen (px/s²)
      pullDamp: 3.5,       // Dämpfung dabei, damit er am Zeiger nicht vorbeischießt
      eat: true,           // frisst alles auf seinem Weg (Pucks, Gegnerbälle, Wände, Blöcke, Bumper …) und wächst
      grow: 2.5,           // Radius-Zuwachs pro Bissen (px)
      maxScale: 3,         // höchstens so viel größer als normal
    },
    sling: {               // „SLING BALL“: Ball mit der Maus lenken, ohne Wegkick
      shots: [2, 4],       // bei diesen Schlagnummern
      launchFactor: 1,
      slowmo: 0.6,
      steerTime: 2.5,
      steerAccel: 1800,
    },
    turn: {
      timeLimit: 23,       // Sekunden pro Zug, danach ist der nächste dran (0 = unbegrenzt)
    },
    points: {              // Punktesystem: mehr Punkte = besser
      holeInOne: 10, eagle: 7, birdie: 5, par: 3, bogey: 2, worse: 1, miss: 0,
      puck: 1,             // Bonus pro versenktem Puck (Wasser oder schwarzes Loch) im eigenen Schlag
      heavyPuck: 2,        // Bonus für einen schweren Puck
      trickshot: 2,        // Bonus, wenn der einlochende Schlag mindestens trickBounces Abpraller hatte
      trickBounces: 3,
      maxPuckBonus: 5,     // höchstens so viele Puck-Bonuspunkte pro Bahn
    },
    magnet: {              // „MAGNETISIEREN“: wartende Spieler ziehen den Ball des Schützen an
      usesPerHole: 2,      // Ladungen pro Spieler und Bahn
      strength: 3200,      // Anziehung direkt am Magneten (px/s²), nimmt nach außen ab
      radius: 420,         // Reichweite
    },
    fps: 60,               // Bildrate im Browser (0 = unbegrenzt)
    holeEndDelay: 5.5,     // Sekunden Punktetabelle zwischen den Bahnen
    maxPlayers: 8,
  };

  // Standardwerte für neue Objekte im Editor
  const DEFAULTS = {
    wall: { t: 14 },
    band: { t: 10 },
    glass: { t: 8 },
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
      if (Array.isArray(base[k])) { if (Array.isArray(over[k])) out[k] = over[k].map(Number).filter(Number.isFinite).map(Math.round).slice(0, 20); }
      else if (typeof base[k] === 'object') out[k] = mergeNum(base[k], over[k]);
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
    c.fps = c.fps <= 0 ? 0 : Math.round(lim(c.fps, 15, 360));
    c.turn.timeLimit = c.turn.timeLimit <= 0 ? 0 : lim(c.turn.timeLimit, 5, 600);
    c.magnet.usesPerHole = Math.round(lim(c.magnet.usesPerHole, 0, 20));
    c.magnet.radius = lim(c.magnet.radius, 20, 5000);
    c.pucks.count = Math.round(lim(c.pucks.count, 10, 60));
    for (const k of ['light', 'medium', 'heavy']) { c.pucks[k].mass = lim(c.pucks[k].mass, 0.05, 1000); c.pucks[k].radius = lim(c.pucks[k].radius, 4, 60); }
    c.pucks.ballMass = lim(c.pucks.ballMass, 0.05, 1000);
    c.pucks.fieldCount = Math.round(lim(c.pucks.fieldCount, 0, 30));
    { const B = c.pucks.bombs;
      B.count = Math.round(lim(B.count, 0, 30)); B.fuse = lim(B.fuse, 0.5, 120); B.fromHole = Math.round(lim(B.fromHole, 1, 100)); B.armFromShot = Math.round(lim(B.armFromShot, 1, 20));
      B.bigShare = lim(B.bigShare, 0, 1); B.fieldChance = lim(B.fieldChance, 0, 1);
      for (const k of ['big', 'small']) {
        const o = B[k]; o.radius = lim(o.radius, 4, 60); o.mass = lim(o.mass, 0.05, 100);
        o.blastRadius = lim(o.blastRadius, 10, 3000); o.force = lim(o.force, 0, 30000); o.debris = Math.round(lim(o.debris, 0, 12));
      } }
    for (const k of ['attract', 'repel']) { c.pucks[k].radius = lim(c.pucks[k].radius, 10, 3000); c.pucks[k].strength = lim(c.pucks[k].strength, 0, 20000); }
    c.gravityPuck.perHole = Math.round(lim(c.gravityPuck.perHole, 0, 10)); c.gravityPuck.speed = lim(c.gravityPuck.speed, 0.05, 3);
    c.glass.breakSpeed = lim(c.glass.breakSpeed, 0, 30000); c.glass.keep = lim(c.glass.keep, 0, 1); c.glass.bounce = lim(c.glass.bounce, 0, 2);
    c.bounce.band = lim(c.bounce.band, 0, 3); c.bounce.bandKick = lim(c.bounce.bandKick, 0, 3000);
    c.ultimate.afterShots = Math.round(lim(c.ultimate.afterShots, 0, 50));
    c.ultimate.slowmo = lim(c.ultimate.slowmo, 0.05, 1);
    c.ultimate.launchFactor = lim(c.ultimate.launchFactor, 0.05, 3);
    c.ultimate.pullAccel = lim(c.ultimate.pullAccel, 0, 50000); c.ultimate.pullDamp = lim(c.ultimate.pullDamp, 0, 50);
    c.ultimate.eat = c.ultimate.eat !== false; c.ultimate.grow = lim(c.ultimate.grow, 0, 50); c.ultimate.maxScale = lim(c.ultimate.maxScale, 1, 10);
    c.sling.launchFactor = lim(c.sling.launchFactor, 0.05, 3);
    c.sling.slowmo = lim(c.sling.slowmo, 0.05, 1);
    c.sling.steerTime = lim(c.sling.steerTime, 0, 20);
    c.ultimate.steerTime = lim(c.ultimate.steerTime, 0, 20);
    c.preview.width = lim(c.preview.width, 0.5, 20);
    c.preview.minWidth = lim(c.preview.minWidth, 0.3, c.preview.width);
    c.preview.fade = lim(c.preview.fade, 0, 1);
    c.preview.fadeLength = lim(c.preview.fadeLength, 50, 100000);
    c.blackHole.radius = lim(c.blackHole.radius, 0, 3000);
    c.blackHole.strength = lim(c.blackHole.strength, 0, 20000);
    c.blackHole.puckFactor = lim(c.blackHole.puckFactor, 0, 10);
    for (const k of Object.keys(c.points)) c.points[k] = Math.round(lim(c.points[k], 0, 100));
    K = c;
    return K;
  }

  function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }

  /*
   * Deterministische Winkelfunktionen. Math.sin/Math.cos sind laut Standard nicht exakt festgelegt
   * und können sich zwischen Browsern und Node in der letzten Stelle unterscheiden. Bei vielen
   * Abprallern reicht das, damit Vorschau und Server-Ergebnis auseinanderlaufen. Deshalb hier nur
   * + - * / und floor (Reihenentwicklung nach Bereichsreduktion).
   */
  const TAU = 6.283185307179586, HALF_PI = 1.5707963267948966, PI_ = 3.141592653589793;
  function reduce(a) { // -> [-π, π]
    a = num(a, 0);
    if (a > PI_ || a < -PI_) a -= TAU * Math.floor((a + PI_) / TAU);
    return a;
  }
  function sinCore(x) { // |x| <= π/2
    const x2 = x * x;
    let t = x, sum = x;
    for (let k = 1; k <= 11; k++) { t = -t * x2 / ((2 * k) * (2 * k + 1)); sum += t; }
    return sum;
  }
  function dsin(a) {
    a = reduce(a);
    if (a > HALF_PI) a = PI_ - a; else if (a < -HALF_PI) a = -PI_ - a;
    return sinCore(a);
  }
  function dcos(a) { return dsin(a + HALF_PI); }
  function deg2vec(deg) { const a = (deg * PI_) / 180; return [dcos(a), dsin(a)]; }

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
        case 'band': // elastisches Gummiband: wie eine Wand, aber verstärkt den Abprall
          solids.push({
            kind: 'seg', ax: num(o.x1, 0), ay: num(o.y1, 0), bx: num(o.x2, 0), by: num(o.y2, 0),
            rad: num(o.t, DEFAULTS.band.t) / 2, e: K.bounce.band, kick: K.bounce.bandKick, band: true,
          });
          break;
        case 'glass': // Glaswand: zerbricht bei genug Tempo (Zustand im Schlag-Zustand: s.glass)
          solids.push({
            kind: 'seg', ax: num(o.x1, 0), ay: num(o.y1, 0), bx: num(o.x2, 0), by: num(o.y2, 0),
            rad: num(o.t, DEFAULTS.glass.t) / 2, e: K.glass.bounce, glass: true,
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
   * magPucks: Indizes magnetisierter Pucks – der Magnet wandert mit dem Puck mit.
   */
  function withBalls(cm, balls, sx, sy, magnets, magPucks, magBalls) {
    const mags = [];
    const minM = K.ballRadius * 2 + 0.5; // Magnet direkt am Schützen (z. B. beide am Abschlag) wirkt nicht
    if (magnets) for (let i = 0; i + 1 < magnets.length; i += 2) {
      const mx = magnets[i], my = magnets[i + 1];
      if (sx != null && (mx - sx) * (mx - sx) + (my - sy) * (my - sy) < minM * minM) continue;
      mags.push({ x: mx, y: my });
    }
    if (mags.length) cm = Object.assign({}, cm, { magnets: mags });
    if (magPucks && magPucks.length) cm = Object.assign({}, cm, { magPucks: magPucks.map(Number).filter((i) => Number.isInteger(i) && i >= 0) });
    if (magBalls && magBalls.length) cm = Object.assign({}, cm, { magBalls: magBalls.map(Number) });
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
      nb: 0, bounce: false, hitV: 0, hit: null, pucks: pucks ? clonePucks(pucks) : [], inputs: opts.inputs || null, pevents: [],
      glass: {},           // zerstörte Objekte (zerbrochenes Glas, vom Ultimate gefressen): Objekt-Index -> true
      br: K.ballRadius,    // aktueller Ballradius (der Ultimate-Ball wächst beim Fressen)
      eat: !!opts.kick && K.ultimate.eat,
      noArm: !!opts.noArm, // erster Schlag: Bomben werden noch nicht scharf
    };
    if (opts.glass) for (const i of opts.glass) s.glass[i] = true;
    // liegende Gegnerbälle: bewegliche Körper (am Ende der Puck-Liste, pb = Spieler-ID)
    if (opts.balls) for (const b of ballBodies(opts.balls, x, y)) s.pucks.push(b);
    if (opts.kick && !K.ultimate.eat) ultimateKick(s); // frisst der Ultimate, wird nichts weggesprengt – er holt sich alles selbst
    return s;
  }
  function clonePucks(p) {
    return p.map((q) => {
      const o = { x: q.x, y: q.y, vx: q.vx || 0, vy: q.vy || 0, r: q.r, m: q.m, c: q.c, f: q.f || null, alive: q.alive !== false };
      if (q.bomb) { o.bomb = true; o.armed = !!q.armed; o.bs = q.bs || 'big'; }
      if (q.pb != null) { o.pb = q.pb; o.ox = q.ox; o.oy = q.oy; }
      if (q.gp != null) o.gp = q.gp;
      return o;
    });
  }
  function exportGlass(s) { return Object.keys(s.glass).map(Number).sort((a, b) => a - b); }
  function exportPucks(s) {
    const out = [];
    for (const q of s.pucks) {
      if (q.pb != null) continue; // Spielerbälle aus einer Explosion gehören nicht dazu
      const o = { x: q.x, y: q.y, r: q.r, m: q.m, c: q.c, alive: q.alive };
      if (q.f) o.f = q.f;
      if (q.gp != null) o.gp = q.gp;
      if (q.bomb) { o.bomb = true; o.armed = !!q.armed; o.bs = q.bs || 'big'; }
      out.push(o);
    }
    return out;
  }
  /** Gegnerbälle als Körper; Bälle, die den Schussstart überlappen (z. B. alle am Abschlag), werden ignoriert */
  function ballBodies(balls, sx, sy) {
    const out = [], rr = (2 * K.ballRadius) * (2 * K.ballRadius);
    for (const b of balls || []) {
      if (sx != null && (b.x - sx) * (b.x - sx) + (b.y - sy) * (b.y - sy) < rr) continue;
      out.push({ x: b.x, y: b.y, vx: 0, vy: 0, r: K.ballRadius, m: K.pucks.ballMass, c: 'ball', f: null, alive: true, pb: b.id, ox: b.x, oy: b.y });
    }
    return out;
  }
  function grow(s) { s.br = Math.min(K.ballRadius * K.ultimate.maxScale, s.br + K.ultimate.grow); }
  /** Bombe scharf machen (Berührung) */
  /** darf ein Schlag mit dieser Nummer (1 = erster) Bomben scharf machen? */
  function canArm(shotNo) { return shotNo >= K.pucks.bombs.armFromShot; }
  function arm(s, q) { if (s.noArm) return; if (q.bomb && !q.armed && q.alive) { q.armed = true; s.pevents.push({ type: 'arm', x: q.x, y: q.y }); } }
  function touching(a, b, ra, rb) { const dx = b.x - a.x, dy = b.y - a.y, rr = ra + rb + 0.5; return dx * dx + dy * dy < rr * rr; }

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

  /** Einstellungen eines gesteuerten Schlags: 'ult' | 'sling' (sonst null) */
  function modeCfg(mode) {
    if (mode === 'ult' || mode === true) return { ...K.ultimate, kick: true, name: 'ult' };
    if (mode === 'sling') return { ...K.sling, kick: false, name: 'sling' };
    return null;
  }
  /** Schlag-Modus aus Schlagnummer (1-basiert) – gleiche Regel auf Server und Client */
  function shotMode(shotNo, ultUsed) {
    const n = K.ultimate.afterShots;
    // >= statt ===: auch wenn ein Strafschlag (Zeit/Wasser) die Nummer überspringt, kommt der Ultimate noch
    if (n > 0 && !ultUsed && shotNo >= n + 1 && shotNo <= K.maxShots) return 'ult';
    if (K.sling.steerTime > 0 && K.sling.shots.includes(shotNo)) return 'sling';
    return null;
  }

  function shotVelocity(angle, power, mode) {
    power = Math.max(0, Math.min(1, num(power, 0)));
    const mc = modeCfg(mode);
    const sp = power * K.maxSpeed * (mc ? mc.launchFactor : 1);
    return { vx: dcos(angle) * sp, vy: dsin(angle) * sp };
  }

  /** Körper b (Radius r) gegen feste Objekte; rec = Treffer für Effekte merken */
  function collideStatic(cm, b, r, rec, st) {
    for (let i = 0; i < cm.solids.length; i++) {
      const o = cm.solids[i];
      if (st && o.src != null && st.glass[o.src]) continue; // zerbrochen / gefressen
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
      if (st && st.eat && b === st && o.src != null) {
        // Ultimate-Ball frisst das Hindernis (bleibt bis Bahnende weg) und wächst
        st.glass[o.src] = true; grow(st);
        st.pevents.push({ type: 'eat', src: o.src, x: b.x - nx * r, y: b.y - ny * r, big: true });
        continue;
      }
      if (o.glass && st) {
        // Glas: zerbricht, wenn der Körper schnell genug hineinfliegt (zählt nur das Tempo auf das Glas zu)
        const vin = -(b.vx * nx + b.vy * ny);
        if (vin >= K.glass.breakSpeed) {
          st.glass[o.src] = true;
          b.vx *= K.glass.keep; b.vy *= K.glass.keep;
          st.pevents.push({ type: 'glass', src: o.src, x: b.x - nx * r, y: b.y - ny * r, v: vin });
          continue;
        }
      }
      b.x += nx * pen; b.y += ny * pen;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + o.e) * vn * nx;
        b.vy -= (1 + o.e) * vn * ny;
        if (o.kick) { b.vx += nx * o.kick; b.vy += ny * o.kick; }
        if (rec && vn < -40) { b.bounce = true; b.nb = (b.nb || 0) + 1; if (-vn > b.hitV) { b.hitV = -vn; b.hit = o; } }
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

  /** Anziehung des schwarzen Lochs (px/s²) auf einen Körper -> [ax, ay] */
  function holeGravity(cm, x, y, k) {
    const BH = K.blackHole, R = BH.radius;
    if (!(R > 0) || !(BH.strength > 0) || !(k > 0)) return null;
    const dx = cm.hole.x - x, dy = cm.hole.y - y, d2 = dx * dx + dy * dy;
    if (d2 >= R * R || d2 < 1e-12) return null;
    const d = Math.sqrt(d2), f = 1 - d / R, a = BH.strength * f * f * k;
    return [dx / d * a, dy / d * a];
  }
  /** wie stark ein Puck das Loch spürt (schwere weniger) */
  function puckPull(q) { return K.blackHole.puckFactor / (1 + q.m * 0.05); }

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
      const g = holeGravity(cm, s.x, s.y, 1);
      if (g) { ex += g[0]; ey += g[1]; }
      if (s.inputs && s.n * 2 + 1 < s.inputs.length) { ex += s.inputs[s.n * 2]; ey += s.inputs[s.n * 2 + 1]; }
      if (cm.magnets) {
        const MR = K.magnet.radius, MS = K.magnet.strength;
        for (let i = 0; i < cm.magnets.length; i++) {
          const mg = cm.magnets[i], mx = mg.x - s.x, my = mg.y - s.y, md = Math.sqrt(mx * mx + my * my);
          if (md < MR && md > 1e-6) { const f = MS * (1 - md / MR); ex += mx / md * f; ey += my / md * f; }
        }
      }
      // Feld-Pucks: Gravitation (zieht an) bzw. Abstoßung (drückt weg)
      for (let i = 0; i < s.pucks.length; i++) {
        const q = s.pucks[i];
        if (!q.f || !q.alive) continue;
        const F = q.f === 'repel' ? K.pucks.repel : K.pucks.attract;
        const mx = q.x - s.x, my = q.y - s.y, md2 = mx * mx + my * my;
        if (md2 >= F.radius * F.radius || md2 < 1e-12) continue;
        const md = Math.sqrt(md2), u = 1 - md / F.radius, f = F.strength * u * u * (q.f === 'repel' ? -1 : 1);
        ex += mx / md * f; ey += my / md * f;
      }
      if (cm.magBalls) { // magnetisierte Gegnerbälle ziehen an, auch wenn sie angestoßen wurden
        const MR = K.magnet.radius, MS = K.magnet.strength;
        for (let i = 0; i < s.pucks.length; i++) {
          const q = s.pucks[i];
          if (q.pb == null || !q.alive || cm.magBalls.indexOf(q.pb) < 0) continue;
          const mx = q.x - s.x, my = q.y - s.y, md = Math.sqrt(mx * mx + my * my);
          if (md < MR && md > 1e-6) { const f = MS * (1 - md / MR); ex += mx / md * f; ey += my / md * f; }
        }
      }
      if (cm.magPucks) { // magnetisierte Pucks ziehen den Ball an, auch während sie selbst rollen
        const MR = K.magnet.radius, MS = K.magnet.strength;
        for (let i = 0; i < cm.magPucks.length; i++) {
          const q = s.pucks[cm.magPucks[i]];
          if (!q || !q.alive) continue;
          const mx = q.x - s.x, my = q.y - s.y, md = Math.sqrt(mx * mx + my * my);
          if (md < MR && md > 1e-6) { const f = MS * (1 - md / MR); ex += mx / md * f; ey += my / md * f; }
        }
      }
      if (!applyForces(cm, s, 1, ex, ey)) { s.done = true; s.result = 'water'; }
      else maxSp = s._sp;
    }
    // --- Pucks: Kräfte
    for (let i = 0; i < s.pucks.length; i++) {
      const q = s.pucks[i];
      if (!q.alive) continue;
      const g = holeGravity(cm, q.x, q.y, puckPull(q));
      if (!applyForces(cm, q, PK.friction, g ? g[0] : 0, g ? g[1] : 0)) { q.alive = false; q.vx = q.vy = 0; s.pevents.push({ type: 'sink', x: q.x, y: q.y, c: q.c }); continue; }
      if (q._sp < STOP_SPEED && q._a2 < q._dec * q._dec) { q.vx = 0; q.vy = 0; q._sp = 0; }
      if (q._sp > maxSp) maxSp = q._sp;
    }

    // --- Bewegung in Teilschritten
    const n = Math.max(1, Math.ceil(maxSp * DT / (BR * 0.35)));
    const sdt = DT / n;
    const ballSolid = s.result !== 'sunk' && s.result !== 'water';
    for (let k = 0; k < n; k++) {
      if (!s.done) { s.x += s.vx * sdt; s.y += s.vy * sdt; collideStatic(cm, s, s.br, true, s); }
      for (let i = 0; i < s.pucks.length; i++) {
        const q = s.pucks[i];
        if (!q.alive || (q.vx === 0 && q.vy === 0)) continue;
        q.x += q.vx * sdt; q.y += q.vy * sdt;
        collideStatic(cm, q, q.r, false, s);
      }
      if (ballSolid) {
        for (let i = 0; i < s.pucks.length; i++) {
          const q = s.pucks[i];
          if (!q.alive) continue;
          if (s.eat && !s.done && touching(s, q, s.br, q.r)) {
            // Ultimate frisst Pucks, Bomben und Gegnerbälle (die landen wieder am Abschlag)
            q.alive = false; q.vx = q.vy = 0;
            if (q.pb != null) { q.ox = cm.start.x; q.oy = cm.start.y; q.eaten = true; }
            grow(s);
            s.pevents.push({ type: 'eat', x: q.x, y: q.y, c: q.c, pb: q.pb });
            continue;
          }
          if (q.bomb && !q.armed && !s.done && touching(s, q, s.br, q.r)) arm(s, q);
          const imp = collidePair(s, s.done ? 0 : PK.ballMass, q, q.m, PK.bounce, s.br, q.r);
          if (imp > 40 && !s.done) { s.bounce = true; if (imp > s.hitV) { s.hitV = imp; s.hit = { kind: 'puck', c: q.c, m: q.m }; } }
        }
      }
      for (let i = 0; i < s.pucks.length; i++) {
        const a = s.pucks[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < s.pucks.length; j++) {
          const b = s.pucks[j];
          if (!b.alive || (a.vx === 0 && a.vy === 0 && b.vx === 0 && b.vy === 0)) continue;
          if ((a.bomb && !a.armed) || (b.bomb && !b.armed)) { if (touching(a, b, a.r, b.r)) { arm(s, a); arm(s, b); } }
          const imp = collidePair(a, a.m, b, b.m, PK.bounce, a.r, b.r);
          if (imp > 120 && s.pevents.length < 200) s.pevents.push({ type: 'pp', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: imp });
        }
      }
      // Pucks, die ins schwarze Loch fallen, werden verschluckt
      for (let i = 0; i < s.pucks.length; i++) {
        const q = s.pucks[i];
        if (!q.alive) continue;
        const dx = cm.hole.x - q.x, dy = cm.hole.y - q.y;
        if (dx * dx + dy * dy < HOLE_R * HOLE_R) { q.alive = false; q.vx = q.vy = 0; s.pevents.push({ type: 'swallow', x: q.x, y: q.y, c: q.c }); }
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
      points, bounces, ppaths, pucks: exportPucks(s), balls: blastBalls(s), glass: exportGlass(s), nb: s.nb,
    };
  }

  /** Punkte einer Bahn: Basis nach Schlägen/Par (+ Boni werden separat gezählt) */
  function holePoints(sunk, shots, par) {
    const Q = K.points;
    if (!sunk) return Q.miss;
    if (shots === 1) return Q.holeInOne;
    const d = shots - par;
    return d <= -2 ? Q.eagle : d === -1 ? Q.birdie : d === 0 ? Q.par : d === 1 ? Q.bogey : Q.worse;
  }
  /** Boni eines Schlags aus Puck-Zustand vorher/nachher und Abprallern */
  function shotBonus(pucksBefore, pucksAfter, result, nb) {
    const Q = K.points;
    let pk = 0, n = 0;
    for (let i = 0; i < pucksBefore.length && i < pucksAfter.length; i++) {
      if (pucksBefore[i].alive !== false && pucksAfter[i].alive === false) { n++; pk += pucksBefore[i].c === 'heavy' ? Q.heavyPuck : Q.puck; }
    }
    const trick = result === 'sunk' && Q.trickBounces > 0 && nb >= Q.trickBounces ? Q.trickshot : 0;
    return { pucks: n, puckPts: pk, trick, nb };
  }

  /**
   * Explosion einer Bombe (zwischen den Zügen). balls: [{id, x, y}] liegende Spielerbälle – sie fliegen mit.
   * Gibt einen Zustand zurück, der mit step() bis allDone weiterläuft (Server komplett, Client als Animation).
   */
  /** Werte einer Bombe je nach Größe */
  function bombCfg(q) { return K.pucks.bombs[q && q.bs === 'small' ? 'small' : 'big']; }
  function blastState(cm, pucks, balls, glass, idx) {
    const bodies = clonePucks(pucks);
    for (const b of balls || []) bodies.push({ x: b.x, y: b.y, vx: 0, vy: 0, r: K.ballRadius, m: K.pucks.ballMass, c: 'ball', f: null, alive: true, pb: b.id, ox: b.x, oy: b.y });
    const s = createState(-1e6, -1e6, 0, 0, [], { glass });
    s.pucks = bodies; s.done = true; s.result = 'rest';
    const q0 = bodies[idx];
    if (!q0 || !q0.alive) { s.allDone = true; return s; }
    const B = bombCfg(q0);
    q0.alive = false;
    s.pevents.push({ type: 'boom', x: q0.x, y: q0.y, r: B.blastRadius, small: q0.bs === 'small' });
    for (const q of bodies) {
      if (!q.alive) continue;
      let dx = q.x - q0.x, dy = q.y - q0.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= B.blastRadius) continue;
      if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
      const f = B.force * (1 - d / B.blastRadius) / Math.sqrt(q.m);
      q.vx += dx / d * f; q.vy += dy / d * f;
      arm(s, q); // Kettenreaktion: andere Bomben im Radius werden scharf
    }
    // aus der Bombe kommen neue Pucks zum Vorschein (deterministisch aus Position + Index)
    const R = rng(((q0.x * 73856093) ^ (q0.y * 19349663) ^ (idx * 83492791)) >>> 0);
    const PK = K.pucks, classes = ['light', 'medium', 'heavy'];
    const shares = classes.map((c) => Math.max(0, PK[c].share)), tot = shares.reduce((a, b) => a + b, 0) || 1;
    const debris = [], n = B.debris, a0 = R() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      let u = R() * tot, ci = 0;
      while (ci < 2 && u > shares[ci]) { u -= shares[ci]; ci++; }
      const c = classes[ci], r = PK[c].radius, a = a0 + k * (Math.PI * 2 / n), d = q0.r + r + 2, sp = 250 + R() * 450;
      const q = { x: q0.x + dcos(a) * d, y: q0.y + dsin(a) * d, vx: dcos(a) * sp, vy: dsin(a) * sp, r, m: PK[c].mass, c, f: null, alive: true };
      if (R() < K.pucks.bombs.fieldChance) q.f = R() < 0.5 ? 'attract' : 'repel';
      collideStatic(cm, q, r, false, s);
      debris.push(q);
      s.pevents.push({ type: 'debris', x: q.x, y: q.y, c, f: q.f });
    }
    bodies.splice(pucks.length, 0, ...debris); // hinter die bisherigen Pucks, vor die Bälle
    return s;
  }
  /**
   * Gravitations-Puck abschießen: startet direkt vor dem Ball des Schützen (id) in Schussrichtung.
   * balls: alle liegenden Bälle inkl. Schütze. Läuft wie blastState mit step() bis allDone.
   */
  function launchState(cm, pucks, balls, glass, id, angle, power, noArm) {
    const bodies = clonePucks(pucks);
    let from = null;
    for (const b of balls || []) {
      bodies.push({ x: b.x, y: b.y, vx: 0, vy: 0, r: K.ballRadius, m: K.pucks.ballMass, c: 'ball', f: null, alive: true, pb: b.id, ox: b.x, oy: b.y });
      if (b.id === id) from = b;
    }
    const s = createState(-1e6, -1e6, 0, 0, [], { glass, noArm });
    s.pucks = bodies; s.done = true; s.result = 'rest';
    if (!from) { s.allDone = true; return s; }
    const md = K.pucks.medium, dx = dcos(angle), dy = dsin(angle), v = shotVelocity(angle, power);
    const r = md.radius, d = K.ballRadius + r + 1;
    const q = { x: from.x + dx * d, y: from.y + dy * d, vx: v.vx * K.gravityPuck.speed, vy: v.vy * K.gravityPuck.speed, r, m: md.mass, c: 'medium', f: 'attract', alive: true, gp: id };
    s.pucks.splice(pucks.length, 0, q); // gehört zu den Pucks (vor den Bällen)
    s.launched = pucks.length;
    s.pevents.push({ type: 'launch', x: q.x, y: q.y });
    // im Startpunkt schon in einer Wand? dann direkt am Ball liegen lassen
    collideStatic(cm, q, r, false, s);
    return s;
  }
  function launch(cm, pucks, balls, glass, id, angle, power, noArm) {
    const s = launchState(cm, pucks, balls, glass, id, angle, power, noArm);
    while (!s.allDone && s.t < K.maxShotTime + 1) step(cm, s);
    return { pucks: exportPucks(s), balls: blastBalls(s), glass: exportGlass(s), time: s.t };
  }

  /** Explosion komplett rechnen -> neue Pucks, Ballpositionen, Glas */
  function blast(cm, pucks, balls, glass, idx) {
    const s = blastState(cm, pucks, balls, glass, idx);
    while (!s.allDone && s.t < K.maxShotTime + 1) step(cm, s);
    return { pucks: exportPucks(s), balls: blastBalls(s), glass: exportGlass(s), time: s.t };
  }
  /** Ballpositionen nach der Explosion (Wasser/Loch -> bleibt, wo er lag) */
  function blastBalls(s) {
    const out = [];
    for (const q of s.pucks) {
      if (q.pb == null) continue;
      out.push(q.alive ? { id: q.pb, x: q.x, y: q.y } : { id: q.pb, x: q.ox, y: q.oy, back: true, eaten: !!q.eaten });
    }
    return out;
  }

  // ---------------------------------------------------------------- Pucks verteilen
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** mindestens 10 Pucks zufällig, aber nicht in Hindernissen, Wasser, am Loch oder Abschlag */
  /** holeIndex: 0-basiert; Bomben erst ab K.pucks.bombs.fromHole */
  function spawnPucks(cm, seed, holeIndex) {
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
      { // nicht dort, wo das schwarze Loch den Puck sofort wegzieht
        const g = holeGravity(cm, x, y, puckPull({ m }));
        if (g && g[0] * g[0] + g[1] * g[1] > (K.surfaces.grass.decel * PK.friction * 0.8) ** 2) continue;
      }
      if ((x - cm.start.x) ** 2 + (y - cm.start.y) ** 2 < 90 * 90) continue;
      if (cm.zones.some((z) => z.kind === 'water' && x > z.x1 - r && x < z.x2 + r && y > z.y1 - r && y < z.y2 + r)) continue;
      if (out.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < (q.r + r + 8) ** 2)) continue;
      const t = { x, y, vx: 0, vy: 0, hitV: 0 };
      collideStatic(cm, t, r + 4, false);
      if (t.x !== x || t.y !== y) continue;
      out.push({ x: Math.round(x), y: Math.round(y), r, m, c, alive: true });
    }
    // einige Pucks bekommen ein Feld: Gravitation oder Abstoßung (nicht in Loch- oder Abschlagnähe)
    const cand = out.map((q, i) => i).filter((i) => {
      const q = out[i];
      return (q.x - cm.hole.x) ** 2 + (q.y - cm.hole.y) ** 2 > 220 * 220 && (q.x - cm.start.x) ** 2 + (q.y - cm.start.y) ** 2 > 220 * 220;
    });
    for (let k = 0; k < PK.fieldCount && cand.length; k++) {
      const j = Math.floor(R() * cand.length), i = cand.splice(j, 1)[0];
      out[i].f = R() < 0.5 ? 'attract' : 'repel';
    }
    // Bomben (groß/klein) zusätzlich, erst ab Bahn fromHole, nicht nahe Abschlag/Loch
    const BB = PK.bombs;
    if ((holeIndex == null ? Infinity : holeIndex + 1) >= BB.fromHole) {
      let placed = 0;
      for (let tries = 0; placed < BB.count && tries < 4000; tries++) {
        const bs = R() < BB.bigShare ? 'big' : 'small', bc = BB[bs], r = bc.radius;
        const x = r + 10 + R() * (cm.W - 2 * r - 20), y = r + 10 + R() * (cm.H - 2 * r - 20);
        if ((x - cm.hole.x) ** 2 + (y - cm.hole.y) ** 2 < 220 * 220 || (x - cm.start.x) ** 2 + (y - cm.start.y) ** 2 < 220 * 220) continue;
        { const g = holeGravity(cm, x, y, puckPull({ m: bc.mass })); if (g && g[0] * g[0] + g[1] * g[1] > (K.surfaces.grass.decel * PK.friction * 0.8) ** 2) continue; }
        if (cm.zones.some((z) => z.kind === 'water' && x > z.x1 - r && x < z.x2 + r && y > z.y1 - r && y < z.y2 + r)) continue;
        if (out.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < (q.r + r + 10) ** 2)) continue;
        const t = { x, y, vx: 0, vy: 0, hitV: 0 };
        collideStatic(cm, t, r + 4, false);
        if (t.x !== x || t.y !== y) continue;
        out.push({ x: Math.round(x), y: Math.round(y), r, m: bc.mass, c: 'medium', bomb: true, bs, armed: false, alive: true });
        placed++;
      }
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
      difficulty: ['easy', 'medium', 'hard'].includes(m.difficulty) ? m.difficulty : 'medium',
      width: W, height: H,
      start: { x: num(m.start && m.start.x, 100), y: num(m.start && m.start.y, H / 2) },
      hole: { x: num(m.hole && m.hole.x, W - 100), y: num(m.hole && m.hole.y, H / 2) },
      objects: [],
    };
    const keys = {
      wall: ['x1', 'y1', 'x2', 'y2', 't'], band: ['x1', 'y1', 'x2', 'y2', 't'], glass: ['x1', 'y1', 'x2', 'y2', 't'], block: ['x', 'y', 'w', 'h'], bumper: ['x', 'y', 'r'],
      sand: ['x', 'y', 'w', 'h'], ice: ['x', 'y', 'w', 'h'], water: ['x', 'y', 'w', 'h'],
      slope: ['x', 'y', 'w', 'h', 'angle', 'strength'], boost: ['x', 'y', 'w', 'h', 'angle', 'strength'],
    };
    for (const o of (Array.isArray(m.objects) ? m.objects : []).slice(0, 600)) {
      if (!o || !keys[o.type]) continue;
      const c = { type: o.type };
      for (const k of keys[o.type]) c[k] = Math.round(num(o[k], 0) * 100) / 100;
      if (o.type === 'wall' && !c.t) c.t = DEFAULTS.wall.t;
      if (o.type === 'band' && !c.t) c.t = DEFAULTS.band.t;
      if (o.type === 'glass' && !c.t) c.t = DEFAULTS.glass.t;
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
    configure, compile, withBalls, createState, step, simulate, shotVelocity, sanitizeMap, spawnPucks, exportPucks, exportGlass, modeCfg, shotMode,
    holePoints, shotBonus, dsin, dcos, blastState, blast, blastBalls, launchState, launch, ballBodies, bombCfg, canArm,
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
