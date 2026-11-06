/* Skillshot – gemeinsames Rendering & Steuerung (Spiel + Editor) */
(function () {
  const P = window.SkillPhysics;

  // ------------------------------------------------------------ Ansicht
  class View {
    constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.scale = 1; this.ox = 0; this.oy = 0; this.pad = 16; }
    fit(W, H) {
      const c = this.canvas, dpr = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect();
      if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
        c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      }
      const pad = this.pad * dpr;
      this.scale = Math.min((c.width - 2 * pad) / W, (c.height - 2 * pad) / H);
      this.ox = (c.width - W * this.scale) / 2;
      this.oy = (c.height - H * this.scale) / 2;
      this.dpr = dpr;
    }
    begin() {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0d1b14';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    }
    toWorld(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const px = (clientX - r.left) * this.dpr, py = (clientY - r.top) * this.dpr;
      return { x: (px - this.ox) / this.scale, y: (py - this.oy) / this.scale };
    }
  }

  // ------------------------------------------------------------ Rendering
  let turfCache = null;
  function turf(ctx, W, H) {
    const key = W + 'x' + H;
    if (!turfCache || turfCache.key !== key) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = '#3f9b48'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#46a650';
      for (let x = -H; x < W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 40, 0); g.lineTo(x + 40 + H, H); g.lineTo(x + H, H); g.fill(); }
      // Körnung
      for (let i = 0; i < W * H / 260; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
        g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      }
      turfCache = { key, c };
    }
    ctx.drawImage(turfCache.c, 0, 0);
  }

  function rectN(o) { return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) }; }

  function arrowField(ctx, r, angle, spacing, phase, color, chevron) {
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    const a = angle * Math.PI / 180;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const R = Math.hypot(r.w, r.h) / 2 + spacing;
    ctx.translate(cx, cy); ctx.rotate(a);
    ctx.strokeStyle = color; ctx.lineWidth = chevron ? 5 : 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const off = ((phase % spacing) + spacing) % spacing;
    for (let x = -R + off; x < R; x += spacing) {
      for (let y = -R; y < R; y += spacing) {
        ctx.beginPath();
        if (chevron) { ctx.moveTo(x - 7, y - 10); ctx.lineTo(x + 5, y); ctx.lineTo(x - 7, y + 10); }
        else { ctx.moveTo(x - 9, y); ctx.lineTo(x + 7, y); ctx.moveTo(x + 2, y - 5); ctx.lineTo(x + 8, y); ctx.lineTo(x + 2, y + 5); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawZone(ctx, o, t) {
    const r = rectN(o);
    switch (o.type) {
      case 'sand': {
        ctx.fillStyle = '#e3c27a'; roundRect(ctx, r.x, r.y, r.w, r.h, 14); ctx.fill();
        ctx.strokeStyle = '#c9a65c'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = 'rgba(150,110,40,0.25)';
        for (let i = 0; i < r.w * r.h / 120; i++) { const h = hash(i + r.x * 7 + r.y); ctx.fillRect(r.x + h * r.w, r.y + hash(i * 3.1 + r.y) * r.h, 2, 2); }
        break;
      }
      case 'ice': {
        const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
        g.addColorStop(0, '#c9f1ff'); g.addColorStop(1, '#8fd6f2');
        ctx.fillStyle = g; roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < r.w * r.h / 9000 + 2; i++) {
          const x = r.x + hash(i + r.x) * r.w, y = r.y + hash(i * 1.7 + r.y) * r.h;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.min(r.x + r.w, x + 30), Math.min(r.y + r.h, y + 18)); ctx.stroke();
        }
        break;
      }
      case 'water': {
        ctx.fillStyle = '#2d7fd6'; roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2;
        for (let y = r.y + 14; y < r.y + r.h; y += 22) {
          ctx.beginPath();
          for (let x = r.x; x <= r.x + r.w; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.06 + t * 2 + y) * 3);
          ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = '#1b5ea8'; ctx.lineWidth = 3; roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.stroke();
        break;
      }
      case 'slope':
        ctx.fillStyle = 'rgba(20,70,25,0.35)'; ctx.fillRect(r.x, r.y, r.w, r.h);
        arrowField(ctx, r, o.angle || 0, 36, t * 18, 'rgba(255,255,255,0.22)', false);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
        break;
      case 'boost':
        ctx.fillStyle = 'rgba(255,170,0,0.55)'; roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill();
        arrowField(ctx, r, o.angle || 0, 26, t * 70, 'rgba(255,255,220,0.85)', true);
        ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 2; roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
        break;
    }
  }

  function drawSolid(ctx, o) {
    switch (o.type) {
      case 'block': {
        const r = rectN(o);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(r.x + 4, r.y + 5, r.w, r.h);
        ctx.fillStyle = '#245a2c'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let x = r.x; x < r.x + r.w; x += 16) for (let y = r.y + ((x / 16) % 2) * 8; y < r.y + r.h; y += 16) ctx.fillRect(x + 3, y + 3, 6, 6);
        ctx.strokeStyle = '#7a5532'; ctx.lineWidth = 6; ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
        break;
      }
      case 'wall': {
        const t = o.t || 14;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = t;
        ctx.beginPath(); ctx.moveTo(o.x1 + 3, o.y1 + 4); ctx.lineTo(o.x2 + 3, o.y2 + 4); ctx.stroke();
        ctx.strokeStyle = '#8a5d34'; ctx.lineWidth = t;
        ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
        ctx.strokeStyle = '#b07a46'; ctx.lineWidth = Math.max(2, t * 0.35);
        ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
        break;
      }
      case 'bumper': {
        const r = o.r || 24;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(o.x + 3, o.y + 4, r, 0, 7); ctx.fill();
        const g = ctx.createRadialGradient(o.x - r * 0.3, o.y - r * 0.3, r * 0.1, o.x, o.y, r);
        g.addColorStop(0, '#ff8a8a'); g.addColorStop(1, '#c41e3a');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o.x, o.y, r * 0.62, 0, 7); ctx.stroke();
        break;
      }
    }
  }

  function drawMap(ctx, map, t) {
    const W = map.width, H = map.height;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(6, 8, W, H);
    turf(ctx, W, H);
    const objs = map.objects || [];
    for (const o of objs) if (o.type === 'slope') drawZone(ctx, o, t);
    for (const o of objs) if (o.type === 'sand' || o.type === 'ice' || o.type === 'water' || o.type === 'boost') drawZone(ctx, o, t);
    // Abschlag
    if (map.start) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(map.start.x, map.start.y, 20, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (map.hole) drawHole(ctx, map.hole, t);
    for (const o of objs) if (o.type === 'block' || o.type === 'wall' || o.type === 'bumper') drawSolid(ctx, o);
    // Rahmen
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 10; ctx.strokeRect(-5, -5, W + 10, H + 10);
    ctx.strokeStyle = '#a0703f'; ctx.lineWidth = 3; ctx.strokeRect(-5, -5, W + 10, H + 10);
    ctx.restore();
  }

  function drawHole(ctx, h, t) {
    const R = P.HOLE_R;
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(h.x, h.y, R + 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.arc(h.x, h.y, R, 0, 7); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(h.x, h.y + 2, R - 3, 0, Math.PI); ctx.fill();
    // Fahne
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x, h.y - 52); ctx.stroke();
    const w = Math.sin(t * 4) * 3;
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath(); ctx.moveTo(h.x, h.y - 52); ctx.quadraticCurveTo(h.x + 14, h.y - 48 + w, h.x + 28, h.y - 44 + w); ctx.lineTo(h.x, h.y - 36); ctx.closePath(); ctx.fill();
  }

  function drawBall(ctx, x, y, color, label, alpha, scale) {
    const r = P.BALL_R * (scale || 1);
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x + 2, y + 3, r, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d6d6d6');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
    if (label) {
      ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(label, x, y - r - 7);
      ctx.fillStyle = color; ctx.fillText(label, x, y - r - 7);
    }
    ctx.restore();
  }

  /** Vorhergesagte Flugbahn zeichnen */
  function drawPrediction(ctx, pred, color, opts) {
    if (!pred || !pred.points || pred.points.length < 4) return;
    opts = opts || {};
    const pts = pred.points, n = pts.length / 2;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Glow
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
    ctx.stroke();
    // gestrichelte Linie mit Verlauf (in Stücken)
    const seg = 24;
    ctx.lineWidth = opts.ghost ? 1.5 : 2.5;
    ctx.setLineDash(opts.ghost ? [3, 6] : [10, 6]);
    ctx.lineDashOffset = -(opts.t || 0) * 30;
    for (let s = 0; s < n - 1; s += seg) {
      const e = Math.min(n - 1, s + seg);
      const f = s / n;
      ctx.globalAlpha = (opts.ghost ? 0.45 : 1) * (1 - f * 0.6);
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(pts[s * 2], pts[s * 2 + 1]);
      for (let i = s + 1; i <= e; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = opts.ghost ? 0.5 : 1;
    // Abpraller
    if (pred.bounces) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < pred.bounces.length; i += 2) { ctx.beginPath(); ctx.arc(pred.bounces[i], pred.bounces[i + 1], 3.5, 0, 7); ctx.fill(); }
    }
    // Endpunkt
    const ex = pts[pts.length - 2], ey = pts[pts.length - 1];
    if (pred.result === 'sunk') {
      ctx.strokeStyle = '#7CFF7C'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ex, ey, P.HOLE_R + 6 + Math.sin((opts.t || 0) * 6) * 2, 0, 7); ctx.stroke();
    } else if (pred.result === 'water') {
      ctx.strokeStyle = '#ff5050'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ex - 8, ey - 8); ctx.lineTo(ex + 8, ey + 8); ctx.moveTo(ex + 8, ey - 8); ctx.lineTo(ex - 8, ey + 8); ctx.stroke();
    } else if (pred.result === 'rest') {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, ey, P.BALL_R, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  function drawAim(ctx, x, y, angle, power, color) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    const len = 30 + power * 90;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(14, -5, 90 + 16, 10);
    const g = ctx.createLinearGradient(14, 0, 14 + 120, 0);
    g.addColorStop(0, '#5ce65c'); g.addColorStop(0.55, '#ffd23f'); g.addColorStop(1, '#ff3b3b');
    ctx.fillStyle = g; ctx.fillRect(14, -4, len - 14 + 0.01, 8);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.strokeRect(14, -5, 106, 10);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  // ------------------------------------------------------------ Schuss-Steuerung
  /**
   * Zielen mit der Maus, Taste halten zum Aufladen (pendelt 0 -> 100 % -> 0), loslassen schießt.
   * Pfeiltasten: Feinjustierung (Shift = gröber). Rechtsklick/Esc bricht ab.
   */
  class ShotController {
    constructor(canvas, view, opts) {
      this.canvas = canvas; this.view = view; this.opts = opts;
      this.angle = 0; this.power = 0; this.lastPower = 0.5; this.charging = false; this.chargeT = 0;
      this.keyAim = false; this.mouse = null; this.pred = null; this.predKey = '';
      this.CHARGE_TIME = 1.25; // Sekunden für 0 -> 100 %
      canvas.addEventListener('pointermove', (e) => this.onMove(e));
      canvas.addEventListener('pointerdown', (e) => this.onDown(e));
      window.addEventListener('pointerup', (e) => this.onUp(e));
      canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.cancel(); });
      window.addEventListener('keydown', (e) => this.onKey(e, true));
      window.addEventListener('keyup', (e) => this.onKey(e, false));
    }
    get enabled() { return this.opts.canShoot(); }
    onMove(e) {
      const w = this.view.toWorld(e.clientX, e.clientY);
      if (this.mouse && Math.hypot(w.x - this.mouse.x, w.y - this.mouse.y) > 0.5) this.keyAim = false;
      this.mouse = w;
    }
    onDown(e) {
      if (e.button !== 0 || !this.enabled) return;
      if (e.pointerType !== 'mouse') this.onMove(e);
      this.startCharge();
    }
    onUp(e) { if (e.button === 0 && this.charging) this.release(); }
    onKey(e, down) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (down && !e.repeat && this.enabled && !this.charging) this.startCharge();
        else if (!down && this.charging) this.release();
      } else if (down && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        e.preventDefault();
        const step = (e.shiftKey ? 2 : 0.15) * Math.PI / 180;
        this.angle += e.code === 'ArrowLeft' ? -step : step;
        this.keyAim = true;
      } else if (down && (e.code === 'ArrowUp' || e.code === 'ArrowDown') && !this.charging) {
        e.preventDefault();
        this.lastPower = Math.max(0.02, Math.min(1, this.lastPower + (e.code === 'ArrowUp' ? 0.01 : -0.01) * (e.shiftKey ? 5 : 1)));
      } else if (down && e.code === 'Escape') this.cancel();
    }
    startCharge() { this.charging = true; this.chargeT = 0; this.power = 0; }
    cancel() { this.charging = false; this.power = 0; }
    release() {
      this.charging = false;
      if (this.power > 0.015 && this.enabled) {
        this.lastPower = this.power;
        this.opts.onShoot(this.angle, this.power);
      }
      this.power = 0;
    }
    update(dt, ball) {
      if (!ball) return;
      if (this.mouse && !this.keyAim) {
        const dx = this.mouse.x - ball.x, dy = this.mouse.y - ball.y;
        if (dx * dx + dy * dy > 4) this.angle = Math.atan2(dy, dx);
      }
      if (this.charging) {
        if (!this.enabled) { this.cancel(); return; }
        this.chargeT += dt;
        const u = (this.chargeT / this.CHARGE_TIME) % 2;
        this.power = u <= 1 ? u : 2 - u;
        this.power = Math.max(0.01, this.power);
      }
    }
    /** Vorschau neu berechnen, nur wenn sich etwas geändert hat */
    prediction(cm, ball, maxTime) {
      if (!this.enabled || !ball || maxTime <= 0) return null;
      const pw = this.charging ? this.power : this.lastPower;
      const key = ball.x + ',' + ball.y + ',' + this.angle.toFixed(5) + ',' + pw.toFixed(4) + ',' + maxTime;
      if (key !== this.predKey || cm !== this.predCm) {
        const v = P.shotVelocity(this.angle, pw);
        this.pred = P.simulate(cm, ball.x, ball.y, v.vx, v.vy, { record: true, every: 2, maxTime });
        this.predKey = key; this.predCm = cm;
      }
      return this.pred;
    }
    draw(ctx, ball, color, cm, maxTime, t) {
      if (!this.enabled || !ball) return;
      const pred = this.prediction(cm, ball, maxTime);
      if (pred) drawPrediction(ctx, pred, color, { ghost: !this.charging, t });
      drawAim(ctx, ball.x, ball.y, this.angle, this.charging ? this.power : this.lastPower, this.charging ? '#fff' : 'rgba(255,255,255,0.4)');
    }
  }

  /** Animierte Kugel – spielt einen Schlag in Echtzeit ab */
  class BallAnim {
    constructor(cm, from, vx, vy, end, result) {
      this.cm = cm; this.s = P.createState(from.x, from.y, vx, vy); this.end = end; this.result = result; this.acc = 0; this.trail = [];
      this.fade = 0;
    }
    update(dt) {
      if (this.s.done) { this.fade += dt; return; }
      this.acc += Math.min(dt, 0.1);
      while (this.acc >= P.DT && !this.s.done) {
        P.step(this.cm, this.s); this.acc -= P.DT;
        this.trail.push(this.s.x, this.s.y);
        if (this.trail.length > 60) this.trail.splice(0, 2);
      }
      if (this.s.done) {
        this.fade = 0;
        if (this.end && this.result !== 'water') { this.s.x = this.end.x; this.s.y = this.end.y; }
      }
    }
    get done() { return this.s.done; }
    get pos() { return { x: this.s.x, y: this.s.y }; }
  }

  function drawTrail(ctx, trail, color) {
    if (trail.length < 4) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = color;
    for (let i = 2; i < trail.length; i += 2) {
      ctx.globalAlpha = (i / trail.length) * 0.5; ctx.lineWidth = (i / trail.length) * 7;
      ctx.beginPath(); ctx.moveTo(trail[i - 2], trail[i - 1]); ctx.lineTo(trail[i], trail[i + 1]); ctx.stroke();
    }
    ctx.restore();
  }

  const PREVIEW_TIME = { full: 60, long: 4, medium: 1.6, short: 0.5, off: 0 };

  window.Skill = { View, drawMap, drawBall, drawPrediction, drawAim, drawTrail, drawZone, drawSolid, ShotController, BallAnim, PREVIEW_TIME, roundRect };
})();
