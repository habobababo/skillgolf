/* Skillshot – Map-Editor */
(function () {
  const P = window.SkillPhysics, S = window.Skill;
  const $ = (id) => document.getElementById(id);

  const TOOLS = [
    { id: 'select', ic: '🖐', name: 'Auswahl', key: 'V' },
    { id: 'wall', ic: '📏', name: 'Wand', key: 'W' },
    { id: 'block', ic: '🧱', name: 'Block', key: 'B' },
    { id: 'bumper', ic: '🔴', name: 'Bumper', key: 'O' },
    { id: 'sand', ic: '🏖', name: 'Sand', key: 'S' },
    { id: 'ice', ic: '🧊', name: 'Eis', key: 'I' },
    { id: 'water', ic: '🌊', name: 'Wasser', key: 'A' },
    { id: 'slope', ic: '⛰', name: 'Hang', key: 'L' },
    { id: 'boost', ic: '⚡', name: 'Boost', key: 'P' },
    { id: 'start', ic: '🏁', name: 'Abschlag', key: 'T' },
    { id: 'hole', ic: '⛳', name: 'Loch', key: 'H' },
  ];
  const RECT_TYPES = ['block', 'sand', 'ice', 'water', 'slope', 'boost'];
  const NAMES = Object.fromEntries(TOOLS.map((t) => [t.id, t.name]));

  let map = blankMap();
  let tool = 'select';
  let sel = null;          // {kind:'obj', i} | {kind:'start'} | {kind:'hole'}
  let drag = null;
  let mouse = { x: 0, y: 0 };
  const undo = [], redo = [];
  let testing = null;      // Test-Modus-Zustand

  function blankMap() {
    return { name: 'Neue Bahn', author: localStorage.getItem('skillshot.name') || 'Anonym', par: 3, width: 1200, height: 800, start: { x: 120, y: 400 }, hole: { x: 1080, y: 400 }, objects: [] };
  }

  // ------------------------------------------------------------ Toast
  const toasts = document.createElement('div'); toasts.id = 'toasts'; document.body.appendChild(toasts);
  function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; toasts.appendChild(d); setTimeout(() => d.remove(), 3000); }

  // ------------------------------------------------------------ Verlauf
  function snapshot() { return JSON.stringify(map); }
  function pushHistory() { undo.push(snapshot()); if (undo.length > 200) undo.shift(); redo.length = 0; }
  function doUndo() { if (!undo.length) return; redo.push(snapshot()); map = JSON.parse(undo.pop()); sel = null; changed(); }
  function doRedo() { if (!redo.length) return; undo.push(snapshot()); map = JSON.parse(redo.pop()); sel = null; changed(); }

  function changed(skipProps) {
    localStorage.setItem('skillshot.editorDraft', snapshot());
    if (!skipProps) { renderMapProps(); renderSelProps(); }
  }

  // ------------------------------------------------------------ Werkzeugleiste
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="ic">${t.ic}</span>${t.name}<span class="k">${t.key}</span>`;
    b.dataset.tool = t.id;
    b.onclick = () => setTool(t.id);
    $('tools').appendChild(b);
  }
  function setTool(id) {
    tool = id;
    for (const b of $('tools').children) b.classList.toggle('on', b.dataset.tool === id);
  }
  setTool('select');

  // ------------------------------------------------------------ Geometrie
  const grid = () => Number($('gridSize').value);
  function snapV(v, ev) { return $('snap').checked && !(ev && ev.shiftKey) ? Math.round(v / grid()) * grid() : Math.round(v); }
  function norm(o) {
    if (o.w < 0) { o.x += o.w; o.w = -o.w; }
    if (o.h < 0) { o.y += o.h; o.h = -o.h; }
  }
  function distSeg(px, py, o) {
    const dx = o.x2 - o.x1, dy = o.y2 - o.y1, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - o.x1) * dx + (py - o.y1) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (o.x1 + dx * t), py - (o.y1 + dy * t));
  }
  function hit(x, y) {
    const tol = 6 / view.scale;
    if (Math.hypot(x - map.hole.x, y - map.hole.y) < P.HOLE_R + tol) return { kind: 'hole' };
    if (Math.hypot(x - map.start.x, y - map.start.y) < 20 + tol) return { kind: 'start' };
    for (let i = map.objects.length - 1; i >= 0; i--) {
      const o = map.objects[i];
      if (o.type === 'wall') { if (distSeg(x, y, o) < (o.t || 14) / 2 + tol) return { kind: 'obj', i }; }
      else if (o.type === 'bumper') { if (Math.hypot(x - o.x, y - o.y) < o.r + tol) return { kind: 'obj', i }; }
      else if (x >= o.x - tol && x <= o.x + o.w + tol && y >= o.y - tol && y <= o.y + o.h + tol) return { kind: 'obj', i };
    }
    return null;
  }
  function handles(o) {
    if (o.type === 'wall') return [{ x: o.x1, y: o.y1, h: 'p1' }, { x: o.x2, y: o.y2, h: 'p2' }];
    if (o.type === 'bumper') return [{ x: o.x + o.r, y: o.y, h: 'r' }];
    return [
      { x: o.x, y: o.y, h: 'nw' }, { x: o.x + o.w, y: o.y, h: 'ne' },
      { x: o.x, y: o.y + o.h, h: 'sw' }, { x: o.x + o.w, y: o.y + o.h, h: 'se' },
    ];
  }
  function selObj() { return sel && sel.kind === 'obj' ? map.objects[sel.i] : null; }

  // ------------------------------------------------------------ Maus
  const canvas = $('ecv');
  const view = new S.View(canvas);
  view.pad = 30;

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (testing) return;
    const w = view.toWorld(e.clientX, e.clientY);
    const h = hit(w.x, w.y);
    if (h && h.kind === 'obj') { pushHistory(); map.objects.splice(h.i, 1); sel = null; changed(); }
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (testing || e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const w = view.toWorld(e.clientX, e.clientY);
    const sx = snapV(w.x, e), sy = snapV(w.y, e);

    if (tool === 'select') {
      // erst Griffe des aktuellen Objekts
      const o = selObj();
      if (o) {
        for (const hd of handles(o)) {
          if (Math.hypot(w.x - hd.x, w.y - hd.y) < 9 / view.scale) {
            pushHistory();
            drag = { mode: 'handle', h: hd.h, orig: JSON.parse(JSON.stringify(o)) };
            return;
          }
        }
      }
      sel = hit(w.x, w.y);
      renderSelProps();
      if (sel) {
        pushHistory();
        const target = sel.kind === 'obj' ? map.objects[sel.i] : map[sel.kind];
        drag = { mode: 'move', sx: w.x, sy: w.y, orig: JSON.parse(JSON.stringify(target)), moved: false };
      }
      return;
    }
    if (tool === 'start' || tool === 'hole') {
      pushHistory(); map[tool] = { x: sx, y: sy }; sel = { kind: tool }; changed(); return;
    }
    pushHistory();
    let o;
    if (tool === 'wall') o = { type: 'wall', x1: sx, y1: sy, x2: sx, y2: sy, t: P.DEFAULTS.wall.t };
    else if (tool === 'bumper') o = { type: 'bumper', x: sx, y: sy, r: P.DEFAULTS.bumper.r };
    else {
      o = { type: tool, x: sx, y: sy, w: 0, h: 0 };
      if (tool === 'slope' || tool === 'boost') { o.angle = 0; o.strength = P.DEFAULTS[tool].strength; }
    }
    map.objects.push(o);
    sel = { kind: 'obj', i: map.objects.length - 1 };
    drag = { mode: 'create', ax: sx, ay: sy };
  });

  canvas.addEventListener('pointermove', (e) => {
    const w = view.toWorld(e.clientX, e.clientY);
    mouse = w;
    if (!drag || testing) return;
    const sx = snapV(w.x, e), sy = snapV(w.y, e);
    if (drag.mode === 'move') {
      let dx = w.x - drag.sx, dy = w.y - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
      const g = $('snap').checked && !e.shiftKey ? grid() : 1;
      dx = Math.round(dx / g) * g; dy = Math.round(dy / g) * g;
      const O = drag.orig;
      if (sel.kind !== 'obj') { map[sel.kind] = { x: snapV(O.x + dx, e), y: snapV(O.y + dy, e) }; }
      else {
        const o = map.objects[sel.i];
        if (o.type === 'wall') { o.x1 = O.x1 + dx; o.y1 = O.y1 + dy; o.x2 = O.x2 + dx; o.y2 = O.y2 + dy; }
        else { o.x = O.x + dx; o.y = O.y + dy; }
      }
      renderSelProps();
    } else if (drag.mode === 'handle') {
      const o = selObj(), O = drag.orig;
      if (drag.h === 'p1') { o.x1 = sx; o.y1 = sy; }
      else if (drag.h === 'p2') { o.x2 = sx; o.y2 = sy; }
      else if (drag.h === 'r') { o.r = Math.max(6, Math.round(Math.hypot(w.x - o.x, w.y - o.y))); }
      else {
        let x1 = O.x, y1 = O.y, x2 = O.x + O.w, y2 = O.y + O.h;
        if (drag.h.includes('w')) x1 = sx; else x2 = sx;
        if (drag.h.includes('n')) y1 = sy; else y2 = sy;
        o.x = Math.min(x1, x2); o.y = Math.min(y1, y2); o.w = Math.abs(x2 - x1); o.h = Math.abs(y2 - y1);
      }
      renderSelProps();
    } else if (drag.mode === 'create') {
      const o = selObj();
      if (o.type === 'wall') { o.x2 = sx; o.y2 = sy; }
      else if (o.type === 'bumper') { o.r = Math.max(8, Math.round(Math.hypot(w.x - o.x, w.y - o.y))) || P.DEFAULTS.bumper.r; }
      else { o.x = Math.min(drag.ax, sx); o.y = Math.min(drag.ay, sy); o.w = Math.abs(sx - drag.ax); o.h = Math.abs(sy - drag.ay); }
    }
  });

  window.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.mode === 'create') {
      const o = selObj();
      // zu kleine Objekte verwerfen / Standardgröße
      if (o.type === 'wall' && Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 4) { map.objects.pop(); sel = null; undo.pop(); }
      else if (o.type === 'bumper' && o.r < 8) o.r = P.DEFAULTS.bumper.r;
      else if (RECT_TYPES.includes(o.type) && (o.w < 4 || o.h < 4)) { map.objects.pop(); sel = null; undo.pop(); }
    }
    if (drag.mode === 'move' && !drag.moved) undo.pop(); // nur ausgewählt
    drag = null;
    changed();
  });

  // ------------------------------------------------------------ Tastatur
  window.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (testing) { if (e.code === 'Escape') stopTest(); return; }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicate(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return; }
    if (e.key === 'Escape') { sel = null; renderSelProps(); setTool('select'); return; }
    if (e.key.startsWith('Arrow') && selObj()) {
      e.preventDefault();
      const d = e.shiftKey ? grid() : 1, o = selObj();
      const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
      const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      pushHistory();
      if (o.type === 'wall') { o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; } else { o.x += dx; o.y += dy; }
      changed();
      return;
    }
    const t = TOOLS.find((t) => t.key.toLowerCase() === k);
    if (t && !e.ctrlKey && !e.metaKey && !e.altKey) setTool(t.id);
  });

  function deleteSel() {
    if (!selObj()) return;
    pushHistory(); map.objects.splice(sel.i, 1); sel = null; changed();
  }
  function duplicate() {
    const o = selObj(); if (!o) return;
    pushHistory();
    const c = JSON.parse(JSON.stringify(o)), d = grid() * 2;
    if (c.type === 'wall') { c.x1 += d; c.x2 += d; c.y1 += d; c.y2 += d; } else { c.x += d; c.y += d; }
    map.objects.push(c); sel = { kind: 'obj', i: map.objects.length - 1 }; changed();
  }

  // ------------------------------------------------------------ Eigenschaften
  function bindMapField(id, key, isNum) {
    $(id).addEventListener('change', () => {
      pushHistory();
      let v = $(id).value;
      if (isNum) v = Number(v) || 0;
      map[key] = v;
      if (key === 'width' || key === 'height') map[key] = Math.max(300, Math.min(4000, v));
      if (key === 'par') map.par = Math.max(1, Math.min(7, Math.round(v)));
      changed();
    });
  }
  bindMapField('mName', 'name'); bindMapField('mAuthor', 'author');
  bindMapField('mPar', 'par', true); bindMapField('mW', 'width', true); bindMapField('mH', 'height', true);
  function renderMapProps() {
    $('mName').value = map.name; $('mAuthor').value = map.author; $('mPar').value = map.par;
    $('mW').value = map.width; $('mH').value = map.height;
  }

  const FIELDS = {
    wall: [['x1', 'X1'], ['y1', 'Y1'], ['x2', 'X2'], ['y2', 'Y2'], ['t', 'Dicke']],
    block: [['x', 'X'], ['y', 'Y'], ['w', 'Breite'], ['h', 'Höhe']],
    bumper: [['x', 'X'], ['y', 'Y'], ['r', 'Radius']],
    sand: [['x', 'X'], ['y', 'Y'], ['w', 'Breite'], ['h', 'Höhe']],
    ice: [['x', 'X'], ['y', 'Y'], ['w', 'Breite'], ['h', 'Höhe']],
    water: [['x', 'X'], ['y', 'Y'], ['w', 'Breite'], ['h', 'Höhe']],
    slope: [['x', 'X'], ['y', 'Y'], ['w', 'Breite'], ['h', 'Höhe'], ['angle', 'Richtung °'], ['strength', 'Stärke']],
    boost: [['x', 'X'], ['y', 'Y'], ['w', 'Breite'], ['h', 'Höhe'], ['angle', 'Richtung °'], ['strength', 'Stärke']],
    start: [['x', 'X'], ['y', 'Y']],
    hole: [['x', 'X'], ['y', 'Y']],
  };

  function renderSelProps() {
    const box = $('selProps');
    if (!sel) { box.innerHTML = '<p class="muted">Nichts ausgewählt</p>'; return; }
    const o = sel.kind === 'obj' ? map.objects[sel.i] : map[sel.kind];
    const type = sel.kind === 'obj' ? o.type : sel.kind;
    if (!o) { sel = null; return renderSelProps(); }
    // bestehende Felder nur aktualisieren, wenn gleiche Auswahl (Fokus erhalten)
    const sig = type + ':' + (sel.i ?? '');
    if (box.dataset.sig === sig) {
      for (const inp of box.querySelectorAll('input[data-k]')) if (document.activeElement !== inp) inp.value = round(o[inp.dataset.k]);
      return;
    }
    box.dataset.sig = sig;
    let h = `<p><b>${NAMES[type]}</b></p><div class="grid2">`;
    for (const [k, l] of FIELDS[type]) h += `<label>${l}<input type="number" data-k="${k}" value="${round(o[k])}"></label>`;
    h += '</div>';
    if (type === 'slope' || type === 'boost') {
      h += '<div class="row" style="flex-wrap:wrap">' + [['→', 0], ['↘', 45], ['↓', 90], ['↙', 135], ['←', 180], ['↖', 225], ['↑', 270], ['↗', 315]]
        .map(([s, a]) => `<button class="small ghost" data-angle="${a}">${s}</button>`).join('') + '</div>';
      h += `<p class="muted small">${type === 'slope' ? 'Hang: konstante Kraft (Gras-Haftung ≈ 220). Unter 220 bleibt ein liegender Ball liegen.' : 'Boost: starke Beschleunigung in Pfeilrichtung.'}</p>`;
    }
    if (sel.kind === 'obj') {
      h += '<div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="small" id="pDup">Duplizieren</button><button class="small ghost" id="pFront">Nach vorn</button><button class="small ghost" id="pBack">Nach hinten</button><button class="small ghost" id="pDel">Löschen</button></div>';
    }
    box.innerHTML = h;
    for (const inp of box.querySelectorAll('input[data-k]')) {
      inp.addEventListener('change', () => {
        pushHistory();
        const t = sel.kind === 'obj' ? map.objects[sel.i] : map[sel.kind];
        t[inp.dataset.k] = Number(inp.value) || 0;
        if (RECT_TYPES.includes(t.type)) norm(t);
        changed();
      });
    }
    for (const b of box.querySelectorAll('[data-angle]')) b.onclick = () => { pushHistory(); map.objects[sel.i].angle = Number(b.dataset.angle); box.dataset.sig = ''; changed(); };
    if ($('pDup')) {
      $('pDup').onclick = duplicate;
      $('pDel').onclick = deleteSel;
      $('pFront').onclick = () => { pushHistory(); const [o2] = map.objects.splice(sel.i, 1); map.objects.push(o2); sel.i = map.objects.length - 1; box.dataset.sig = ''; changed(); };
      $('pBack').onclick = () => { pushHistory(); const [o2] = map.objects.splice(sel.i, 1); map.objects.unshift(o2); sel.i = 0; box.dataset.sig = ''; changed(); };
    }
  }
  function round(v) { return Math.round((Number(v) || 0) * 100) / 100; }

  // ------------------------------------------------------------ Laden / Speichern
  async function refreshList() {
    const sel = $('loadSel');
    try {
      const list = await (await fetch('/api/maps')).json();
      sel.innerHTML = '<option value="">Map laden …</option>' + list.map((m) => `<option value="${m.id}">${m.kind === 'custom' ? '★ ' : ''}${escapeHtml(m.name)} (Par ${m.par})</option>`).join('');
      return list;
    } catch { return []; }
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  $('loadSel').onchange = async () => {
    const id = $('loadSel').value; if (!id) return;
    try {
      const m = await (await fetch('/api/maps/' + encodeURIComponent(id))).json();
      if (m.error) throw new Error(m.error);
      pushHistory(); map = m; sel = null; changed();
      if (id.startsWith('builtin:')) toast('Eingebaute Map geladen – Speichern legt eine eigene Kopie an');
    } catch (e) { toast('Laden fehlgeschlagen: ' + e.message); }
    $('loadSel').value = '';
  };

  function validate() {
    const cm = P.compile(map);
    const probs = [];
    const R = P.BALL_R;
    const inSolid = (pt) => map.objects.some((o) => {
      if (o.type === 'wall') return distSeg(pt.x, pt.y, o) < (o.t || 14) / 2 + R;
      if (o.type === 'bumper') return Math.hypot(pt.x - o.x, pt.y - o.y) < o.r + R;
      if (o.type === 'block') return pt.x > o.x - R && pt.x < o.x + o.w + R && pt.y > o.y - R && pt.y < o.y + o.h + R;
      return false;
    });
    if (map.start.x < 0 || map.start.y < 0 || map.start.x > map.width || map.start.y > map.height) probs.push('Abschlag liegt außerhalb');
    if (map.hole.x < 0 || map.hole.y < 0 || map.hole.x > map.width || map.hole.y > map.height) probs.push('Loch liegt außerhalb');
    if (inSolid(map.start)) probs.push('Abschlag steckt in einem Hindernis');
    if (inSolid(map.hole)) probs.push('Loch steckt in einem Hindernis');
    if (cm.zones.some((z) => z.kind === 'water' && map.start.x >= z.x1 && map.start.x <= z.x2 && map.start.y >= z.y1 && map.start.y <= z.y2)) probs.push('Abschlag liegt im Wasser');
    return probs;
  }

  async function save() {
    const probs = validate();
    if (probs.length && !confirm('Probleme gefunden:\n- ' + probs.join('\n- ') + '\n\nTrotzdem speichern?')) return;
    const list = await refreshList();
    const slug = map.name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (list.some((m) => m.id === 'custom:' + slug) && !confirm(`Eigene Map „${map.name}“ existiert bereits. Überschreiben?`)) return;
    localStorage.setItem('skillshot.name', map.author);
    try {
      const r = await (await fetch('/api/maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(map) })).json();
      if (r.error) throw new Error(r.error);
      toast('Gespeichert ✔ – im Spiel unter „eigene“ wählbar');
      refreshList();
    } catch (e) { toast('Speichern fehlgeschlagen: ' + e.message); }
  }
  $('bSave').onclick = save;
  $('bNew').onclick = () => { if (confirm('Neue leere Map? (Rückgängig möglich)')) { pushHistory(); map = blankMap(); sel = null; changed(); } };
  $('bUndo').onclick = doUndo; $('bRedo').onclick = doRedo;
  $('bExport').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(P.sanitizeMap(map), null, 1)], { type: 'application/json' }));
    a.download = (map.name || 'map').replace(/[^\w-]+/g, '_') + '.json';
    a.click(); URL.revokeObjectURL(a.href);
  };
  $('bImport').onclick = () => $('fileIn').click();
  $('fileIn').onchange = async () => {
    const f = $('fileIn').files[0]; if (!f) return;
    try { const m = P.sanitizeMap(JSON.parse(await f.text())); pushHistory(); map = m; sel = null; changed(); toast('Importiert'); }
    catch (e) { toast('Import fehlgeschlagen: ' + e.message); }
    $('fileIn').value = '';
  };

  // ------------------------------------------------------------ Test-Modus
  const fx = new S.FX(), sfx = new S.SFX();
  const ctrl = new S.ShotController(canvas, view, {
    fx, sfx, color: () => '#ffe03a',
    canShoot: () => !!testing && !testing.anim && !testing.done,
    getPucks: () => (testing ? { list: testing.pucks, ver: testing.pver } : null),
    shotMode: () => testMode(),
    onShoot: (angle, power) => {
      const mode = testMode();
      const v = P.shotVelocity(angle, power, mode);
      if (mode === 'ult') testing.ultUsed = true;
      testing.shots++;
      testing.from = { ...testing.ball };
      testing.anim = new S.BallAnim(testing.cm, testing.ball, v.vx, v.vy, null, null, { pucks: testing.pucks, mode, local: true });
    },
  });
  function testMode() { return testing && !testing.done ? P.shotMode(testing.shots + 1, testing.ultUsed) : null; }
  function steer(st, a) {
    const m = ctrl.mouse;
    if (!m) return [0, 0];
    const dx = m.x - st.x, dy = m.y - st.y, d = Math.hypot(dx, dy);
    if (d < 2) return [0, 0];
    const k = (a && a.mc ? a.mc.steerAccel : P.config.ultimate.steerAccel) * Math.min(1, d / 150) / d;
    return [Math.round(dx * k), Math.round(dy * k)];
  }
  function startTest() {
    const probs = validate();
    if (probs.length) toast('⚠ ' + probs.join(', '));
    sel = null; renderSelProps();
    const m = P.sanitizeMap(map);
    const tcm = P.compile(m);
    testing = { cm: tcm, ball: { ...m.start }, shots: 0, anim: null, done: false, pucks: P.spawnPucks(tcm, (Math.random() * 2 ** 31) | 0), pver: 0, ultUsed: false };
    $('bTest').textContent = '■ Test beenden';
    $('testInfo').classList.remove('hidden');
    canvas.style.cursor = 'crosshair';
  }
  function stopTest() {
    testing = null; $('bTest').textContent = '▶ Testen'; $('testInfo').classList.add('hidden'); canvas.style.cursor = '';
  }
  $('bTest').onclick = () => (testing ? stopTest() : startTest());

  function updateTest(dt) {
    const T = testing;
    if (T.anim) {
      T.anim.update(dt, steer);
      S.animFx(T.anim, fx, sfx, '#ffe03a', map, dt);
      T.ball = T.anim.pos;
      if (T.anim.done) {
        const r = T.anim.s.result;
        T.pucks = P.exportPucks(T.anim.s); T.pver++;
        T.lastTrail = T.anim.trail; T.trailFade = 0;
        T.anim = null;
        if (r === 'water') { T.ball = T.from; toast('💦 Wasser – zurück'); }
        if (r === 'sunk') { T.done = true; toast(`⛳ Eingelocht mit ${T.shots} Schlag/Schlägen (Par ${map.par})`); }
        else if (T.shots >= P.MAX_SHOTS) { T.done = true; toast('Keine Schläge mehr'); }
        const nm = testMode();
        if (nm === 'ult') { toast('⚡ next BALL is ULTIMATE BALL'); sfx.alarm(); fx.screen(0.5, '255,46,136'); }
        else if (nm === 'sling') { toast('🌀 next BALL is SLING BALL'); sfx.sling(); }
      }
    }
    $('testInfo').textContent = T.done ? `Fertig – ${T.shots} Schläge · Leertaste/Klick = neu starten · Esc = beenden` : `Test · Schlag ${T.shots + 1}/${P.MAX_SHOTS} · Klicken & ziehen = Kraft · Esc beendet`;
  }
  canvas.addEventListener('pointerdown', () => { if (testing && testing.done) startTest(); });

  // ------------------------------------------------------------ Zeichnen
  function drawGrid(ctx) {
    const g = grid(); if (g * view.scale < 5) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1 / view.scale;
    ctx.beginPath();
    for (let x = 0; x <= map.width; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, map.height); }
    for (let y = 0; y <= map.height; y += g) { ctx.moveTo(0, y); ctx.lineTo(map.width, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    for (let x = 0; x <= map.width; x += g * 10) { ctx.moveTo(x, 0); ctx.lineTo(x, map.height); }
    for (let y = 0; y <= map.height; y += g * 10) { ctx.moveTo(0, y); ctx.lineTo(map.width, y); }
    ctx.stroke();
  }
  function outline(ctx, s, color) {
    const o = s.kind === 'obj' ? map.objects[s.i] : null;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2 / view.scale; ctx.setLineDash([6 / view.scale, 4 / view.scale]);
    ctx.beginPath();
    if (!o) ctx.arc(map[s.kind].x, map[s.kind].y, s.kind === 'hole' ? P.HOLE_R + 6 : 24, 0, 7);
    else if (o.type === 'wall') {
      const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), t = (o.t || 14) / 2 + 4;
      const nx = -Math.sin(a) * t, ny = Math.cos(a) * t;
      ctx.moveTo(o.x1 + nx, o.y1 + ny); ctx.lineTo(o.x2 + nx, o.y2 + ny); ctx.moveTo(o.x1 - nx, o.y1 - ny); ctx.lineTo(o.x2 - nx, o.y2 - ny);
    } else if (o.type === 'bumper') ctx.arc(o.x, o.y, o.r + 4, 0, 7);
    else ctx.rect(o.x - 3, o.y - 3, o.w + 6, o.h + 6);
    ctx.stroke(); ctx.restore();
    if (o) {
      ctx.fillStyle = '#ffcf3f'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1 / view.scale;
      const r = 5 / view.scale;
      for (const hd of handles(o)) { ctx.fillRect(hd.x - r, hd.y - r, r * 2, r * 2); ctx.strokeRect(hd.x - r, hd.y - r, r * 2, r * 2); }
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    view.fit(map.width, map.height);
    const ws = testing && testing.anim && testing.anim.steering ? testing.anim.timeScale : 1;
    if (testing) { fx.ambient(map, dt * ws); }
    fx.update(dt * ws);
    view.begin(fx);
    const ctx = view.ctx;
    S.drawMap(ctx, map, t, { view, cache: false, fx });
    if (testing) {
      updateTest(dt);
      if (testing) {
        S.drawPucks(ctx, testing.anim ? testing.anim.pucks : testing.pucks, t);
        if (testing.anim) S.drawTrail(ctx, testing.anim.trail, '#ffe03a');
        else if (testing.lastTrail) { testing.trailFade += dt; S.drawTrail(ctx, testing.lastTrail, '#ffe03a', Math.max(0, 1 - testing.trailFade / 4)); }
        if (!(testing.done && !testing.anim && Math.hypot(testing.ball.x - testing.cm.hole.x, testing.ball.y - testing.cm.hole.y) < 1)) S.drawBall(ctx, testing.ball.x, testing.ball.y, '#ffe03a');
        ctrl.update(dt, testing.ball);
        ctrl.draw(ctx, testing.ball, '#ffe03a', testing.cm, 60, t, 1); // Editor: volle Vorschau
      }
    } else {
      if (!drag || drag.mode !== 'create') drawGrid(ctx);
      else drawGrid(ctx);
      // Hover
      if (tool === 'select' && !drag) { const h = hit(mouse.x, mouse.y); if (h && !(sel && h.kind === sel.kind && h.i === sel.i)) outline(ctx, h, 'rgba(255,255,255,0.5)'); }
      if (sel) outline(ctx, sel, '#ffcf3f');
      // Fadenkreuz-Vorschau
      if (tool !== 'select') {
        const x = snapV(mouse.x), y = snapV(mouse.y);
        ctx.strokeStyle = 'rgba(255,207,63,0.8)'; ctx.lineWidth = 1 / view.scale;
        ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10); ctx.stroke();
        ctx.fillStyle = 'rgba(255,224,58,0.9)'; ctx.font = `${12 / view.scale}px system-ui`;
        ctx.fillText(`${x}, ${y}`, x + 12 / view.scale, y - 8 / view.scale);
      }
    }
    fx.draw(ctx);
    if (testing && testing.anim && testing.anim.steering) S.drawUltOverlay(ctx, view, testing.anim, ctrl.mouse, t);
    fx.drawScreen(ctx, canvas.width, canvas.height);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ Start
  try {
    const d = localStorage.getItem('skillshot.editorDraft');
    if (d) map = P.sanitizeMap(JSON.parse(d));
  } catch { /* leer */ }
  fetch('/api/config').then((r) => r.json()).then((c) => P.configure(c)).catch(() => {});
  renderMapProps(); renderSelProps(); refreshList();
  requestAnimationFrame(frame);
})();
