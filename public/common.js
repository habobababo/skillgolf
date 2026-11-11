/* Skillgolf – gemeinsames Rendering, Effekte, Sound & Steuerung (Spiel + Editor) – Neon-Stil */
(function () {
  const P = window.SkillPhysics;

  // Umbenennung Skillshot -> Skillgolf: gespeicherte Einstellungen einmalig übernehmen, alte Profilbilder löschen
  try {
    for (const k of ['name', 'mute', 'editorDraft']) {
      const old = localStorage.getItem('skillshot.' + k);
      if (old != null && localStorage.getItem('skillgolf.' + k) == null) localStorage.setItem('skillgolf.' + k, old);
      localStorage.removeItem('skillshot.' + k);
    }
    localStorage.removeItem('skillshot.avatar');
  } catch { /* kein Speicher */ }

  const NEON = {
    bg1: '#0d0b26', bg2: '#020207', floor: '#090b1c', grid: 'rgba(110,130,255,0.07)', border: '#00eaff',
    wall: '#2ef2ff', block: '#8a5cff', bumper: '#ff2e88', sand: '#ffb02e', ice: '#a6fbff',
    water: '#2f7bff', slope: '#39ff8a', boost: '#ffe600', hole: '#ffffff', band: '#ff9a3c',
  };
  const PUCK_COL = { light: '#39ff8a', medium: '#ffe03a', heavy: '#ff3860' };
  const PUCK_NAME = { light: 'leicht', medium: 'mittel', heavy: 'schwer' };
  const FIELD_COL = { attract: '#c36bff', repel: '#ff9a3c' };
  const FIELD_NAME = { attract: 'Gravitation (zieht an)', repel: 'Abstoßung (drückt weg)' };
  // Touch-Gerät (Handy/Tablet)? -> kürzerer Ziehweg, Zwei-Finger-Abbruch, Layout-Anpassungen
  const TOUCH = typeof window !== 'undefined' && !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  // CSS-Pixel Ziehweg für 100 % Kraft; auf kleinen Touch-Bildschirmen kürzer, damit volle Kraft auf den Schirm passt
  const MAX_DRAG = () => (TOUCH ? Math.min(P.config.dragDistance, Math.max(110, Math.min(window.innerWidth, window.innerHeight) * 0.42)) : P.config.dragDistance);

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function powerColor(p, a) { return `hsla(${Math.round(130 - 130 * p)},100%,60%,${a == null ? 1 : a})`; }
  function rectN(o) { return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) }; }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ------------------------------------------------------------ Ansicht
  class View {
    constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.scale = 1; this.ox = 0; this.oy = 0; this.pad = 22; this.sx = 0; this.sy = 0; this.dpr = 1; }
    fit(W, H) {
      const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, PERF.maxDpr);
      const r = c.getBoundingClientRect();
      if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
        c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
      }
      const pad = (Math.min(window.innerWidth, window.innerHeight) < 600 ? 6 : this.pad) * dpr; // Handy: Platz nicht verschenken
      this.scale = Math.max(0.05, Math.min((c.width - 2 * pad) / W, (c.height - 2 * pad) / H));
      this.ox = (c.width - W * this.scale) / 2;
      this.oy = (c.height - H * this.scale) / 2;
      this.dpr = dpr;
    }
    begin(fx) {
      const ctx = this.ctx, c = this.canvas;
      const sh = fx ? fx.shakeAmt : 0;
      this.sx = sh ? (Math.random() - 0.5) * 2 * sh * this.dpr : 0;
      this.sy = sh ? (Math.random() - 0.5) * 2 * sh * this.dpr : 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      // Hintergrund-Verlauf nur einmal pro Größe berechnen (vorher jedes Bild für die ganze Fläche)
      if (!this.bg || this.bg.width !== c.width || this.bg.height !== c.height) {
        this.bg = document.createElement('canvas'); this.bg.width = c.width; this.bg.height = c.height;
        const b = this.bg.getContext('2d');
        const g = b.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.7);
        g.addColorStop(0, NEON.bg1); g.addColorStop(1, NEON.bg2);
        b.fillStyle = g; b.fillRect(0, 0, c.width, c.height);
      }
      ctx.drawImage(this.bg, 0, 0);
      this.world();
    }
    /**
     * Bloom: das fertige Bild verkleinert + weichgezeichnet aufhellend darüberlegen.
     * Ersetzt die vielen einzelnen Leuchtschatten (shadowBlur), die beim Zeichnen sehr teuer sind.
     */
    bloom() {
      if (!PERF.bloom || PERF.lowFx) return;
      const c = this.canvas, ctx = this.ctx, w = Math.max(1, c.width >> 2), h = Math.max(1, c.height >> 2);
      if (!this.bl || this.bl.width !== w || this.bl.height !== h) { this.bl = document.createElement('canvas'); this.bl.width = w; this.bl.height = h; this.blx = this.bl.getContext('2d'); }
      const b = this.blx;
      b.globalCompositeOperation = 'copy'; b.filter = 'blur(2px)'; b.drawImage(c, 0, 0, w, h); b.filter = 'none';
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = PERF.bloom;
      ctx.drawImage(this.bl, 0, 0, c.width, c.height);
      ctx.restore();
    }
    world() { this.ctx.setTransform(this.scale, 0, 0, this.scale, this.ox + this.sx, this.oy + this.sy); }
    screen() { this.ctx.setTransform(1, 0, 0, 1, 0, 0); }
    toWorld(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const px = (clientX - r.left) * this.dpr, py = (clientY - r.top) * this.dpr;
      return { x: (px - this.ox) / this.scale, y: (py - this.oy) / this.scale };
    }
  }

  // ------------------------------------------------------------ Neon-Helfer
  // ------------------------------------------------------------ Leistung
  // lowFx: Spar-Modus (keine Weichzeichner-Leuchteffekte, weniger Partikel, max. 1-fache Auflösung).
  // Wird automatisch aktiviert, wenn die Bildrate dauerhaft einbricht (siehe PerfMonitor).
  // bloom: Stärke des Bloom-Nachleuchtens (0 = aus); glowShadows: echte Leuchtschatten pro Objekt (teuer)
  // Standard: Bloom statt Einzel-Leuchtschatten (gleicher Look, ein Bruchteil des Aufwands).
  // baking: beim einmaligen Vorzeichnen (Bahn-Cache, Sprites) sind echte Leuchtschatten erlaubt.
  const PERF = { lowFx: false, maxDpr: 2, maxParts: 2500, glowScale: 1, bloom: 0.55, glowShadows: false, baking: false };
  function setLowFx(on) { PERF.lowFx = !!on; PERF.maxDpr = on ? 1 : 2; PERF.maxParts = on ? 700 : 2500; }
  /** misst die Bildzeit und schaltet bei Bedarf in den Spar-Modus (einmalig, bleibt für die Sitzung) */
  class PerfMonitor {
    constructor(onLow) { this.acc = 0; this.n = 0; this.bad = 0; this.onLow = onLow; this.skip = 2; }
    frame(dt) {
      if (PERF.lowFx || PERF.userFull || document.hidden || dt > 0.5) return;
      try { if (localStorage.getItem('skillgolf.lowfx') === '0') return; } catch { /* egal */ } // bewusst volle Effekte gewählt // Tab im Hintergrund / Ruckler beim Laden ignorieren
      if (this.skip > 0) { this.skip -= dt; return; }
      this.acc += dt; this.n++;
      if (this.acc < 2) return;
      const avg = this.acc / this.n; this.acc = 0; this.n = 0;
      this.bad = avg > 1 / 30 ? this.bad + 1 : 0;        // unter ~30 FPS
      if (this.bad >= 3) {                                // ... und das 6 Sekunden lang
        try { if (localStorage.getItem('skillgolf.lowfx') === '0') { PERF.userFull = true; return; } } catch { /* egal */ } // bewusst volle Effekte gewählt
        setLowFx(true); if (this.onLow) this.onLow();
      }
    }
  }
  try { if (localStorage.getItem('skillgolf.lowfx') === '1') setLowFx(true); } catch { /* egal */ }

  // vorgerenderte Bilder (Sprites) für teure, gleichbleibende Grafik
  const sprites = new Map();
  function pxScale(ctx) { const m = ctx.getTransform(); return Math.max(0.25, Math.round(Math.min(3, Math.hypot(m.a, m.b)) * 4) / 4); }
  /** quadratisches Sprite mit Mittelpunkt (0,0) und Kantenlänge size (Weltmaß) */
  function sprite(key, size, k, draw) {
    const px = Math.max(2, Math.ceil(size * k)), id = key + '@' + px;
    let c = sprites.get(id);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = px;
      const x = c.getContext('2d'); x.scale(px / size, px / size); x.translate(size / 2, size / 2);
      PERF.baking = true; try { draw(x, px / size); } finally { PERF.baking = false; }
      sprites.set(id, c);
      if (sprites.size > 200) sprites.delete(sprites.keys().next().value);
    }
    return c;
  }
  function blit(ctx, c, x, y, size, rot) {
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(c, -size / 2, -size / 2, size, size); ctx.restore(); }
    else ctx.drawImage(c, x - size / 2, y - size / 2, size, size);
  }

  function glow(ctx, color, blur, k) { if (PERF.lowFx || !(PERF.glowShadows || PERF.baking)) return; ctx.shadowColor = color; ctx.shadowBlur = blur * (k || 1) * PERF.glowScale; }
  function noGlow(ctx) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
  function neonPath(ctx, color, width, k, pathFn) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    glow(ctx, color, 18, k); ctx.strokeStyle = color; ctx.lineWidth = width;
    pathFn(); ctx.stroke();
    noGlow(ctx);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, width * 0.3);
    pathFn(); ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------ statische Ebene (gecacht)
  function drawStatic(ctx, map, k, broken) {
    const W = map.width, H = map.height, objs = map.objects || [];
    ctx.save();
    // Boden mit Leuchtrand
    glow(ctx, NEON.border, 40, k); ctx.fillStyle = NEON.floor; ctx.fillRect(0, 0, W, H); noGlow(ctx);
    ctx.strokeStyle = NEON.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 40; x < W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 40; y < H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(140,160,255,0.12)';
    for (let x = 40; x < W; x += 40) for (let y = 40; y < H; y += 40) ctx.fillRect(x - 1, y - 1, 2, 2);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(60,40,140,0.10)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    // Zonen-Grundflächen
    for (const o of objs) {
      const r = rectN(o);
      if (o.type === 'slope') {
        ctx.fillStyle = 'rgba(57,255,138,0.05)'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = 'rgba(57,255,138,0.35)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
      }
    }
    for (const o of objs) {
      const r = rectN(o);
      if (o.type === 'sand') {
        ctx.fillStyle = 'rgba(255,176,46,0.12)'; roundRect(ctx, r.x, r.y, r.w, r.h, 16); ctx.fill();
        ctx.save(); roundRect(ctx, r.x, r.y, r.w, r.h, 16); ctx.clip();
        ctx.fillStyle = 'rgba(255,190,80,0.35)';
        for (let i = 0; i < r.w * r.h / 90; i++) ctx.fillRect(r.x + hash(i + r.x * 7 + r.y) * r.w, r.y + hash(i * 3.1 + r.y) * r.h, 1.6, 1.6);
        ctx.restore();
        neonPath(ctx, NEON.sand, 2.5, k, () => roundRect(ctx, r.x, r.y, r.w, r.h, 16));
      } else if (o.type === 'ice') {
        const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
        g.addColorStop(0, 'rgba(166,251,255,0.16)'); g.addColorStop(1, 'rgba(80,170,255,0.08)');
        ctx.fillStyle = g; roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
        ctx.save(); roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.clip();
        ctx.strokeStyle = 'rgba(200,250,255,0.22)'; ctx.lineWidth = 1.2;
        for (let i = 0; i < r.w * r.h / 5000 + 3; i++) {
          const x = r.x + hash(i + r.x) * r.w, y = r.y + hash(i * 1.7 + r.y) * r.h, a = hash(i * 9.3) * Math.PI;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 34, y + Math.sin(a) * 34);
          ctx.moveTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); ctx.lineTo(x + Math.cos(a + 0.7) * 26, y + Math.sin(a + 0.7) * 26); ctx.stroke();
        }
        ctx.restore();
        neonPath(ctx, NEON.ice, 2, k, () => roundRect(ctx, r.x, r.y, r.w, r.h, 8));
      } else if (o.type === 'water') {
        const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
        g.addColorStop(0, 'rgba(30,90,255,0.32)'); g.addColorStop(1, 'rgba(10,40,160,0.42)');
        ctx.fillStyle = g; roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.fill();
        neonPath(ctx, NEON.water, 3, k, () => roundRect(ctx, r.x, r.y, r.w, r.h, 12));
      } else if (o.type === 'boost') {
        ctx.fillStyle = 'rgba(255,230,0,0.10)'; roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill();
        neonPath(ctx, NEON.boost, 2, k, () => roundRect(ctx, r.x, r.y, r.w, r.h, 6));
      }
    }
    // Abschlag
    if (map.start) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.arc(map.start.x, map.start.y, 22, 0, 7); ctx.fill();
    }
    // Feste Objekte (vom Ultimate gefressene nicht mehr)
    for (let oi = 0; oi < objs.length; oi++) {
      const o = objs[oi];
      if (broken && broken[oi]) continue;
      if (o.type === 'block') {
        const r = rectN(o);
        ctx.fillStyle = '#0e0d2b'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
        ctx.strokeStyle = 'rgba(138,92,255,0.16)'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let d = -r.h; d < r.w; d += 14) { ctx.moveTo(r.x + d, r.y + r.h); ctx.lineTo(r.x + d + r.h, r.y); }
        ctx.stroke(); ctx.restore();
        neonPath(ctx, NEON.block, 3, k, () => { ctx.beginPath(); ctx.rect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3); });
      } else if (o.type === 'wall') {
        neonPath(ctx, NEON.wall, o.t || 14, k, () => { ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); });
      } else if (o.type === 'bumper') {
        const r = o.r || 24;
        ctx.fillStyle = 'rgba(255,46,136,0.10)'; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 7); ctx.fill();
        neonPath(ctx, NEON.bumper, 4, k, () => { ctx.beginPath(); ctx.arc(o.x, o.y, r - 2, 0, 7); });
        neonPath(ctx, NEON.bumper, 2, k, () => { ctx.beginPath(); ctx.arc(o.x, o.y, r * 0.5, 0, 7); });
      }
    }
    // Außenrand
    neonPath(ctx, NEON.border, 5, k, () => { ctx.beginPath(); ctx.rect(-3, -3, W + 6, H + 6); });
    ctx.restore();
  }

  // ------------------------------------------------------------ animierte Ebene
  function arrowField(ctx, r, angle, spacing, phase, color, chevron, lw) {
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    const a = angle * Math.PI / 180;
    const R = Math.hypot(r.w, r.h) / 2 + spacing;
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(a);
    ctx.strokeStyle = color; ctx.lineWidth = lw || (chevron ? 4 : 2.5); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const off = ((phase % spacing) + spacing) % spacing;
    ctx.beginPath();
    for (let x = -R + off; x < R; x += spacing) {
      for (let y = -R; y < R; y += spacing) {
        if (chevron) { ctx.moveTo(x - 7, y - 10); ctx.lineTo(x + 5, y); ctx.lineTo(x - 7, y + 10); }
        else { ctx.moveTo(x - 9, y); ctx.lineTo(x + 7, y); ctx.moveTo(x + 2, y - 5); ctx.lineTo(x + 8, y); ctx.lineTo(x + 2, y + 5); }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawDynamic(ctx, map, t, fx, broken) {
    const objs = map.objects || [];
    // Glaswände (zerbrochene nicht mehr)
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.type !== 'glass' || (broken && broken[i])) continue;
      const w = o.t || 8, dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1;
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(180,230,255,0.22)'; ctx.lineWidth = w + 6; glow(ctx, '#bfefff', 14);
      ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke(); noGlow(ctx);
      ctx.strokeStyle = 'rgba(220,250,255,0.8)'; ctx.lineWidth = 1.5;
      const nx = -dy / L * w / 2, ny = dx / L * w / 2;
      ctx.beginPath(); ctx.moveTo(o.x1 + nx, o.y1 + ny); ctx.lineTo(o.x2 + nx, o.y2 + ny); ctx.moveTo(o.x1 - nx, o.y1 - ny); ctx.lineTo(o.x2 - nx, o.y2 - ny); ctx.stroke();
      // wandernder Glanz
      const g = ((t * 0.35 + i * 0.37) % 1.6) - 0.3;
      if (g > 0 && g < 1) {
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = w * 0.6;
        const a = Math.max(0, g - 0.08), b = Math.min(1, g + 0.08);
        ctx.beginPath(); ctx.moveTo(o.x1 + dx * a, o.y1 + dy * a); ctx.lineTo(o.x1 + dx * b, o.y1 + dy * b); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.type === 'slope') arrowField(ctx, rectN(o), o.angle || 0, 36, t * 22, 'rgba(57,255,138,0.22)', false);
      else if (o.type === 'boost') {
        const r = rectN(o);
        const pulse = 0.55 + 0.45 * Math.sin(t * 10 + i);
        arrowField(ctx, r, o.angle || 0, 24, t * 90, `rgba(255,230,0,${0.35 + 0.4 * pulse})`, true);
        ctx.fillStyle = `rgba(255,230,0,${0.05 * pulse})`; ctx.fillRect(r.x, r.y, r.w, r.h);
      } else if (o.type === 'water') {
        const r = rectN(o);
        ctx.save(); roundRect(ctx, r.x, r.y, r.w, r.h, 12); ctx.clip();
        ctx.strokeStyle = 'rgba(110,170,255,0.30)'; ctx.lineWidth = 2;
        for (let y = r.y + 12; y < r.y + r.h; y += 20) {
          ctx.beginPath();
          for (let x = r.x; x <= r.x + r.w + 8; x += 10) ctx.lineTo(x, y + Math.sin(x * 0.05 + t * 2.4 + y * 0.3) * 3.5);
          ctx.stroke();
        }
        ctx.restore();
      } else if (o.type === 'ice') {
        const r = rectN(o);
        for (let j = 0; j < 6; j++) {
          const ph = (t * 0.6 + hash(j + i * 13)) % 1;
          const a = Math.sin(ph * Math.PI);
          const x = r.x + hash(j * 7.7 + i + Math.floor(t * 0.6 + hash(j + i * 13))) * r.w, y = r.y + hash(j * 3.3 + i * 5 + Math.floor(t * 0.6 + hash(j + i * 13))) * r.h;
          ctx.strokeStyle = `rgba(220,255,255,${0.7 * a})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x - 6 * a, y); ctx.lineTo(x + 6 * a, y); ctx.moveTo(x, y - 6 * a); ctx.lineTo(x, y + 6 * a); ctx.stroke();
        }
      } else if (o.type === 'band') {
        if (broken && broken[i]) continue;
        // Gummiband: schwingt nach einem Treffer
        const fl = fx ? fx.flashOf(i) : 0;
        const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        const amp = fl * Math.min(26, L * 0.12) * Math.sin(t * 55);
        const cx = (o.x1 + o.x2) / 2 + nx * amp * 2, cy = (o.y1 + o.y2) / 2 + ny * amp * 2;
        const w = o.t || 10;
        const path = () => { ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.quadraticCurveTo(cx, cy, o.x2, o.y2); };
        ctx.save(); ctx.globalCompositeOperation = 'source-over';
        neonPath(ctx, NEON.band, w * 0.75, 1, path);
        ctx.setLineDash([3, 7]); ctx.lineDashOffset = -t * 20; ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.lineWidth = 1.5;
        path(); ctx.stroke(); ctx.setLineDash([]);
        for (const [px, py] of [[o.x1, o.y1], [o.x2, o.y2]]) { // Pfosten
          ctx.fillStyle = '#1a0d04'; ctx.beginPath(); ctx.arc(px, py, w * 0.7 + 3, 0, 7); ctx.fill();
          ctx.strokeStyle = NEON.band; ctx.lineWidth = 2.5; glow(ctx, NEON.band, 10); ctx.stroke(); noGlow(ctx);
        }
        ctx.restore();
      } else if (o.type === 'bumper') {
        if (broken && broken[i]) continue;
        const fl = fx ? fx.flashOf(i) : 0;
        const r = (o.r || 24) * (1 + fl * 0.18);
        const breathe = 0.5 + 0.5 * Math.sin(t * 3 + i);
        ctx.strokeStyle = `rgba(255,46,136,${0.12 + 0.12 * breathe + fl * 0.6})`; ctx.lineWidth = 6 + fl * 8;
        ctx.beginPath(); ctx.arc(o.x, o.y, r + 4, 0, 7); ctx.stroke();
        if (fl > 0) {
          ctx.fillStyle = `rgba(255,200,230,${fl * 0.85})`; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 7); ctx.fill();
        }
      }
    }
    // Abschlag – rotierender Ring
    if (map.start) {
      ctx.save(); ctx.translate(map.start.x, map.start.y); ctx.rotate(t * 0.8);
      ctx.strokeStyle = 'rgba(0,234,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    if (map.hole) drawHole(ctx, map.hole, t);
  }

  function drawHole(ctx, h, t) {
    const R = P.HOLE_R, BH = P.config.blackHole, F = BH.radius > 0 && BH.strength > 0 ? BH.radius : R * 4;
    const k = pxScale(ctx);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Wirkungsbereich: schwacher violetter Schleier (vorgerendert) + pulsierende Ringe, die nach innen laufen
    blit(ctx, sprite('bh-halo' + F, F * 2, k, (x) => {
      const g = x.createRadialGradient(0, 0, R, 0, 0, F);
      g.addColorStop(0, 'rgba(150,70,255,0.30)'); g.addColorStop(0.35, 'rgba(90,30,200,0.12)'); g.addColorStop(1, 'rgba(60,20,160,0)');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, F, 0, 7); x.fill();
    }), h.x, h.y, F * 2);
    for (let i = 0; i < 4; i++) {
      const f = 1 - ((t * 0.35 + i / 4) % 1), rr = R + (F - R) * f * f;
      ctx.strokeStyle = `rgba(180,120,255,${0.22 * (1 - f)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(h.x, h.y, rr, 0, 7); ctx.stroke();
    }
    // Akkretionsscheibe: Spiralarme einmal zeichnen, dann nur noch drehen
    const arms = 5, dr = Math.min(F * 0.55, R * 7), AS = (R + dr) * 2 + 8;
    blit(ctx, sprite('bh-arms' + R + '-' + dr, AS, k, (x) => {
      x.lineCap = 'round'; x.lineWidth = 2; x.globalCompositeOperation = 'lighter';
      for (let a0 = 0; a0 < arms; a0++) {
        const base = a0 * (Math.PI * 2 / arms);
        x.strokeStyle = a0 % 2 ? 'rgba(255,90,210,0.5)' : 'rgba(0,234,255,0.45)';
        x.beginPath();
        for (let j = 0; j <= 24; j++) {
          const u = j / 24, rr = R + dr * u, a = base + u * 3.2;
          if (j) x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.92); else x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.92);
        }
        x.stroke();
      }
    }), h.x, h.y, AS, -t * 1.8);
    // Photonenring + rotierende Glutbögen (Leuchten im Sprite eingebacken)
    const RS = (R + 40) * 2;
    blit(ctx, sprite('bh-ring' + R, RS, k, (x, sc) => {
      x.shadowColor = '#ffb3ff'; x.shadowBlur = 22 * sc;
      x.strokeStyle = 'rgba(255,220,255,0.95)'; x.lineWidth = 2.2; x.beginPath(); x.arc(0, 0, R + 3, 0, 7); x.stroke();
    }), h.x, h.y, RS * (1 + Math.sin(t * 6) * 0.004));
    blit(ctx, sprite('bh-arcs' + R, RS, k, (x, sc) => {
      x.shadowColor = '#ffb3ff'; x.shadowBlur = 22 * sc;
      x.strokeStyle = 'rgba(255,150,60,0.6)'; x.lineWidth = 4;
      x.beginPath(); x.arc(0, 0, R + 7, 0, 2.2); x.stroke();
      x.beginPath(); x.arc(0, 0, R + 7, Math.PI, Math.PI + 2.2); x.stroke();
    }), h.x, h.y, RS, t * 2.2);
    // Ereignishorizont: absolut schwarz
    ctx.globalCompositeOperation = 'source-over';
    blit(ctx, sprite('bh-core' + R, (R + 2) * 2, k, (x) => {
      const hg = x.createRadialGradient(0, 0, 0, 0, 0, R + 2);
      hg.addColorStop(0, '#000'); hg.addColorStop(0.85, '#000'); hg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = hg; x.beginPath(); x.arc(0, 0, R + 2, 0, 7); x.fill();
    }), h.x, h.y, (R + 2) * 2);
    ctx.restore();
  }

  /** Map zeichnen. opts: { view, cache, fx } */
  let cache = null;
  function drawMap(ctx, map, t, opts) {
    opts = opts || {};
    const v = opts.view;
    if (v && opts.cache) {
      const c = v.canvas;
      const bk = opts.glass ? Object.keys(opts.glass).join(',') : '';
      if (!cache || cache.map !== map || cache.w !== c.width || cache.h !== c.height || cache.scale !== v.scale || cache.bk !== bk) {
        const oc = document.createElement('canvas'); oc.width = c.width; oc.height = c.height;
        const octx = oc.getContext('2d');
        octx.setTransform(v.scale, 0, 0, v.scale, v.ox, v.oy);
        PERF.baking = true; try { drawStatic(octx, map, v.scale, opts.glass); } finally { PERF.baking = false; }
        cache = { map, w: c.width, h: c.height, scale: v.scale, c: oc, bk };
      }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, v.sx, v.sy); ctx.drawImage(cache.c, 0, 0); ctx.restore();
    } else drawStatic(ctx, map, v ? v.scale : 1, opts.glass);
    drawDynamic(ctx, map, t, opts.fx, opts.glass);
  }

  // ------------------------------------------------------------ Bälle & Schweife
  /** me = eigener Ball: deutlich hervorgehoben (Halo, pulsierender Ring, „DU“-Markierung) */
  function drawBall(ctx, x, y, color, label, alpha, img, rot, scale, me) {
    const hasImg = img && img.complete && img.naturalWidth > 0;
    const r = P.BALL_R * (hasImg ? 2.2 : 1) * (scale || 1);
    const tt = performance.now() / 1000;
    if (me) { // eigener Ball: großer Lichthof, zwei Ringe, Pfeil mit „DU“
      ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.globalCompositeOperation = 'lighter';
      const h = ctx.createRadialGradient(x, y, r, x, y, r * 7);
      h.addColorStop(0, color); h.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha *= 0.35; ctx.fillStyle = h; ctx.beginPath(); ctx.arc(x, y, r * 7, 0, 7); ctx.fill();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      const pr = r + 7 + (Math.sin(tt * 5) + 1) * 3;
      ctx.strokeStyle = color; ctx.lineWidth = 3; glow(ctx, color, 18);
      ctx.beginPath(); ctx.arc(x, y, pr, 0, 7); ctx.stroke();
      ctx.lineWidth = 2; ctx.setLineDash([5, 6]); ctx.lineDashOffset = -tt * 30;
      ctx.beginPath(); ctx.arc(x, y, pr + 8, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      // Pfeil + „DU“
      const ay = y - pr - 14 - Math.abs(Math.sin(tt * 4)) * 5;
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x, ay + 8); ctx.lineTo(x - 7, ay); ctx.lineTo(x + 7, ay); ctx.closePath(); ctx.fill();
      ctx.font = '900 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText('DU', x, ay - 4);
      ctx.fillStyle = '#fff'; ctx.fillText('DU', x, ay - 4);
      noGlow(ctx); ctx.restore();
    }
    if (scale > 1.01) { // gefräßiger Ultimate-Ball: pulsierender Schlund
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const tt = performance.now() / 1000;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i % 2 ? '#ff2e88' : '#ffe03a'; ctx.globalAlpha = 0.5 - i * 0.12; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, r + 6 + i * 6 + Math.sin(tt * 14 + i) * 2, tt * 6 + i, tt * 6 + i + 4.2); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 3.2);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha *= 0.55; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, 7); ctx.fill();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    if (hasImg) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip();
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2); // Kopf bleibt aufrecht
      ctx.restore();
    }
    ctx.strokeStyle = color; ctx.lineWidth = hasImg ? 2.5 : me ? 4 : 3.5; glow(ctx, color, me ? 20 : 14);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); noGlow(ctx);
    // dunkler Außenrand: Ball hebt sich auch vor hellen Effekten ab
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 2.2, 0, 7); ctx.stroke();
    if (label) {
      ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(label.toUpperCase(), x, y - r - 10);
      glow(ctx, color, 8); ctx.fillStyle = color; ctx.fillText(label.toUpperCase(), x, y - r - 10); noGlow(ctx);
    }
    ctx.restore();
  }

  /** Pucks: Farbe & Stil zeigen das Gewicht (grün leicht, gelb mittel, rot schwer) */
  /** fuses: { pucksIndex: Restsekunden } für scharfe Bomben (fehlt = volle Zeit, läuft noch nicht) */
  function drawPucks(ctx, pucks, t, fuses, dormant) {
    if (!pucks) return;
    // Felder zuerst (unter den Pucks)
    for (const q of pucks) {
      if (!q.alive || !q.f || q.pb != null) continue;
      const F = P.config.pucks[q.f], col = FIELD_COL[q.f], R = F.radius;
      ctx.save();
      // Schleier + gestrichelter Rand vorgerendert (normale Überblendung: auf großen Flächen viel billiger als 'lighter')
      blit(ctx, sprite('field2-' + q.f + R + '-' + q.r, R * 2 + 4, pxScale(ctx), (x) => {
        const g = x.createRadialGradient(0, 0, q.r, 0, 0, R);
        g.addColorStop(0, q.f === 'repel' ? 'rgba(255,154,60,0.16)' : 'rgba(195,107,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, R, 0, 7); x.fill();
        x.strokeStyle = col; x.lineWidth = 1.5; x.globalAlpha = 0.25; x.setLineDash([4, 8]); x.beginPath(); x.arc(0, 0, R, 0, 7); x.stroke();
      }), q.x, q.y, R * 2 + 4);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        let f = (t * 0.5 + i / 3) % 1; if (q.f === 'attract') f = 1 - f; // Gravitation: Ringe laufen nach innen, Abstoßung: nach außen
        ctx.globalAlpha = 0.45 * Math.sin(f * Math.PI);
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r + (R - q.r) * f, 0, 7); ctx.stroke();
      }
      ctx.restore();
    }
    for (let qi = 0; qi < pucks.length; qi++) {
      const q = pucks[qi];
      if (!q.alive || q.pb != null) continue;
      if (q.bomb) { drawBomb(ctx, q, t, fuses ? fuses[qi] : null, dormant && !q.armed); continue; }
      const col = PUCK_COL[q.c] || '#fff', r = q.r;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(q.x + 2, q.y + 3, r, 0, 7); ctx.fill();
      const g = ctx.createRadialGradient(q.x - r * 0.35, q.y - r * 0.35, 1, q.x, q.y, r);
      if (q.c === 'heavy') { g.addColorStop(0, '#5a2030'); g.addColorStop(1, '#1a0610'); }
      else if (q.c === 'medium') { g.addColorStop(0, '#3a3510'); g.addColorStop(1, '#141204'); }
      else { g.addColorStop(0, '#143a24'); g.addColorStop(1, '#06140c'); }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.fill();
      glow(ctx, col, q.c === 'heavy' ? 16 : 10);
      ctx.strokeStyle = col; ctx.lineWidth = q.c === 'heavy' ? 5 : q.c === 'medium' ? 3 : 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, r - ctx.lineWidth / 2, 0, 7); ctx.stroke();
      noGlow(ctx);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
      if (q.c === 'heavy') {
        // Gewichts-Kreuz + Nieten
        ctx.beginPath(); ctx.moveTo(q.x - r * 0.4, q.y - r * 0.4); ctx.lineTo(q.x + r * 0.4, q.y + r * 0.4);
        ctx.moveTo(q.x + r * 0.4, q.y - r * 0.4); ctx.lineTo(q.x - r * 0.4, q.y + r * 0.4); ctx.stroke();
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.arc(q.x + Math.cos(a) * r * 0.62, q.y + Math.sin(a) * r * 0.62, 1.6, 0, 7); ctx.fill(); }
      } else if (q.c === 'medium') {
        ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.45, 0, 7); ctx.stroke();
      } else {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4 + q.x);
        ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.25, 0, 7); ctx.fill();
      }
      if (q.f) { // Feld-Symbol: rotierende Bögen (Gravitation) bzw. Striche nach außen (Abstoßung)
        const fc = FIELD_COL[q.f]; ctx.globalAlpha = 1; ctx.strokeStyle = fc; ctx.lineWidth = 2; glow(ctx, fc, 12);
        ctx.beginPath(); ctx.arc(q.x, q.y, r + 4, 0, 7); ctx.stroke();
        if (q.f === 'attract') {
          for (let k = 0; k < 3; k++) { const a = -t * 3 + k * 2.094; ctx.beginPath(); ctx.arc(q.x, q.y, r + 9, a, a + 1.2); ctx.stroke(); }
        } else {
          for (let k = 0; k < 4; k++) {
            const a = t * 0.8 + k * Math.PI / 2, d0 = r + 7 + ((t * 18) % 6), d1 = d0 + 7;
            ctx.beginPath(); ctx.moveTo(q.x + Math.cos(a) * d0, q.y + Math.sin(a) * d0); ctx.lineTo(q.x + Math.cos(a) * d1, q.y + Math.sin(a) * d1); ctx.stroke();
          }
        }
        noGlow(ctx);
      }
      ctx.restore();
    }
    // Eis (eingefroren, Restzüge) und Schleim (klebt am Ball) darüber
    for (const q of pucks) {
      if (!q.alive || q.pb != null || (!q.fz && !q.st)) continue;
      ctx.save();
      if (q.fz) {
        const R = q.r + 5;
        ctx.fillStyle = 'rgba(170,235,255,0.38)'; ctx.strokeStyle = '#bff4ff'; ctx.lineWidth = 2; glow(ctx, '#8fe8ff', 12);
        ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.2, d = R * (k % 2 ? 0.86 : 1.08); if (k) ctx.lineTo(q.x + Math.cos(a) * d, q.y + Math.sin(a) * d); else ctx.moveTo(q.x + Math.cos(a) * d, q.y + Math.sin(a) * d); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); noGlow(ctx);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(q.x - R * 0.5, q.y - R * 0.2); ctx.lineTo(q.x - R * 0.1, q.y + R * 0.1); ctx.lineTo(q.x + R * 0.4, q.y - R * 0.35); ctx.stroke();
        const n = Math.max(1, q.fz - 1); // so viele Züge bleibt er noch eingefroren
        ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e8fbff';
        ctx.fillText('❄' + n, q.x, q.y - R - 8);
      } else {
        const R = q.r + 4, w = Math.sin(t * 9 + q.x * 0.1) * 1.5;
        ctx.fillStyle = 'rgba(120,255,80,0.35)'; ctx.strokeStyle = '#8dff4a'; ctx.lineWidth = 2; glow(ctx, '#7dff3a', 10);
        ctx.beginPath(); ctx.ellipse(q.x, q.y, R + w, R - w, t * 2, 0, 7); ctx.fill(); ctx.stroke(); noGlow(ctx);
      }
      ctx.restore();
    }
  }

  /** Bomben-Puck: schwarze Kugel mit Zündschnur; scharf = Countdown-Ring + Sekunden */
  function drawBomb(ctx, q, t, left, dormant) {
    const r = q.r, F = P.config.pucks.bombs.fuse;
    const armed = !!q.armed, sec = armed ? (left == null ? F : left) : null;
    const urgent = armed && sec < 2;
    const blink = armed ? (Math.sin(t * (urgent ? 30 : 10)) > 0) : false;
    ctx.save();
    if (armed) { // Explosionsradius andeuten
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,60,40,${urgent ? 0.5 : 0.22})`; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -t * 40; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, P.bombCfg(q).blastRadius, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(q.x + 2, q.y + 3, r, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(q.x - r * 0.4, q.y - r * 0.4, 1, q.x, q.y, r);
    g.addColorStop(0, blink ? '#ff6040' : '#4a4a5a'); g.addColorStop(1, '#0a0a10');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.fill();
    glow(ctx, armed ? '#ff3a2a' : '#ff9a3c', armed ? 18 : 8);
    ctx.strokeStyle = armed ? '#ff3a2a' : '#ff9a3c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, r - 1, 0, 7); ctx.stroke();
    noGlow(ctx);
    // Zündschnur mit Funken
    const fx0 = q.x + r * 0.55, fy0 = q.y - r * 0.75;
    ctx.strokeStyle = '#d8c39a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx0, fy0); ctx.quadraticCurveTo(fx0 + 6, fy0 - 8, fx0 + 3, fy0 - 12); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const sp = armed ? 4 + Math.random() * 3 : 2 + Math.sin(t * 8) * 0.8;
    ctx.fillStyle = armed ? '#ffd23a' : 'rgba(255,170,60,0.8)'; ctx.beginPath(); ctx.arc(fx0 + 3, fy0 - 12, sp, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (dormant) { // erster Schlag: Bombe wird noch nicht scharf
      ctx.font = '700 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(200,200,220,0.75)'; ctx.fillText(`🔒 ab ${P.config.pucks.bombs.armFromShot}. Schlag`, q.x, q.y + r + 12);
    }
    // Countdown
    if (armed) {
      const fr = Math.max(0, Math.min(1, sec / F));
      ctx.strokeStyle = urgent ? '#ff3a2a' : '#ffd23a'; ctx.lineWidth = 3.5; glow(ctx, ctx.strokeStyle, 10);
      ctx.beginPath(); ctx.arc(q.x, q.y, r + 7, -Math.PI / 2, -Math.PI / 2 + fr * Math.PI * 2); ctx.stroke(); noGlow(ctx);
      ctx.font = `900 ${urgent ? 18 : 15}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = left == null ? `${Math.ceil(F)}` : `${Math.ceil(sec)}`;
      ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(label, q.x, q.y - r - 18);
      ctx.fillStyle = urgent ? '#ff3a2a' : '#ffffff'; glow(ctx, '#ff3a2a', 10); ctx.fillText(label, q.x, q.y - r - 18); noGlow(ctx);
      if (left == null) { ctx.font = '700 9px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,220,150,0.85)'; ctx.fillText('nach dem Zug', q.x, q.y + r + 12); }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ Gadgets
  const GADGET_COL = { sling: '#00eaff', ghost: '#e8e4ff', ice: '#8fe8ff', bomb: '#ff6a1a', slime: '#7dff3a' };
  const GADGET_ICON = { sling: '🌀', ghost: '👻', ice: '❄️', bomb: '💣', slime: '🟢' };
  const GADGET_LABEL = { sling: 'SLING', ghost: 'GHOST', ice: 'EIS', bomb: 'BOMBE', slime: 'SCHLEIM' };
  const GADGET_NAME = {
    sling: 'Sling (nächster Schlag lenkbar)', ghost: 'Ghost (nächster Schlag durch Pucks, immun gegen Effekte)',
    ice: 'Eis (nächster Schlag friert berührte Pucks 2 Züge ein, langsamer, schmilzt nach ein paar Sekunden)',
    bomb: 'Bombe (sprengt zu Beginn des nächsten Zugs dich und alle anderen Bälle weg, dazu 5 neue Bomben)',
    slime: 'Schleim (nächster Schlag: berührte Pucks kleben am Ball und bremsen ihn)',
  };
  const gIcon = (g) => GADGET_ICON[g] || '?';
  /** Gadgets zeichnen; hl: Set mit IDs, die die Vorschau einsammeln würde */
  function drawGadgets(ctx, list, t, hl) {
    if (!list) return;
    const R = P.config.gadgets.radius;
    for (const g of list) {
      if (g.taken) continue;
      const c = GADGET_COL[g.type] || '#fff', bob = Math.sin(t * 3 + g.id) * 3, x = g.x, y = g.y + bob;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      // Lichtkegel + rotierender Ring
      const gr = ctx.createRadialGradient(x, y, 2, x, y, R * 2.4);
      gr.addColorStop(0, c + '59'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, R * 2.4, 0, 7); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 2.5; glow(ctx, c, 16);
      ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.arc(x, y, R + 4, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      if (hl && hl.has(g.id)) { ctx.lineWidth = 4; ctx.globalAlpha = 0.6 + Math.sin(t * 12) * 0.4; ctx.beginPath(); ctx.arc(x, y, R + 12, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
      noGlow(ctx);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(10,8,30,0.85)'; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
      ctx.font = `${Math.round(R * 1.2)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (g.type === 'ghost') { ctx.globalAlpha = 0.7 + Math.sin(t * 5 + g.id) * 0.3; ctx.fillText('👻', x, y + 1); }
      else if (g.type === 'sling') { ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2); ctx.fillText('🌀', 0, 1); ctx.restore(); }
      else { ctx.save(); ctx.translate(x, y); const sc = 1 + Math.sin(t * 6 + g.id) * 0.08; ctx.scale(sc, sc); ctx.fillText(gIcon(g.type), 0, 1); ctx.restore(); }
      ctx.globalAlpha = 1;
      ctx.font = '800 9px system-ui, sans-serif'; ctx.fillStyle = c; glow(ctx, c, 8);
      ctx.fillText(GADGET_LABEL[g.type] || '', x, y + R + 12); noGlow(ctx);
      ctx.restore();
    }
  }

  /** Leuchtschweif (Kurve) – pts: [x,y,...]; head = Anteil der letzten Punkte, die hell leuchten */
  function drawTrail(ctx, pts, color, alpha) {
    if (!pts || pts.length < 4) return;
    alpha = alpha == null ? 1 : alpha;
    const n = pts.length / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // langer, schwacher Gesamtpfad
    ctx.strokeStyle = color; ctx.globalAlpha = 0.18 * alpha; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
    ctx.stroke();
    ctx.globalAlpha = 0.45 * alpha; ctx.lineWidth = 2.5; ctx.stroke();
    // heller Kopf
    const head = Math.min(n, 90), s0 = n - head;
    const CH = 10;
    for (let s = s0; s < n - 1; s += CH) {
      const e = Math.min(n - 1, s + CH);
      const f = (s - s0) / head;
      ctx.globalAlpha = alpha * f;
      ctx.lineWidth = 2 + f * 9;
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(pts[s * 2], pts[s * 2 + 1]);
      for (let i = s + 1; i <= e; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
      ctx.stroke();
      ctx.globalAlpha = alpha * f * 0.9; ctx.lineWidth = 1 + f * 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Vorhergesagte Flugbahn. Sichtbar ist nur der Anteil opts.portion (0–1) der Strecke;
   * die Linie wird bis zum sichtbaren Ende dünner/blasser (Mindestdicke preview.minWidth).
   * Endmarkierungen (Loch/Wasser/Ruhepunkt) gibt es nur bei voller Vorschau.
   */
  function drawPrediction(ctx, pred, color, opts) {
    if (!pred || !pred.points || pred.points.length < 4) return;
    opts = opts || {};
    const cfg = P.config.preview;
    // nur der eigene Ball, und (Standard) nur bis zur ersten Kollision
    if (!cfg.pucks || cfg.untilFirstHit) {
      const cut = { ...pred };
      if (!cfg.pucks) cut.ppaths = null;
      if (cfg.untilFirstHit && pred.bounces && pred.bounces.length >= 2) {
        const bx = pred.bounces[0], by = pred.bounces[1], p0 = pred.points;
        for (let i = 2; i < p0.length; i += 2) {
          if (p0[i] === bx && p0[i + 1] === by) { cut.points = p0.slice(0, i + 2); cut.bounces = []; cut.result = 'hit'; break; }
        }
      }
      pred = cut;
    }
    const portion = clamp(opts.portion == null ? 1 : opts.portion, 0, 1);
    if (portion <= 0) return;
    const full = portion >= 0.999;
    const pts = pred.points, n = pts.length / 2, t = opts.t || 0;
    const ghost = !!opts.ghost;
    const w0 = ghost ? cfg.width * 0.6 : cfg.width;
    const wMin = Math.min(w0, cfg.minWidth);
    const a0 = ghost ? 0.45 : 1;

    // Streckenlängen + Abpraller entlang der Bahn
    const cum = new Float64Array(n);
    const bounceAt = [];
    let bi = 0;
    const B = pred.bounces || [];
    for (let i = 1; i < n; i++) {
      cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
      if (bi < B.length && pts[i * 2] === B[bi] && pts[i * 2 + 1] === B[bi + 1]) { bounceAt.push(cum[i]); bi += 2; }
    }
    const L = cum[n - 1];
    const V = full ? L : L * portion;          // sichtbare Länge
    const fr = Math.max(1, full ? cfg.fadeLength : Math.min(cfg.fadeLength, V)); // bis hierhin dünner/blasser werden
    const fAt = (d) => Math.min(1, d / fr);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const CH = 6; // Punkte pro Teilstück
    for (let s = 0; s < n - 1 && cum[s] < V; s += CH) {
      const e = Math.min(n - 1, s + CH);
      const f = fAt(cum[s]);
      const w = wMin + (w0 - wMin) * (1 - f);
      const al = a0 * (1 - cfg.fade * f);
      ctx.beginPath(); ctx.moveTo(pts[s * 2], pts[s * 2 + 1]);
      for (let i = s + 1; i <= e; i++) {
        if (cum[i] > V) { // letztes Stück anteilig
          const k = (V - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
          ctx.lineTo(pts[i * 2 - 2] + (pts[i * 2] - pts[i * 2 - 2]) * k, pts[i * 2 - 1] + (pts[i * 2 + 1] - pts[i * 2 - 1]) * k);
          break;
        }
        ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
      }
      ctx.strokeStyle = color; ctx.globalAlpha = al * 0.18; ctx.lineWidth = w * 3; ctx.stroke();
      ctx.globalAlpha = al * 0.95; ctx.lineWidth = w; ctx.stroke();
      ctx.globalAlpha = al * 0.6; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.5, w * 0.35); ctx.stroke();
    }
    // Lauflicht, das die Richtung zeigt
    ctx.fillStyle = '#fff';
    const step = 14, ph = Math.floor(t * 40) % step;
    for (let i = 1; i < n && cum[i] < V; i++) {
      if ((i + step - ph) % step !== 0) continue;
      const f = fAt(cum[i]);
      ctx.globalAlpha = a0 * 0.8 * (1 - cfg.fade * f);
      ctx.beginPath(); ctx.arc(pts[i * 2], pts[i * 2 + 1], Math.max(wMin * 0.6, (wMin + (w0 - wMin) * (1 - f)) * 0.55), 0, 7); ctx.fill();
    }
    // Abpraller (nur im sichtbaren Teil)
    for (let k = 0; k < bounceAt.length; k++) {
      if (bounceAt[k] > V) break;
      const x = B[k * 2], y = B[k * 2 + 1], sz = 4 + Math.sin(t * 8 + k) * 1;
      ctx.globalAlpha = (ghost ? 0.5 : 1) * (1 - cfg.fade * fAt(bounceAt[k]));
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz); ctx.lineTo(x - sz, y); ctx.fill();
    }
    // vorhergesagte Puck-Bahnen (gleicher Anteil ihrer eigenen Länge)
    if (pred.ppaths && pred.pucks) {
      ctx.setLineDash([3, 5]);
      for (let i = 0; i < pred.ppaths.length; i++) {
        const pp = pred.ppaths[i], q = pred.pucks[i];
        if (!q || pp.length < 6) continue;
        let pl = 0;
        for (let k = 2; k < pp.length; k += 2) pl += Math.hypot(pp[k] - pp[k - 2], pp[k + 1] - pp[k - 1]);
        const pv = full ? pl : pl * portion;
        const col = PUCK_COL[q.c] || '#fff';
        ctx.globalAlpha = ghost ? 0.16 : 0.65; ctx.strokeStyle = col; ctx.lineWidth = ghost ? 1.1 : 1.6;
        ctx.beginPath(); ctx.moveTo(pp[0], pp[1]);
        let d = 0;
        for (let k = 2; k < pp.length; k += 2) {
          const sl = Math.hypot(pp[k] - pp[k - 2], pp[k + 1] - pp[k - 1]);
          if (d + sl > pv) { const r = (pv - d) / Math.max(1e-9, sl); ctx.lineTo(pp[k - 2] + (pp[k] - pp[k - 2]) * r, pp[k - 1] + (pp[k + 1] - pp[k - 1]) * r); break; }
          d += sl; ctx.lineTo(pp[k], pp[k + 1]);
        }
        ctx.stroke();
        if (full) {
          const qx = pp[pp.length - 2], qy = pp[pp.length - 1];
          if (q.alive) { ctx.beginPath(); ctx.arc(qx, qy, q.r, 0, 7); ctx.stroke(); }
          else { ctx.beginPath(); ctx.moveTo(qx - 6, qy - 6); ctx.lineTo(qx + 6, qy + 6); ctx.moveTo(qx + 6, qy - 6); ctx.lineTo(qx - 6, qy + 6); ctx.stroke(); }
        }
      }
      ctx.setLineDash([]);
    }
    if (full) {
      const ex = pts[pts.length - 2], ey = pts[pts.length - 1];
      ctx.globalAlpha = ghost ? 0.6 : 1;
      if (pred.result === 'sunk') {
        ctx.strokeStyle = '#7CFF9C'; ctx.lineWidth = 3; glow(ctx, '#7CFF9C', 16);
        ctx.beginPath(); ctx.arc(ex, ey, P.HOLE_R + 8 + Math.sin(t * 8) * 3, 0, 7); ctx.stroke();
      } else if (pred.result === 'water') {
        ctx.strokeStyle = '#ff3860'; ctx.lineWidth = 3; glow(ctx, '#ff3860', 14);
        ctx.beginPath(); ctx.moveTo(ex - 8, ey - 8); ctx.lineTo(ex + 8, ey + 8); ctx.moveTo(ex + 8, ey - 8); ctx.lineTo(ex - 8, ey + 8); ctx.stroke();
      } else if (pred.result === 'hit') {
        // erste Kollision: Aufprall-Stern
        const s1 = 9 + Math.sin(t * 10) * 1.5;
        ctx.globalAlpha = ghost ? 0.55 : 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; glow(ctx, color, 14);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 4 + Math.PI / 8;
          ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * 3, ey + Math.sin(a) * 3); ctx.lineTo(ex + Math.cos(a) * s1, ey + Math.sin(a) * s1);
          ctx.moveTo(ex - Math.cos(a) * 3, ey - Math.sin(a) * 3); ctx.lineTo(ex - Math.cos(a) * s1, ey - Math.sin(a) * s1); ctx.stroke();
        }
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ex, ey, P.BALL_R * 0.7, 0, 7); ctx.fill();
        noGlow(ctx);
      } else if (pred.result === 'rest') {
        // Endposition: deutliches Abbild des eigenen Balls mit Fadenkreuz und pulsierendem Ring
        const R = P.BALL_R, pr = R + 9 + Math.sin(t * 6) * 2.5;
        ctx.globalAlpha = ghost ? 0.5 : 0.9;
        ctx.fillStyle = color; glow(ctx, color, 22);
        ctx.beginPath(); ctx.arc(ex, ey, R, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(ex, ey, R * 0.45, 0, 7); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(ex, ey, pr, 0, 7); ctx.stroke();
        ctx.lineWidth = 2.5;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          ctx.beginPath(); ctx.moveTo(ex + dx * (pr + 3), ey + dy * (pr + 3)); ctx.lineTo(ex + dx * (pr + 11), ey + dy * (pr + 11)); ctx.stroke();
        }
        noGlow(ctx);
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ Partikel & Effekte
  class FX {
    constructor() { this.parts = []; this.rings = []; this.texts = []; this.flashes = new Map(); this.shakeAmt = 0; this.screenFlash = 0; this.flashColor = '255,255,255'; this.amb = 0; }
    spark(x, y, color, n, speed, opts) {
      opts = opts || {};
      for (let i = 0; i < n && this.parts.length < PERF.maxParts; i++) {
        const a = opts.angle != null ? opts.angle + (Math.random() - 0.5) * (opts.spread || 1) : Math.random() * Math.PI * 2;
        const s = speed * (0.25 + Math.random() * 0.85);
        this.parts.push({ x, y, vx: Math.cos(a) * s + (opts.vx || 0), vy: Math.sin(a) * s + (opts.vy || 0), t: 0, life: (opts.life || 0.6) * (0.5 + Math.random() * 0.8), color, size: opts.size || (1.5 + Math.random() * 2), drag: opts.drag == null ? 3 : opts.drag, kind: opts.kind || 'streak', pull: opts.pull || null });
      }
    }
    ring(x, y, color, r, dur, width) { this.rings.push({ x, y, color, r: r || 40, dur: dur || 0.5, t: 0, w: width || 3 }); }
    text(x, y, str, color, size) { this.texts.push({ x, y, str, color, size: size || 28, t: 0, life: 1.8 }); }
    flash(idx) { this.flashes.set(idx, 1); }
    flashOf(idx) { return this.flashes.get(idx) || 0; }
    shake(a) { this.shakeAmt = Math.min(18, Math.max(this.shakeAmt, a)); }
    screen(alpha, rgb) { this.screenFlash = Math.max(this.screenFlash, alpha); this.flashColor = rgb || '255,255,255'; }
    /** Hintergrund-Emitter: schwarzes Loch saugt Sternenstaub ein, Boost-Funken */
    ambient(map, dt) {
      const h = map.hole, BH = P.config.blackHole;
      this.hole = h && BH.radius > 0 && BH.strength > 0 ? { x: h.x, y: h.y, R: BH.radius } : null;
      this.amb += dt;
      if (this.amb < 1 / 60) return;
      this.amb = 0;
      if (h && this.parts.length < PERF.maxParts * 0.8 && !(PERF.lowFx && Math.random() < 0.6)) {
        const F = this.hole ? this.hole.R : 50;
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2, d = F * (0.4 + Math.random() * 0.6);
          const sp = 40 + Math.random() * 60;
          this.parts.push({ x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d, vx: Math.cos(a + 1.75) * sp, vy: Math.sin(a + 1.75) * sp, t: 0, life: 2.2, color: ['#00eaff', '#c36bff', '#ff5edb', '#ffffff'][(Math.random() * 4) | 0], size: 1.4, drag: 0.6, kind: 'dot', pull: { x: h.x, y: h.y, k: 300 } });
        }
      }
      for (const o of map.objects || []) {
        if (o.type !== 'boost' || Math.random() > 0.35) continue;
        const r = rectN(o), a = (o.angle || 0) * Math.PI / 180;
        this.spark(r.x + Math.random() * r.w, r.y + Math.random() * r.h, '#ffe600', 1, 160, { angle: a, spread: 0.2, life: 0.4, drag: 0.5 });
      }
    }
    update(dt) {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i]; p.t += dt;
        if (p.t >= p.life) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
        if (p.pull) { const dx = p.pull.x - p.x, dy = p.pull.y - p.y, d = Math.hypot(dx, dy) || 1; p.vx += dx / d * p.pull.k * dt; p.vy += dy / d * p.pull.k * dt; if (d < 4) p.t = p.life; }
        else if (this.hole) { // alles wird vom schwarzen Loch angezogen
          const H = this.hole, dx = H.x - p.x, dy = H.y - p.y, d = Math.hypot(dx, dy) || 1;
          if (d < H.R) { const f = 1 - d / H.R, k = 900 * f * f; p.vx += dx / d * k * dt; p.vy += dy / d * k * dt; if (d < P.HOLE_R * 0.6) p.t = p.life; }
        }
        const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (let i = this.rings.length - 1; i >= 0; i--) { this.rings[i].t += dt; if (this.rings[i].t > this.rings[i].dur) this.rings.splice(i, 1); }
      for (let i = this.texts.length - 1; i >= 0; i--) { this.texts[i].t += dt; if (this.texts[i].t > this.texts[i].life) this.texts.splice(i, 1); }
      for (const [k, v] of this.flashes) { const nv = v - dt * 4; if (nv <= 0) this.flashes.delete(k); else this.flashes.set(k, nv); }
      this.shakeAmt *= Math.exp(-dt * 9); if (this.shakeAmt < 0.1) this.shakeAmt = 0;
      this.screenFlash = Math.max(0, this.screenFlash - dt * 2.5);
    }
    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const p of this.parts) {
        const f = 1 - p.t / p.life;
        ctx.globalAlpha = f;
        if (p.kind === 'streak') {
          ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
          ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.lineTo(p.x, p.y); ctx.stroke();
        } else {
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.kind === 'smoke' ? (1 + p.t * 6) : f + 0.3), 0, 7); ctx.fill();
        }
      }
      for (const r of this.rings) {
        if (r.t < 0) continue;
        const f = r.t / r.dur, e = 1 - Math.pow(1 - f, 3);
        ctx.globalAlpha = 1 - f; ctx.strokeStyle = r.color; ctx.lineWidth = r.w * (1 - f) + 0.5;
        ctx.beginPath(); ctx.arc(r.x, r.y, 4 + r.r * e, 0, 7); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const tx of this.texts) {
        const f = tx.t / tx.life, pop = tx.t < 0.15 ? 0.6 + tx.t / 0.15 * 0.6 : 1.2 - Math.min(0.2, (tx.t - 0.15) * 0.6);
        ctx.globalAlpha = f > 0.7 ? (1 - f) / 0.3 : 1;
        ctx.font = `900 ${tx.size * pop}px system-ui, sans-serif`; ctx.textAlign = 'center';
        glow(ctx, tx.color, 22); ctx.fillStyle = tx.color; ctx.fillText(tx.str, tx.x, tx.y - f * 40);
        noGlow(ctx); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(tx.str, tx.x, tx.y - f * 40);
      }
      ctx.restore();
    }
    drawScreen(ctx, w, h) {
      if (this.screenFlash <= 0) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(${this.flashColor},${this.screenFlash * 0.5})`; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
  }

  // ------------------------------------------------------------ Sound (WebAudio, synthetisch)
  class SFX {
    constructor() {
      this.ac = null; this.muted = localStorage.getItem('skillgolf.mute') === '1'; this.tens = null;
      const unlock = () => this.init();
      window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    }
    init() {
      if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain(); this.master.gain.value = this.muted ? 0 : 0.45;
      const comp = this.ac.createDynamicsCompressor(); this.master.connect(comp); comp.connect(this.ac.destination);
      const len = this.ac.sampleRate; this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    toggle() { this.muted = !this.muted; localStorage.setItem('skillgolf.mute', this.muted ? '1' : '0'); if (this.master) this.master.gain.value = this.muted ? 0 : 0.45; return this.muted; }
    ok() { return this.ac && !this.muted; }
    tone(f, dur, type, vol, f2, delay) {
      if (!this.ok()) return;
      const t = this.ac.currentTime + (delay || 0);
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    }
    noise(dur, vol, f1, f2, delay, type) {
      if (!this.ok()) return;
      const t = this.ac.currentTime + (delay || 0);
      const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf;
      const fl = this.ac.createBiquadFilter(); fl.type = type || 'lowpass'; fl.frequency.setValueAtTime(f1, t);
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const g = this.ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
    }
    hit(v) { const vol = clamp(v / 1800, 0.03, 0.4); this.tone(260 + Math.min(700, v * 0.4), 0.07, 'triangle', vol, 120); this.noise(0.05, vol * 0.6, 3000, 600); }
    ballHit(v) { const vol = clamp(v / 1500, 0.05, 0.4); this.tone(1400, 0.05, 'sine', vol, 900); this.tone(2100, 0.04, 'sine', vol * 0.5); }
    bumper() { this.tone(180, 0.22, 'square', 0.12, 900); this.tone(520, 0.16, 'sine', 0.22, 1500); this.noise(0.08, 0.15, 5000, 1000, 0, 'highpass'); }
    shoot(p) { this.noise(0.22, 0.12 + 0.3 * p, 600 + 4000 * p, 150); this.tone(140, 0.18, 'sine', 0.35 + 0.2 * p, 40); this.tone(500 + 600 * p, 0.12, 'sawtooth', 0.05, 1200 + 1500 * p); }
    boost() { this.tone(220, 0.35, 'sawtooth', 0.09, 1600); this.noise(0.3, 0.12, 800, 6000, 0, 'bandpass'); }
    splash() { this.noise(0.6, 0.35, 2400, 180); this.tone(300, 0.35, 'sine', 0.15, 70); this.tone(900, 0.08, 'sine', 0.1, 300, 0.05); }
    sink() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.18, null, i * 0.07)); this.tone(80, 0.4, 'sine', 0.3, 40); }
    ult() {
      this.tone(80, 1.2, 'sawtooth', 0.25, 30); this.tone(200, 0.8, 'square', 0.12, 1800);
      this.noise(1.0, 0.5, 6000, 100); this.tone(55, 1.4, 'sine', 0.5, 25);
      [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.06, f * 1.5, 0.05 + i * 0.06));
    }
    freeze() { this.tone(1800, 0.25, 'sine', 0.08, 2600); this.tone(2400, 0.2, 'triangle', 0.05, 3200, 0.05); }
    slime() { this.tone(180, 0.18, 'sine', 0.12, 90); }
    pickup(g) { if (g === 'ghost') { this.tone(600, 0.5, 'sine', 0.14, 1200); this.tone(900, 0.5, 'triangle', 0.08, 1500, 0.08); } else { this.tone(500, 0.12, 'square', 0.1, 1000); this.tone(1000, 0.18, 'square', 0.1, 1600, 0.1); } }
    sling() { this.tone(300, 0.35, 'sawtooth', 0.08, 1400); this.tone(900, 0.2, 'sine', 0.12, 2400, 0.05); this.noise(0.25, 0.15, 3000, 800, 0, 'bandpass'); }
    turn() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.14, null, i * 0.08)); }
    magnet() { this.tone(110, 0.9, 'sawtooth', 0.12, 220); this.tone(220, 0.9, 'square', 0.05, 440); this.noise(0.6, 0.12, 400, 2000, 0, 'bandpass'); }
    alarm() { [0, 0.22, 0.44].forEach((d) => { this.tone(880, 0.16, 'square', 0.09, 660, d); this.tone(1320, 0.12, 'sine', 0.06, null, d); }); }
    puck(v, m) { const vol = clamp(v / 1500, 0.04, 0.4); this.tone(clamp(420 / Math.pow(m, 0.35), 70, 600), 0.09 + Math.min(0.2, m * 0.012), 'triangle', vol, 60); this.noise(0.05, vol * 0.5, 1800, 300); }
    fanfare() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { this.tone(f, 0.45, 'square', 0.07, null, i * 0.09); this.tone(f * 2, 0.3, 'triangle', 0.08, null, i * 0.09); }); }
    sand() { this.noise(0.25, 0.12, 900, 300); }
    /** Neon-Röhre: leises Dauerbrummen (on=true/false) */
    neonHum(on) {
      if (!on || !this.ok()) { if (this.hum) { const h = this.hum; this.hum = null; try { h.g.gain.setTargetAtTime(0, this.ac.currentTime, 0.05); h.o.stop(this.ac.currentTime + 0.3); h.o2.stop(this.ac.currentTime + 0.3); } catch { /* egal */ } } return; }
      if (this.hum) return;
      const o = this.ac.createOscillator(), o2 = this.ac.createOscillator(), g = this.ac.createGain(), fl = this.ac.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 100; o2.type = 'square'; o2.frequency.value = 200;
      fl.type = 'lowpass'; fl.frequency.value = 520; g.gain.value = 0;
      o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(this.master); o.start(); o2.start();
      g.gain.setTargetAtTime(0.035, this.ac.currentTime, 0.2);
      this.hum = { o, o2, g };
    }
    /** Neon flackert: elektrisches Knistern; dim = Röhre fast aus */
    neonZap(strength) {
      const k = strength == null ? 1 : strength;
      this.noise(0.04 + Math.random() * 0.05, 0.10 * k, 4000 + Math.random() * 3000, 900, 0, 'highpass');
      this.tone(100 + Math.random() * 20, 0.06, 'square', 0.05 * k, 60);
      if (this.hum) { const t = this.ac.currentTime; this.hum.g.gain.setValueAtTime(0.004, t); this.hum.g.gain.setTargetAtTime(0.035, t + 0.05, 0.03); }
    }
    band(v) { const vol = clamp(v / 1400, 0.08, 0.35); this.tone(140, 0.28, 'sine', vol, 420); this.tone(70, 0.3, 'triangle', vol * 0.6, 200); }
    eat(big) { this.noise(big ? 0.35 : 0.18, big ? 0.4 : 0.22, big ? 900 : 1600, 120); this.tone(big ? 90 : 160, big ? 0.3 : 0.15, 'square', 0.14, 40); }
    launch() { this.tone(220, 0.35, 'sine', 0.2, 900); this.tone(110, 0.4, 'triangle', 0.12, 60); this.noise(0.2, 0.08, 2500, 300); }
    arm() { this.tone(1200, 0.06, 'square', 0.08); this.tone(1600, 0.06, 'square', 0.08, null, 0.08); this.noise(0.3, 0.06, 6000, 3000, 0, 'highpass'); }
    fuseTick(urgent) { this.tone(urgent ? 1500 : 1000, 0.05, 'square', urgent ? 0.1 : 0.06); }
    boom(small) {
      const k = small ? 0.5 : 1;
      this.noise(1.4 * k, 0.7 * k, small ? 3000 : 1800, 60); this.tone(small ? 120 : 70, 1.0 * k, 'sine', 0.6 * k, 25); this.tone(140, 0.5, 'sawtooth', 0.15 * k, 40);
      this.noise(0.25, 0.4, 8000, 1500, 0, 'highpass');
    }
    glass() {
      this.noise(0.5, 0.35, 9000, 2500, 0, 'highpass');
      for (let i = 0; i < 7; i++) this.tone(2000 + Math.random() * 3500, 0.12 + Math.random() * 0.2, 'sine', 0.05 + Math.random() * 0.05, null, Math.random() * 0.25);
      this.tone(160, 0.15, 'triangle', 0.15, 60);
    }
    swallow() { this.tone(420, 0.6, 'sine', 0.22, 40); this.tone(90, 0.7, 'sawtooth', 0.08, 30); this.noise(0.5, 0.14, 2500, 120, 0, 'bandpass'); }
    tension(p) {
      if (!this.ok()) { this.stopTension(); return; }
      if (!this.tens) {
        const o = this.ac.createOscillator(), g = this.ac.createGain(), o2 = this.ac.createOscillator();
        o.type = 'sawtooth'; o2.type = 'sine'; g.gain.value = 0;
        const fl = this.ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900;
        o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(this.master); o.start(); o2.start();
        this.tens = { o, o2, g };
      }
      const t = this.ac.currentTime;
      this.tens.o.frequency.setTargetAtTime(90 + 380 * p, t, 0.03);
      this.tens.o2.frequency.setTargetAtTime(180 + 760 * p, t, 0.03);
      this.tens.g.gain.setTargetAtTime(0.02 + 0.06 * p, t, 0.03);
    }
    stopTension() {
      if (!this.tens) return;
      const { o, o2, g } = this.tens; this.tens = null;
      try { g.gain.setTargetAtTime(0, this.ac.currentTime, 0.02); o.stop(this.ac.currentTime + 0.1); o2.stop(this.ac.currentTime + 0.1); } catch { /* egal */ }
    }
  }

  // ------------------------------------------------------------ Vorschau im Hintergrund
  /**
   * Schickt Vorschau-Berechnungen an einen Web Worker. Es ist immer höchstens eine unterwegs;
   * kommt währenddessen eine neue, wird nur die neueste nachgeschoben (ältere verfallen).
   * request() gibt false zurück, wenn kein Worker verfügbar ist -> dann rechnet der Aufrufer selbst.
   */
  const predictor = (() => {
    let w = null, ok = false, busy = false, pending = null, seq = 0;
    let cmObj = null, cmId = 0, sentCm = 0, cfgObj = null, cfgId = 0, sentCfg = 0;
    const cbs = new Map();
    try {
      w = new Worker('/predict-worker.js');
      ok = true;
      w.onmessage = (e) => {
        const d = e.data; busy = false;
        const job = cbs.get(d.id); cbs.delete(d.id);
        if (d.missing) { sentCm = 0; sentCfg = 0; if (job && !pending) pending = job; } // Bahn/Config fehlt -> mit Daten nochmal
        else if (job) job.cb(d);
        if (pending) { const p = pending; pending = null; send(p.req, p.cb); }
      };
      w.onerror = () => { ok = false; };
    } catch { ok = false; }
    function send(req, cb) {
      if (req.cm !== cmObj) { cmObj = req.cm; cmId++; }
      if (P.config !== cfgObj) { cfgObj = P.config; cfgId++; }
      const msg = { id: ++seq, key: req.key, cmId, cfgId, x: req.x, y: req.y, angle: req.angle, pw: req.pw, mode: req.mode, opts: req.opts };
      if (sentCm !== cmId) { msg.cm = req.cm; sentCm = cmId; }
      if (sentCfg !== cfgId) { msg.config = P.config; sentCfg = cfgId; }
      cbs.set(msg.id, { req, cb }); busy = true;
      try { w.postMessage(msg); } catch { ok = false; busy = false; cbs.delete(msg.id); }
    }
    return {
      request(req, cb) {
        if (!ok) return false;
        if (busy) pending = { req, cb }; else send(req, cb);
        return true;
      },
    };
  })();

  // ------------------------------------------------------------ Schuss-Steuerung (Ziehen = Kraft)
  /**
   * Klicken setzt einen Ankerpunkt; Ziehen weg davon bestimmt die Kraft (Distanz) und die Richtung
   * (in Zugrichtung). Loslassen schlägt.
   * Ohne Ziehen: Maus zeigt eine Vorschau mit der letzten Kraft; Leertaste schlägt damit.
   * ←/→ Feinjustierung (Shift = grob), ↑/↓ Vorschau-Kraft, Rechtsklick/Esc bricht ab.
   */
  class ShotController {
    constructor(canvas, view, opts) {
      this.canvas = canvas; this.view = view; this.opts = opts;
      this.angle = 0; this.power = 0; this.lastPower = 0.5; this.dragging = false;
      this.anchor = null; this.cur = null; this.angleOff = 0;
      this.keyAim = false; this.mouse = null; this.pred = null; this.predKey = '';
      this.sfx = opts.sfx || null; this.fx = opts.fx || null;
      canvas.addEventListener('pointermove', (e) => this.onMove(e));
      canvas.addEventListener('pointerdown', (e) => this.onDown(e));
      window.addEventListener('pointermove', (e) => { if (this.dragging) this.cur = { x: e.clientX, y: e.clientY }; });
      window.addEventListener('pointerup', (e) => this.onUp(e));
      window.addEventListener('pointercancel', (e) => { if (this.dragging && e.pointerId === this.pid) this.cancel(); });
      canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.cancel(); });
      window.addEventListener('keydown', (e) => this.onKey(e));
    }
    get enabled() { return this.opts.canShoot(); }
    onMove(e) {
      const w = this.view.toWorld(e.clientX, e.clientY);
      if (this.mouse && Math.hypot(w.x - this.mouse.x, w.y - this.mouse.y) > 0.5) this.keyAim = false;
      this.mouse = w;
    }
    onDown(e) {
      if (this.dragging && e.pointerId !== this.pid) { this.cancel(); return; } // zweiter Finger = abbrechen
      if (e.button !== 0 || !this.enabled) return;
      this.pid = e.pointerId;
      this.onMove(e);
      this.dragging = true; this.angleOff = 0; this.power = 0;
      this.anchor = { x: e.clientX, y: e.clientY }; this.cur = { ...this.anchor };
      this.dragAngle = this.angle;
    }
    onUp(e) { if (e.button === 0 && this.dragging && e.pointerId === this.pid) this.release(); }
    onKey(e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat && this.enabled && !this.dragging) this.fire(this.angle, this.lastPower);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        const step = (e.shiftKey ? 2 : 0.15) * Math.PI / 180 * (e.code === 'ArrowLeft' ? -1 : 1);
        if (this.dragging) this.angleOff += step; else { this.angle += step; this.keyAim = true; }
      } else if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && !this.dragging) {
        e.preventDefault();
        this.lastPower = clamp(this.lastPower + (e.code === 'ArrowUp' ? 0.01 : -0.01) * (e.shiftKey ? 5 : 1), 0.02, 1);
      } else if (e.code === 'Escape') this.cancel();
    }
    cancel() { this.dragging = false; this.power = 0; if (this.sfx) this.sfx.stopTension(); }
    dragDist() { return this.anchor && this.cur ? Math.hypot(this.cur.x - this.anchor.x, this.cur.y - this.anchor.y) : 0; }
    release() {
      const ok = this.dragDist() > 6 && this.power > 0.015 && this.enabled;
      const p = this.power, a = this.angle;
      this.cancel();
      if (ok) { this.lastPower = p; this.fire(a, p); }
    }
    fire(angle, power) {
      if (this.sfx) this.sfx.shoot(power);
      if (this.fx && this.ball) {
        const b = this.ball, c = this.opts.color ? this.opts.color() : '#fff';
        this.fx.spark(b.x, b.y, c, 18 + power * 40, 250 + power * 700, { angle, spread: 0.9, life: 0.45 });
        this.fx.spark(b.x, b.y, '#fff', 10 + power * 20, 200 + power * 500, { angle: angle + Math.PI, spread: 1.6, life: 0.3 });
        this.fx.ring(b.x, b.y, c, 30 + power * 50, 0.4, 4);
        this.fx.shake(1 + power * 6);
      }
      this.opts.onShoot(angle, power);
    }
    update(dt, ball) {
      this.ball = ball;
      if (!ball) return;
      if (this.dragging) {
        if (!this.enabled) { this.cancel(); return; }
        // Ball fliegt in Zugrichtung (Weltkoordinaten: rechts = rechts, oben = oben)
        const dx = this.cur.x - this.anchor.x, dy = this.cur.y - this.anchor.y, d = Math.hypot(dx, dy);
        this.power = clamp(d / MAX_DRAG(), 0, 1);
        if (d > 6) this.angle = Math.atan2(dy, dx) + this.angleOff;
        if (this.sfx) this.sfx.tension(this.power);
        // Energie-Partikel, die in den Ball gesaugt werden
        if (this.fx && this.power > 0.02) {
          const n = Math.random() < 0.3 + this.power ? 1 : 0;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 30;
            this.fx.parts.push({ x: ball.x + Math.cos(a) * r, y: ball.y + Math.sin(a) * r, vx: 0, vy: 0, t: 0, life: 0.35, color: powerColor(this.power), size: 1.6, drag: 0, kind: 'dot', pull: { x: ball.x, y: ball.y, k: 1400 } });
          }
          if (this.power >= 0.999) this.fx.shake(1.2);
        }
      } else if (this.mouse && !this.keyAim) {
        const dx = this.mouse.x - ball.x, dy = this.mouse.y - ball.y;
        if (dx * dx + dy * dy > 4) this.angle = Math.atan2(dy, dx);
      }
    }
    prediction(cm, ball, maxTime) {
      if (!this.enabled || !ball || maxTime <= 0) return null;
      const pw = this.dragging ? this.power : this.lastPower;
      if (pw < 0.01) return null;
      const pk = this.opts.getPucks ? this.opts.getPucks() : null;
      const mode = this.opts.shotMode ? this.opts.shotMode() : null;
      const kick = mode === 'ult';
      // volle Genauigkeit: gerundete Schlüssel ließen eine veraltete Vorschau stehen, obwohl mit dem exakten Winkel geschlagen wird
      const key = ball.x + ',' + ball.y + ',' + this.angle + ',' + pw + ',' + maxTime + ',' + (pk ? pk.ver : 0) + ',' + mode + ',' + (pk && pk.glass ? pk.glass.join('.') : '') + (pk && pk.noArm ? 'n' : '') + (pk && pk.ghost ? 'g' : '') + (pk && pk.ice ? 'i' : '') + (pk && pk.slime ? 's' : '') + (pk && pk.gadgets ? pk.gadgets.map((g) => g.id + '@' + g.x + ',' + g.y).join(';') : '');
      if (key !== this.predKey || cm !== this.predCm) {
        const opts = { record: true, every: 2, maxTime, pucks: pk ? pk.list : null, glass: pk ? pk.glass : null, noArm: pk ? pk.noArm : false, ghost: pk ? !!pk.ghost : false, ice: pk ? !!pk.ice : false, slime: pk ? !!pk.slime : false, gadgets: pk ? pk.gadgets : null, kick };
        this.predKey = key; this.predCm = cm;
        // im Hintergrund rechnen lassen; bis das Ergebnis da ist, bleibt die letzte Vorschau stehen
        if (!predictor.request({ key, cm, x: ball.x, y: ball.y, angle: this.angle, pw, mode, opts }, (r) => { this.pred = r.pred; })) {
          const v = P.shotVelocity(this.angle, pw, mode);
          this.pred = P.simulate(cm, ball.x, ball.y, v.vx, v.vy, opts);
        }
      }
      return this.pred;
    }
    draw(ctx, ball, color, cm, maxTime, t, portion) {
      if (!this.enabled || !ball) return;
      // Vorschau erst beim Ziehen (Spiel); der Editor-Testmodus kann sie auch beim Zielen zeigen (opts.hoverPreview)
      const showPred = portion !== 0 && (this.dragging || this.opts.hoverPreview);
      const pred = showPred ? this.prediction(cm, ball, maxTime) : null;
      if (pred) drawPrediction(ctx, pred, color, { ghost: !this.dragging, t, portion });
      const pw = this.dragging ? this.power : this.lastPower;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Kraftring um den Ball
      const pc = powerColor(pw, this.dragging ? 1 : 0.35);
      ctx.strokeStyle = pc; ctx.lineWidth = this.dragging ? 4 : 2; ctx.lineCap = 'round';
      glow(ctx, powerColor(pw), this.dragging ? 16 : 4);
      ctx.beginPath(); ctx.arc(ball.x, ball.y, P.BALL_R + 10, -Math.PI / 2, -Math.PI / 2 + pw * Math.PI * 2); ctx.stroke();
      noGlow(ctx);
      // Richtungspfeil
      ctx.translate(ball.x, ball.y); ctx.rotate(this.angle);
      const L = 22 + pw * 60;
      ctx.strokeStyle = pc; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(P.BALL_R + 14, 0); ctx.lineTo(P.BALL_R + 14 + L, 0);
      ctx.moveTo(P.BALL_R + 6 + L, -6); ctx.lineTo(P.BALL_R + 14 + L, 0); ctx.lineTo(P.BALL_R + 6 + L, 6); ctx.stroke();
      ctx.restore();
      if (this.dragging) {
        // Gummiband vom Ankerpunkt zur Maus (Bildschirmkoordinaten)
        const v = this.view, r = v.canvas.getBoundingClientRect(), d = v.dpr;
        const ax = (this.anchor.x - r.left) * d, ay = (this.anchor.y - r.top) * d;
        const cx = (this.cur.x - r.left) * d, cy = (this.cur.y - r.top) * d;
        ctx.save(); v.screen();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1 * d; ctx.setLineDash([4 * d, 6 * d]);
        ctx.beginPath(); ctx.arc(ax, ay, MAX_DRAG() * d, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = powerColor(pw); ctx.lineWidth = 3 * d; glow(ctx, powerColor(pw), 14);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cx, cy); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ax, ay, 5 * d, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, 4 * d, 0, 7); ctx.fill();
        noGlow(ctx);
        ctx.font = `800 ${16 * d}px system-ui, sans-serif`; ctx.textAlign = 'center';
        ctx.fillStyle = powerColor(pw); glow(ctx, powerColor(pw), 10);
        ctx.fillText(Math.round(pw * 100) + ' %', cx, cy - 14 * d);
        ctx.restore();
        v.world();
      }
    }
  }

  // ------------------------------------------------------------ Animierte Kugel (Ball + Pucks, optional Ultimate)
  /**
   * opts.pucks: Startzustand der Pucks, opts.ult: Ultimate-Schlag (Stoß + Zeitlupe + Steuerung),
   * opts.local: eigener Ultimate-Schlag (Steuerung kommt von steerFn in update), sonst warten auf addInputs().
   */
  class BallAnim {
    constructor(cm, from, vx, vy, end, result, opts) {
      opts = opts || {};
      this.cm = cm; this.end = end; this.result = result; this.acc = 0;
      this.mode = opts.mode || (opts.ult ? 'ult' : null);
      this.mc = P.modeCfg(this.mode);
      this.ult = !!this.mc; // gesteuerter Schlag (Ultimate oder Sling)
      this.local = !!opts.local;
      this.inputs = []; this.sent = 0; this.ended = !this.ult; this.endSent = false;
      this.steerSteps = this.ult ? Math.round(this.mc.steerTime / P.DT) : 0;
      this.s = P.createState(from.x, from.y, vx, vy, opts.pucks || [], { kick: this.mode === 'ult', inputs: this.ult ? this.inputs : null, glass: opts.glass, balls: opts.balls, noArm: opts.noArm, ghost: opts.ghost, ice: opts.ice, slime: opts.slime, gadgets: opts.gadgets });
      this.trail = [from.x, from.y]; this.fade = 0; this.events = []; this.zmask = this.zoneMask(); this.timeScale = 1;
      this.px = from.x; this.py = from.y; this.pp = this.s.pucks.map((q) => [q.x, q.y]);
      this.buffering = this.ult && !this.local; // Mitspieler: erst etwas Eingaben puffern
      if (this.ult) this.events.push({ type: this.mode, x: from.x, y: from.y });
    }
    zoneMask() {
      let m = 0;
      for (let i = 0; i < this.cm.zones.length && i < 30; i++) {
        const z = this.cm.zones[i];
        if (this.s.x >= z.x1 && this.s.x <= z.x2 && this.s.y >= z.y1 && this.s.y <= z.y2) m |= 1 << i;
      }
      return m;
    }
    /** läuft gerade die gesteuerte Zeitlupen-Phase? */
    get steering() { return this.ult && !this.s.done && this.s.n < this.steerSteps && !(this.ended && this.inputs.length / 2 <= this.s.n); }
    get steerLeft() { return this.steering ? 1 - this.s.n / this.steerSteps : 0; }
    addInputs(arr) { for (const v of arr) this.inputs.push(v); }
    finish(end, result) {
      this.end = end; this.result = result; this.ended = true;
      if (this.s.done && end && result !== 'water') { this.s.x = end.x; this.s.y = end.y; }
    }
    update(dt, steerFn) {
      if (this.s.allDone) { this.fade += dt; return; }
      const U = this.mc || P.config.ultimate;
      if (this.steering) {
        // sanft in die Zeitlupe hinein und am Ende wieder heraus
        const left = this.steerSteps - this.s.n, ramp = 30;
        const k = Math.min(1, left / ramp);
        this.timeScale = U.slowmo + (1 - U.slowmo) * (1 - k) * 0.6;
      } else this.timeScale = 1;
      // Mitspieler: Eingaben puffern (Netz-Schwankungen), damit es nicht stockt
      if (this.ult && !this.local && !this.ended && this.s.n < this.steerSteps && !this.s.done) {
        const ahead = this.inputs.length / 2 - this.s.n;
        if (this.buffering && ahead >= 14) this.buffering = false;
        if (!this.buffering && ahead <= 0) this.buffering = true;
        if (this.buffering) return;
      }
      this.acc += Math.min(dt, 0.1) * this.timeScale;
      let guard = 0;
      while (this.acc >= P.DT && !this.s.allDone && guard++ < 800) {
        if (this.ult && !this.s.done && this.s.n < this.steerSteps && this.inputs.length / 2 <= this.s.n) {
          if (this.local && steerFn) { const v = steerFn(this.s, this); this.inputs.push(v[0], v[1]); }
          else if (!this.ended) { this.acc = Math.min(this.acc, P.DT); this.buffering = true; break; } // auf Live-Eingaben warten
        }
        const wasDone = this.s.done;
        this.px = this.s.x; this.py = this.s.y;
        for (let i = 0; i < this.s.pucks.length; i++) { this.pp[i][0] = this.s.pucks[i].x; this.pp[i][1] = this.s.pucks[i].y; }
        P.step(this.cm, this.s); this.acc -= P.DT;
        if (!wasDone) {
          if (this.s.n % 2 === 0) this.trail.push(this.s.x, this.s.y);
          if (this.s.hit) this.events.push({ type: 'hit', x: this.s.x, y: this.s.y, v: this.s.hitV, hit: this.s.hit });
          const m = this.zoneMask();
          if (m !== this.zmask) {
            const entered = m & ~this.zmask;
            for (let i = 0; i < 30; i++) if (entered & (1 << i)) this.events.push({ type: 'zone', kind: this.cm.zones[i].kind, x: this.s.x, y: this.s.y });
            this.zmask = m;
          }
          if (this.s.done) {
            this.events.push({ type: 'done', result: this.s.result, x: this.s.x, y: this.s.y });
            if (this.end && this.result !== 'water') { this.s.x = this.end.x; this.s.y = this.end.y; }
            this.px = this.s.x; this.py = this.s.y;
          }
        }
        if (this.s.pevents.length) { for (const e of this.s.pevents) this.events.push(e); this.s.pevents.length = 0; }
      }
      if (this.trail.length > 4000) this.trail.splice(0, this.trail.length - 4000);
      if (this.s.allDone) this.fade = 0;
    }
    get done() { return this.s.allDone; }
    get ballDone() { return this.s.done; }
    /** Zwischenstand für flüssiges Zeichnen (auch in Zeitlupe) */
    get alpha() { return this.s.allDone ? 1 : Math.max(0, Math.min(1, this.acc / P.DT)); }
    /** Position eines angestoßenen Gegnerballs (oder null, wenn er nicht Teil dieses Schlags ist) */
    ballPos(id) {
      for (let i = 0; i < this.s.pucks.length; i++) {
        const q = this.s.pucks[i];
        if (q.pb !== id) continue;
        if (!q.alive) return this.done ? { x: q.ox, y: q.oy } : null;
        const a = this.alpha;
        return { x: this.pp[i][0] + (q.x - this.pp[i][0]) * a, y: this.pp[i][1] + (q.y - this.pp[i][1]) * a };
      }
      return null;
    }
    get pucks() {
      const a = this.alpha;
      if (a >= 1) return this.s.pucks;
      return this.s.pucks.map((q, i) => ({ ...q, x: this.pp[i][0] + (q.x - this.pp[i][0]) * a, y: this.pp[i][1] + (q.y - this.pp[i][1]) * a }));
    }
    get pos() {
      if (this.s.done) return { x: this.s.x, y: this.s.y };
      const a = this.alpha;
      return { x: this.px + (this.s.x - this.px) * a, y: this.py + (this.s.y - this.py) * a };
    }
    get speed() { return Math.hypot(this.s.vx, this.s.vy); }
    inZone(kind) {
      for (let i = 0; i < this.cm.zones.length && i < 30; i++) if ((this.zmask & (1 << i)) && this.cm.zones[i].kind === kind) return true;
      return false;
    }
  }

  /** Explosion zwischen den Zügen als Animation (gleiche Physik wie der Server) */
  class BlastAnim {
    /** state: P.blastState(...) oder P.launchState(...) */
    constructor(cm, state) {
      this.cm = cm; this.s = state;
      this.acc = 0; this.events = []; this.trail = []; this.fade = 0; this.timeScale = 1; this.blast = true;
      this.pp = this.s.pucks.map((q) => [q.x, q.y]);
      this.flush();
    }
    flush() { if (this.s.pevents.length) { for (const e of this.s.pevents) this.events.push(e); this.s.pevents.length = 0; } }
    update(dt) {
      if (this.s.allDone) { this.fade += dt; return; }
      this.acc += Math.min(dt, 0.1);
      let guard = 0;
      while (this.acc >= P.DT && !this.s.allDone && guard++ < 800) {
        for (let i = 0; i < this.s.pucks.length; i++) { this.pp[i][0] = this.s.pucks[i].x; this.pp[i][1] = this.s.pucks[i].y; }
        P.step(this.cm, this.s); this.acc -= P.DT; this.flush();
      }
    }
    get done() { return this.s.allDone; }
    get ballDone() { return true; }
    get steering() { return false; }
    get alpha() { return this.s.allDone ? 1 : Math.max(0, Math.min(1, this.acc / P.DT)); }
    body(i) { const q = this.s.pucks[i], a = this.alpha; return { ...q, x: this.pp[i][0] + (q.x - this.pp[i][0]) * a, y: this.pp[i][1] + (q.y - this.pp[i][1]) * a }; }
    get pucks() { const out = []; for (let i = 0; i < this.s.pucks.length; i++) if (this.s.pucks[i].pb == null) out.push(this.body(i)); return out; }
    /** aktuelle Position eines Spielerballs (oder null) */
    ballPos(id) {
      for (let i = 0; i < this.s.pucks.length; i++) {
        const q = this.s.pucks[i];
        if (q.pb !== id) continue;
        return q.alive ? this.body(i) : (this.s.allDone ? { x: q.ox, y: q.oy } : null);
      }
      return null;
    }
  }

  /** Effekte zu einer laufenden Ball-Animation erzeugen */
  function animFx(a, fx, sfx, color, map, dt) {
    const objs = map.objects || [];
    let ppSound = 0;
    for (const e of a.events) {
      if (e.type === 'hit') {
        const h = e.hit, v = e.v;
        if (h.kind === 'puck') {
          const c = PUCK_COL[h.c] || '#fff';
          fx.spark(e.x, e.y, c, clamp(Math.round(v / 40), 6, 30), 160 + v * 0.3, { life: 0.45 });
          fx.ring(e.x, e.y, c, 20 + h.m * 3, 0.35, 3);
          if (h.m > 5) fx.shake(Math.min(8, 2 + v / 300));
          if (sfx) sfx.puck(v, h.m);
        } else if (h.ball) {
          fx.spark(e.x, e.y, '#ffffff', 14, 350, { life: 0.35 }); fx.ring(e.x, e.y, '#fff', 26, 0.3, 2);
          if (sfx) sfx.ballHit(v);
        } else if (h.kind === 'circle' && h.src != null) {
          fx.flash(h.src);
          fx.spark(e.x, e.y, NEON.bumper, 30, 500, { life: 0.5 }); fx.spark(e.x, e.y, '#fff', 10, 300, { life: 0.3 });
          fx.ring(h.x, h.y, NEON.bumper, (h.r || 24) + 40, 0.45, 5);
          fx.shake(Math.min(9, 2 + v / 200)); if (sfx) sfx.bumper();
        } else if (h.band) {
          fx.flash(h.src);
          fx.spark(e.x, e.y, NEON.band, 26, 420, { life: 0.45 }); fx.spark(e.x, e.y, '#fff', 8, 260, { life: 0.3 });
          fx.ring(e.x, e.y, NEON.band, 40, 0.35, 4); fx.shake(Math.min(7, 2 + v / 250));
          if (sfx) sfx.band(v);
        } else {
          const type = h.src != null && objs[h.src] ? objs[h.src].type : 'border';
          const c = type === 'wall' ? NEON.wall : type === 'block' ? NEON.block : NEON.border;
          fx.spark(e.x, e.y, c, clamp(Math.round(v / 45), 4, 28), 120 + v * 0.35, { life: 0.45 });
          if (v > 350) fx.ring(e.x, e.y, c, 18 + v / 30, 0.35, 3);
          if (v > 700) fx.shake((v - 700) / 160);
          if (sfx) sfx.hit(v);
        }
      } else if (e.type === 'pp') {
        fx.spark(e.x, e.y, '#ffffff', clamp(Math.round(e.v / 60), 3, 16), 120 + e.v * 0.2, { life: 0.35 });
        if (sfx && ppSound++ < 2) sfx.puck(e.v * 0.7, 3);
      } else if (e.type === 'sink') {
        fx.spark(e.x, e.y, '#5aa0ff', 30, 260, { life: 0.7, kind: 'dot', drag: 4, size: 2.2 });
        fx.ring(e.x, e.y, PUCK_COL[e.c] || '#2f7bff', 40, 0.6, 3);
        if (sfx) sfx.splash();
      } else if (e.type === 'eat') {
        const c = e.big ? '#ff2e88' : (PUCK_COL[e.c] || '#ffe03a');
        fx.spark(e.x, e.y, c, e.big ? 40 : 22, e.big ? 520 : 360, { life: 0.6 });
        fx.spark(e.x, e.y, '#ffffff', 10, 300, { life: 0.3 });
        fx.ring(e.x, e.y, c, e.big ? 60 : 36, 0.35, 5);
        fx.text(e.x, e.y - 24, e.pb != null ? 'GEFRESSEN!' : e.big ? 'MAMPF!' : 'NOM', e.big ? '#ff2e88' : '#ffe03a', e.big ? 26 : 18);
        fx.shake(e.big ? 7 : 3);
        if (sfx) sfx.eat(e.big);
      } else if (e.type === 'launch') {
        fx.spark(e.x, e.y, '#c36bff', 24, 380, { life: 0.5 }); fx.ring(e.x, e.y, '#c36bff', 50, 0.4, 4);
        if (sfx) sfx.launch();
      } else if (e.type === 'pickup') {
        const c = GADGET_COL[e.g] || '#fff';
        fx.spark(e.x, e.y, c, 36, 420, { life: 0.6 }); fx.spark(e.x, e.y, '#ffffff', 14, 260, { life: 0.4 });
        fx.ring(e.x, e.y, c, 70, 0.5, 5); fx.ring(e.x, e.y, '#fff', 40, 0.35, 3);
        fx.text(e.x, e.y - 34, gIcon(e.g) + ' ' + (GADGET_LABEL[e.g] || '') + '!', c, 30);
        if (sfx) sfx.pickup(e.g);
      } else if (e.type === 'freeze') {
        fx.spark(e.x, e.y, '#bff4ff', 22, 260, { life: 0.6 }); fx.ring(e.x, e.y, '#8fe8ff', (e.r || 12) + 30, 0.45, 4);
        fx.text(e.x, e.y - 28, '❄ EINGEFROREN', '#bff4ff', 20);
        if (sfx) sfx.freeze && sfx.freeze();
      } else if (e.type === 'stick') {
        fx.spark(e.x, e.y, '#7dff3a', 16, 160, { life: 0.5 }); if (sfx) sfx.slime && sfx.slime();
      } else if (e.type === 'melt') {
        fx.spark(e.x, e.y, '#8fe8ff', 30, 140, { life: 0.9, drag: 2 }); fx.ring(e.x, e.y, '#bff4ff', 40, 0.5, 3);
        fx.text(e.x, e.y - 30, '💧 GESCHMOLZEN', '#8fe8ff', 22);
      } else if (e.type === 'debris') {
        const c = e.f ? FIELD_COL[e.f] : (PUCK_COL[e.c] || '#fff');
        fx.spark(e.x, e.y, c, e.f ? 30 : 10, e.f ? 320 : 180, { life: 0.5 });
        if (e.f) { fx.ring(e.x, e.y, c, 60, 0.6, 4); fx.text(e.x, e.y - 30, e.f === 'attract' ? 'GRAVITY!' : 'ANTIGRAVITY!', c, 24); if (sfx) sfx.launch(); }
      } else if (e.type === 'arm') {
        fx.spark(e.x, e.y, '#ffd23a', 14, 200, { life: 0.4 }); fx.ring(e.x, e.y, '#ff3a2a', 34, 0.35, 3);
        if (sfx) sfx.arm();
      } else if (e.type === 'boom') {
        const R = e.r || P.bombCfg(null).blastRadius;
        for (let i = 0; i < 3; i++) fx.rings.push({ x: e.x, y: e.y, color: ['#ffd23a', '#ff6a1a', '#ff2a2a'][i], r: R * (0.5 + i * 0.3), dur: 0.5 + i * 0.15, t: -i * 0.06, w: 9 - i * 2 });
        fx.spark(e.x, e.y, '#ffd23a', 70, 900, { life: 0.8, drag: 2.5 });
        fx.spark(e.x, e.y, '#ff4a1a', 60, 650, { life: 1.0, drag: 2 });
        fx.spark(e.x, e.y, '#ffffff', 25, 1100, { life: 0.35 });
        for (let i = 0; i < 14; i++) fx.spark(e.x + (Math.random() - 0.5) * 40, e.y + (Math.random() - 0.5) * 40, 'rgba(120,110,120,0.7)', 1, 60, { life: 1.6, kind: 'smoke', drag: 1.5, size: 4 });
        fx.text(e.x, e.y - 30, e.small ? 'bumm!' : 'BOOM!', '#ff6a1a', e.small ? 28 : 56);
        fx.shake(e.small ? 8 : 18); fx.screen(e.small ? 0.3 : 0.7, '255,140,60');
        if (sfx) sfx.boom(e.small);
      } else if (e.type === 'glass') {
        const o = objs[e.src];
        if (o) { // Splitter entlang der ganzen Scheibe
          for (let k = 0; k < 40; k++) {
            const u = Math.random(), x = o.x1 + (o.x2 - o.x1) * u, y = o.y1 + (o.y2 - o.y1) * u;
            fx.spark(x, y, Math.random() < 0.5 ? '#dff8ff' : '#8fe3ff', 1, 120 + Math.random() * 360, { life: 0.9, drag: 2.5, size: 1.5 + Math.random() * 2 });
          }
        }
        fx.spark(e.x, e.y, '#ffffff', 30, 520, { life: 0.5 }); fx.ring(e.x, e.y, '#bfefff', 70, 0.4, 4);
        fx.shake(6); fx.screen(0.2, '200,240,255');
        if (sfx) sfx.glass();
      } else if (e.type === 'swallow') {
        const c = PUCK_COL[e.c] || '#fff';
        fx.spark(e.x, e.y, c, 26, 220, { life: 0.8, kind: 'dot', pull: { x: map.hole.x, y: map.hole.y, k: 1600 } });
        fx.spark(e.x, e.y, '#c36bff', 20, 160, { life: 0.9, kind: 'dot', pull: { x: map.hole.x, y: map.hole.y, k: 1200 } });
        fx.ring(map.hole.x, map.hole.y, c, 70, 0.5, 4); fx.shake(3);
        if (sfx) sfx.swallow();
      } else if (e.type === 'ult') {
        const U = P.config.ultimate;
        for (let i = 0; i < 4; i++) fx.rings.push({ x: e.x, y: e.y, color: i % 2 ? '#ff2e88' : '#b45cff', r: 180 + i * 240, dur: 0.9 + i * 0.25, t: -i * 0.12, w: 8 - i });
        fx.spark(e.x, e.y, '#ff2e88', 60, 1000, { life: 1.0, drag: 2 });
        fx.spark(e.x, e.y, '#b45cff', 45, 800, { life: 1.2, drag: 1.5 });
        fx.spark(e.x, e.y, '#ffffff', 25, 1200, { life: 0.5 });
        fx.shake(8); fx.screen(0.55, '200,90,255');
        if (sfx) sfx.ult();
        void U;
      } else if (e.type === 'sling') {
        for (let i = 0; i < 3; i++) fx.rings.push({ x: e.x, y: e.y, color: i % 2 ? '#00eaff' : '#3dff7a', r: 60 + i * 50, dur: 0.6 + i * 0.15, t: -i * 0.08, w: 5 - i });
        fx.spark(e.x, e.y, '#00eaff', 40, 600, { life: 0.6 });
        fx.shake(4); fx.screen(0.3, '0,234,255');
        if (sfx) sfx.sling();
      } else if (e.type === 'zone') {
        if (e.kind === 'boost') {
          const ang = Math.atan2(a.s.vy, a.s.vx);
          fx.spark(e.x, e.y, NEON.boost, 30, 500, { angle: ang + Math.PI, spread: 1.2, life: 0.5 });
          fx.ring(e.x, e.y, NEON.boost, 60, 0.4, 4); fx.shake(3); if (sfx) sfx.boost();
        } else if (e.kind === 'sand') { fx.spark(e.x, e.y, NEON.sand, 22, 200, { life: 0.6, kind: 'dot', drag: 5 }); if (sfx) sfx.sand(); }
        else if (e.kind === 'ice') { fx.spark(e.x, e.y, NEON.ice, 14, 160, { life: 0.6, kind: 'dot' }); }
      } else if (e.type === 'done') {
        if (e.result === 'water') {
          fx.spark(e.x, e.y, '#5aa0ff', 60, 380, { life: 0.8, kind: 'dot', drag: 4, size: 2.5 });
          fx.spark(e.x, e.y, '#ffffff', 20, 260, { life: 0.5 });
          for (let i = 0; i < 3; i++) setTimeout(() => fx.ring(e.x, e.y, '#2f7bff', 50 + i * 25, 0.8, 3), i * 140);
          fx.shake(6); if (sfx) sfx.splash();
        } else if (e.result === 'sunk') {
          fx.spark(e.x, e.y, color, 70, 600, { life: 0.9 });
          fx.spark(e.x, e.y, '#ffffff', 30, 420, { life: 0.6 });
          fx.spark(e.x, e.y, '#c36bff', 40, 300, { life: 1.0, kind: 'dot' });
          for (let i = 0; i < 4; i++) setTimeout(() => fx.ring(e.x, e.y, i % 2 ? '#00eaff' : color, 60 + i * 45, 0.7, 5), i * 90);
          fx.shake(8); fx.screen(0.35); if (sfx) sfx.sink();
        }
      }
    }
    a.events.length = 0;
    // fortlaufende Effekte
    if (!a.ballDone && !a.blast) {
      const sp = a.speed;
      if (a.inZone('sand') && sp > 30 && Math.random() < 0.6) fx.spark(a.s.x, a.s.y, NEON.sand, 1, 60, { life: 0.5, kind: 'smoke', drag: 4, size: 2 });
      if (a.inZone('boost')) fx.spark(a.s.x, a.s.y, NEON.boost, 2, 200, { angle: Math.atan2(a.s.vy, a.s.vx) + Math.PI, spread: 0.8, life: 0.35 });
      if ((a.s.waterWalk || a.s.ghost) && a.inZone('water') && sp > 20) { // gleitet übers Wasser: Gischt + Wellenringe
        fx.spark(a.s.x, a.s.y, '#8fd0ff', 3, 160, { angle: Math.atan2(a.s.vy, a.s.vx) + Math.PI, spread: 1.6, life: 0.45, drag: 3 });
        if (Math.random() < 0.15) fx.ring(a.s.x, a.s.y, NEON.water, 26, 0.6, 2);
      }
      if (a.inZone('ice') && Math.random() < 0.3) fx.spark(a.s.x, a.s.y, NEON.ice, 1, 40, { life: 0.5, kind: 'dot' });
      if (sp > 900 && Math.random() < 0.7) fx.spark(a.s.x, a.s.y, color, 1, 80, { angle: Math.atan2(a.s.vy, a.s.vx) + Math.PI, spread: 0.6, life: 0.3 });
      if (a.steering && Math.random() < 0.5) { const p = a.pos, sl = a.mode === 'sling'; fx.spark(p.x, p.y, Math.random() < 0.5 ? (sl ? '#00eaff' : '#ff2e88') : (sl ? '#3dff7a' : '#b45cff'), 1, 90, { life: 0.7, kind: 'dot' }); }
    }
    // schnell gleitende Pucks ziehen Funken
    for (const q of a.s.pucks) if (q.alive && (q.vx * q.vx + q.vy * q.vy) > 600 * 600 && Math.random() < 0.3) fx.spark(q.x, q.y, PUCK_COL[q.c], 1, 60, { life: 0.3, kind: 'dot' });
  }

  /** Ultimate-Overlay: Zeitlupen-Vignette, Steuerlinie, Restzeit */
  function drawUltOverlay(ctx, view, a, target, t) {
    const bp = a.pos, sl = a.mode === 'sling';
    const C1 = sl ? '#00eaff' : '#ff2e88', VG = sl ? '0,150,220' : '120,40,200';
    const c = view.canvas, w = c.width, h = c.height;
    ctx.save(); view.screen();
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, `rgba(${VG},0)`); g.addColorStop(1, `rgba(${VG},${sl ? 0.25 : 0.38})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const d = view.dpr;
    ctx.font = `900 italic ${28 * d}px system-ui, sans-serif`; ctx.textAlign = 'center';
    glow(ctx, C1, 20); ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 8);
    ctx.fillText(sl ? 'SLING BALL · LENKEN' : 'ULTIMATE · SLOW-MO', w / 2, 46 * d);
    noGlow(ctx); ctx.globalAlpha = 1;
    if (!sl && target) { // Hinweis im HUD: Maus 1 = Zugstrahl
      ctx.font = `800 ${13 * d}px system-ui, sans-serif`;
      ctx.fillStyle = a.pulling ? '#ffe03a' : 'rgba(255,255,255,0.85)'; glow(ctx, a.pulling ? '#ffe03a' : C1, 10);
      ctx.fillText(a.pulling ? '🧲 ZUGSTRAHL AKTIV – Ball fliegt zum Zeiger' : '🖱 Maus 1 halten: Ball zum Zeiger ziehen', w / 2, 86 * d);
      noGlow(ctx);
    }
    const bw = 280 * d, bx = w / 2 - bw / 2, by = 58 * d;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx, by, bw, 6 * d);
    ctx.fillStyle = C1; glow(ctx, C1, 12); ctx.fillRect(bx, by, bw * a.steerLeft, 6 * d); noGlow(ctx);
    ctx.restore();
    view.world();
    if (target && a.pulling) { // Zugstrahl
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i === 1 ? '#ffffff' : '#ffe03a'; ctx.globalAlpha = i === 1 ? 0.9 : 0.45; ctx.lineWidth = i === 1 ? 2 : 10 - i * 3; glow(ctx, '#ffe03a', 20);
        ctx.beginPath(); ctx.moveTo(bp.x, bp.y);
        const mx = (bp.x + target.x) / 2 + Math.sin(t * 30 + i) * 6, my = (bp.y + target.y) / 2 + Math.cos(t * 27 + i) * 6;
        ctx.quadraticCurveTo(mx, my, target.x, target.y); ctx.stroke();
      }
      noGlow(ctx); ctx.restore();
    }
    if (target) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = C1; ctx.lineWidth = 2.5; glow(ctx, C1, 14); ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 80;
      ctx.beginPath(); ctx.moveTo(bp.x, bp.y); ctx.lineTo(target.x, target.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(target.x, target.y, 10 + Math.sin(t * 10) * 3, 0, 7); ctx.stroke();
      ctx.restore();
    }
  }



  window.Skill = { TOUCH, PERF, setLowFx, PerfMonitor, NEON, PUCK_COL, PUCK_NAME, FIELD_COL, FIELD_NAME, GADGET_COL, GADGET_NAME, GADGET_ICON, drawGadgets, View, drawMap, drawBall, drawPucks, drawPrediction, drawTrail, drawUltOverlay, ShotController, BallAnim, BlastAnim, FX, SFX, animFx, roundRect, powerColor };
})();
