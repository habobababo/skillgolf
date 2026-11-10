'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const P = require('./shared/physics');

const PORT = Number(process.env.PORT) || 3100;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');
const BUILTIN = path.join(ROOT, 'maps', 'builtin');
const CUSTOM = path.join(ROOT, 'maps', 'custom');
fs.mkdirSync(CUSTOM, { recursive: true });

// ---------------------------------------------------------------- Konfiguration (config.json, live neu geladen)
const CONFIG_FILE = path.join(ROOT, 'config.json');
function loadConfig(initial) {
  let raw = {};
  try { if (fs.existsSync(CONFIG_FILE)) raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch (e) { console.warn('config.json fehlerhaft, behalte alte Werte:', e.message); return false; }
  P.configure(raw);
  console.log(initial ? 'Konfiguration geladen' : 'Konfiguration neu geladen', fs.existsSync(CONFIG_FILE) ? '(config.json)' : '(Standardwerte)');
  return true;
}
loadConfig(true);
fs.watchFile(CONFIG_FILE, { interval: 1000 }, () => {
  if (!loadConfig(false)) return;
  for (const room of rooms.values()) if (room.map) room.cm = P.compile(room.map);
  for (const room of rooms.values()) { broadcast(room, { type: 'config', config: P.config }); broadcast(room, { type: 'toast', text: 'Spielwerte wurden geändert' }); }
});

// ---------------------------------------------------------------- Maps
function slug(s) {
  return String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'map';
}
function readMapsDir(dir, kind) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      out.push({ id: `${kind}:${f.slice(0, -5)}`, kind, name: m.name, author: m.author, par: m.par, difficulty: ['easy', 'medium', 'hard'].includes(m.difficulty) ? m.difficulty : 'medium', objects: (m.objects || []).length });
    } catch (e) { console.warn('Map defekt:', f, e.message); }
  }
  return out;
}
const DIFF_ORDER = { easy: 0, medium: 1, hard: 2 };
function listMaps() {
  // sortiert: eingebaut vor eigenen, innerhalb nach Schwierigkeit (Dateireihenfolge bleibt erhalten)
  const sortD = (a) => a.sort((x, y) => DIFF_ORDER[x.difficulty] - DIFF_ORDER[y.difficulty]);
  return [...sortD(readMapsDir(BUILTIN, 'builtin')), ...sortD(readMapsDir(CUSTOM, 'custom'))];
}
function loadMap(id) {
  const m = /^(builtin|custom):([a-z0-9-]+)$/.exec(String(id));
  if (!m) return null;
  const file = path.join(m[1] === 'builtin' ? BUILTIN : CUSTOM, m[2] + '.json');
  if (!fs.existsSync(file)) return null;
  return P.sanitizeMap(JSON.parse(fs.readFileSync(file, 'utf8')));
}

// ---------------------------------------------------------------- HTTP
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function serveFile(res, base, rel) {
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep) && file !== base) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  if (p === '/api/config') return sendJson(res, 200, P.config);
  if (p === '/api/maps' && req.method === 'GET') return sendJson(res, 200, listMaps());
  if (p.startsWith('/api/maps/') && req.method === 'GET') {
    try {
      const m = loadMap(p.slice(10));
      return m ? sendJson(res, 200, m) : sendJson(res, 404, { error: 'Map nicht gefunden' });
    } catch (e) { return sendJson(res, 500, { error: e.message }); }
  }
  if (p === '/api/maps' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 512 * 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const m = P.sanitizeMap(JSON.parse(body));
        const id = slug(m.name);
        fs.writeFileSync(path.join(CUSTOM, id + '.json'), JSON.stringify(m, null, 1));
        sendJson(res, 200, { ok: true, id: 'custom:' + id });
      } catch (e) { sendJson(res, 400, { error: e.message }); }
    });
    return;
  }
  if (p.startsWith('/api/maps/custom:') && req.method === 'DELETE') {
    const id = p.slice('/api/maps/custom:'.length);
    if (!/^[a-z0-9-]+$/.test(id)) return sendJson(res, 400, { error: 'Ungültige ID' });
    const f = path.join(CUSTOM, id + '.json');
    if (fs.existsSync(f)) fs.unlinkSync(f);
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/avatars') {
    // Standard-Profilbilder pro Spielerplatz: public/avatars/player<N>.<jpg|jpeg|png|webp>
    const out = {};
    try {
      for (const f of fs.readdirSync(path.join(PUBLIC, 'avatars'))) {
        const m = /^player([1-8])\.(jpe?g|png|webp)$/i.exec(f);
        if (m) out[m[1]] = '/avatars/' + encodeURIComponent(f);
      }
    } catch { /* Ordner fehlt */ }
    return sendJson(res, 200, out);
  }
  if (p.startsWith('/shared/')) return serveFile(res, SHARED, p.slice(8));
  if (p === '/' ) return serveFile(res, PUBLIC, 'index.html');
  if (p === '/editor') return serveFile(res, PUBLIC, 'editor.html');
  return serveFile(res, PUBLIC, p.slice(1));
});

// ---------------------------------------------------------------- Räume
const COLORS = ['#ff3860', '#3ec5ff', '#ffe03a', '#3dff7a', '#c36bff', '#ff9a3c', '#00ffe1', '#ff5edb'];
const rooms = new Map();
let nextId = 1;

function code() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}
/** Profilbild: nur kleine Base64-Bilder (Client skaliert auf 128×128) */
function validAvatar(d) {
  if (typeof d !== 'string' || d.length > 60000) return null;
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d) ? d : null;
}
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg) { const s = JSON.stringify(msg); for (const p of room.players) if (p.ws.readyState === 1) p.ws.send(s); }

function publicRoom(room) {
  return {
    code: room.code, hostId: room.hostId, phase: room.phase, holeIndex: room.holeIndex,
    playlist: room.playlist, settings: room.settings, ultBy: room.ult ? room.ult.pid : null,
    turn: publicTurn(room),
    players: room.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || null, ultUsed: !!p.ultUsed, scores: p.scores, points: p.points, bonus: p.bonus || 0, shots: p.shots, done: p.done, sunk: p.sunk,
      magnet: !!p.magnet, magnetLeft: p.magnetLeft ?? 0,
      ball: p.ball,
    })),
  };
}
function syncRoom(room) { broadcast(room, { type: 'room', room: publicRoom(room) }); }

function freeColor(room) {
  const used = new Set(room.players.map((p) => p.color));
  return COLORS.find((c) => !used.has(c)) || COLORS[room.players.length % COLORS.length];
}

function startHole(room) {
  room.phase = 'playing';
  const entry = room.playlist[room.holeIndex];
  let map;
  try { map = loadMap(entry.id); } catch (e) { map = null; }
  if (!map) { broadcast(room, { type: 'toast', text: `Map ${entry.name} fehlt – übersprungen` }); return nextHole(room); }
  room.map = map;
  room.cm = P.compile(map);
  room.pucks = P.spawnPucks(room.cm, (Math.random() * 2 ** 31) | 0);
  endUltimate(room, true);
  for (const p of room.players) {
    p.ball = { x: room.cm.start.x, y: room.cm.start.y };
    p.shots = 0; p.done = false; p.sunk = false; p.busyUntil = 0; p.ultUsed = false;
    p.magnet = false; p.magnetLeft = P.config.magnet.usesPerHole;
    p.bonus = 0; p.puckBonus = 0;
    while (p.scores.length < room.holeIndex) p.scores.push(null);
    while (p.points.length < room.holeIndex) p.points.push(null);
  }
  broadcast(room, { type: 'hole', index: room.holeIndex, total: room.playlist.length, map, config: P.config, pucks: room.pucks });
  // reihum: jede Bahn beginnt ein anderer Spieler
  clearTurn(room);
  beginTurn(room, room.players[room.holeIndex % room.players.length].id);
}

// ---------------------------------------------------------------- Züge (reihum)
/*
 * Zustand room.turn = { id, seq, phase, ... }
 *   'aim'    – Spieler id darf schlagen (Zeitlimit läuft), andere dürfen magnetisieren
 *   'flight' – Schlag läuft; Ende erst, wenn das Ergebnis feststeht (resolved) UND alle
 *              Browser „Animation fertig“ gemeldet haben (oder ein Sicherheits-Timeout greift)
 */
const ACK_SLACK = 4000;      // ms Puffer für Netz/Animation nach der berechneten Rollzeit
let BUILD = String(Date.now());

function publicTurn(room) {
  const t = room.turn;
  if (!t) return null;
  return { id: t.id, seq: t.seq, phase: t.phase, left: t.deadline ? Math.max(0, t.deadline - Date.now()) : 0 };
}
function clearTurn(room) {
  if (room.turn) { clearTimeout(room.turn.timer); clearTimeout(room.turn.force); }
  room.turn = null;
}
function beginTurn(room, id) {
  clearTurn(room);
  room.turnSeq = (room.turnSeq || 0) + 1;
  const T = P.config.turn.timeLimit;
  const t = room.turn = { id, seq: room.turnSeq, phase: 'aim', deadline: T ? Date.now() + T * 1000 : 0, idx: room.players.findIndex((q) => q.id === id) };
  for (const q of room.players) q.magnet = false;
  if (T) t.timer = setTimeout(() => {
    if (room.turn !== t || t.phase !== 'aim') return;
    const q = room.players.find((x) => x.id === id);
    broadcast(room, { type: 'toast', text: `⏱ ${q ? q.name : 'Spieler'}: Zeit abgelaufen` });
    endTurn(room);
  }, T * 1000);
  syncRoom(room);
  broadcast(room, { type: 'turn', turn: publicTurn(room) });
}
/** Schlag hat begonnen */
function turnFlight(room) {
  const t = room.turn;
  clearTimeout(t.timer);
  t.phase = 'flight'; t.deadline = 0; t.resolved = false;
  t.expect = new Set(room.players.filter((q) => q.ws.readyState === 1).map((q) => q.id));
  t.acks = new Set();
}
/** Ergebnis steht fest; restMs = wie lange Ball/Pucks danach noch rollen */
function turnResolved(room, restMs, extra) {
  const t = room.turn;
  if (!t || t.phase !== 'flight') return;
  t.resolved = true;
  clearTimeout(t.force);
  t.force = setTimeout(() => { if (room.turn === t) endTurn(room); }, restMs + ACK_SLACK + (extra || 0));
  tryEndTurn(room);
}
function tryEndTurn(room) {
  const t = room.turn;
  if (!t || t.phase !== 'flight' || !t.resolved || t.ending) return;
  for (const id of t.expect) {
    const q = room.players.find((x) => x.id === id);
    if (q && q.ws.readyState === 1 && !t.acks.has(id)) return;
  }
  t.ending = true;
  setTimeout(() => { if (room.turn === t) endTurn(room); }, 250);
}
/** nächster Spieler (der noch nicht fertig ist) – oder Bahnende */
function endTurn(room) {
  const t = room.turn;
  clearTurn(room);
  if (room.phase !== 'playing') return;
  const n = room.players.length;
  if (!n || room.players.every((q) => q.done)) { syncRoom(room); return holeEnd(room); }
  let i = t ? room.players.findIndex((q) => q.id === t.id) : -1;
  if (i < 0 && t) i = t.idx - 1;          // Spieler am Zug ist gegangen
  for (let k = 1; k <= n; k++) {
    const q = room.players[(((i + k) % n) + n) % n];
    if (!q.done) return beginTurn(room, q.id);
  }
}
function holeEnd(room) {
  if (room.phase !== 'playing' || room.endPending) return;
  room.endPending = true;
  room.timer = setTimeout(() => {
    room.endPending = false;
    if (room.phase !== 'playing') return;
    room.phase = 'holeEnd';
    syncRoom(room);
    broadcast(room, { type: 'holeEnd', index: room.holeIndex });
    room.timer = setTimeout(() => nextHole(room), P.config.holeEndDelay * 1000);
  }, 600);
}

/** wartender Spieler magnetisiert seinen Ball für den nächsten Schlag des Gegners */
function handleMagnet(room, p) {
  const t = room.turn;
  if (room.phase !== 'playing' || !t || t.id === p.id) return send(p.ws, { type: 'error', text: 'Magnet nur, wenn ein anderer dran ist' });
  if (p.done) return send(p.ws, { type: 'error', text: 'Magnet nur, solange du selbst noch auf der Bahn spielst' });
  if (t.phase !== 'aim') return send(p.ws, { type: 'error', text: 'Zu spät – der Ball ist schon unterwegs' });
  if (!p.ball || p.sunk || p.magnet || (p.magnetLeft || 0) <= 0) return;
  const tp = room.players.find((q) => q.id === t.id);
  if (tp && tp.ball && Math.hypot(tp.ball.x - p.ball.x, tp.ball.y - p.ball.y) < P.BALL_R * 2 + 0.5) return send(p.ws, { type: 'error', text: 'Zu nah am Ball des Gegners' });
  p.magnet = true; p.magnetLeft--; p.magnetAt = Date.now();
  broadcast(room, { type: 'magnet', id: p.id });
  syncRoom(room);
}

function nextHole(room) {
  clearTimeout(room.timer); clearTurn(room); room.endPending = false;
  room.holeIndex++;
  if (room.holeIndex >= room.playlist.length) {
    room.phase = 'finished';
    syncRoom(room);
    broadcast(room, { type: 'finished' });
    return;
  }
  startHole(room);
}

function finishPlayer(room, p, sunk) {
  p.done = true; p.sunk = sunk;
  p.scores[room.holeIndex] = sunk ? p.shots : P.MISS_SCORE;
  const par = (room.map && room.map.par) || 3;
  p.points[room.holeIndex] = P.holePoints(sunk, p.shots, par) + (p.bonus || 0);
}

/** Modus des nächsten Schlags: 'ult' | 'sling' | null */
function nextMode(p) { return P.shotMode(p.shots + 1, p.ultUsed); }

function othersOf(room, p) {
  const others = [];
  for (const q of room.players) if (q !== p && q.ball && !q.sunk) others.push(q.ball.x, q.ball.y);
  return others;
}

/** Ergebnis eines Schlags übernehmen (normal + Ultimate); gibt die Bonuspunkte des Schlags zurück */
function applyResult(room, p, from, r, busyMs, pucks0) {
  p.busyUntil = Date.now() + busyMs;
  const b = P.shotBonus(pucks0 || [], r.pucks, r.result, r.nb || 0);
  const cap = P.config.points.maxPuckBonus;
  const puckPts = Math.max(0, Math.min(b.puckPts, cap - (p.puckBonus || 0)));
  p.puckBonus = (p.puckBonus || 0) + puckPts;
  const gain = { pucks: b.pucks, puckPts, trick: b.trick, nb: b.nb };
  p.bonus = (p.bonus || 0) + puckPts + b.trick;
  room.pucks = r.pucks;
  if (r.result === 'water') { p.ball = from; p.shots = Math.min(P.MAX_SHOTS, p.shots + P.config.waterPenalty); } else p.ball = { x: r.x, y: r.y };
  if (r.result === 'sunk') finishPlayer(room, p, true);
  else if (p.shots >= P.MAX_SHOTS) finishPlayer(room, p, false);
  if (p.done) gain.hole = p.points[room.holeIndex];
  return gain;
}

function handleShot(room, p, msg) {
  if (room.phase !== 'playing' || p.done || room.ult) return;
  const t = room.turn;
  if (!t || t.id !== p.id || t.phase !== 'aim') return send(p.ws, { type: 'error', text: 'Du bist nicht dran' });
  const angle = Number(msg.angle), power = Math.max(0, Math.min(1, Number(msg.power)));
  if (!Number.isFinite(angle) || !Number.isFinite(power) || power < 0.01) return;
  const mode = nextMode(p);
  const v = P.shotVelocity(angle, power, mode);
  const from = { x: p.ball.x, y: p.ball.y };
  const others = othersOf(room, p); // liegende Gegnerbälle sind Hindernisse (eingelochte nicht)
  // Magnete: nur die, die der Schütze in seiner Vorschau schon hatte – oder die schon länger aktiv sind.
  // So kann ein Magnet, der eine Sekunde vor dem Schlag kommt, die Vorschau nicht unbemerkt verfälschen.
  const seen = new Set(Array.isArray(msg.mags) ? msg.mags.map(Number) : []);
  const now = Date.now();
  const magnets = [];
  for (const q of room.players) if (q !== p && q.magnet && q.ball && !q.sunk && (seen.has(q.id) || now - (q.magnetAt || 0) > 1500)) magnets.push(q.ball.x, q.ball.y);
  const cmShot = P.withBalls(room.cm, others, from.x, from.y, magnets);
  const pucks0 = room.pucks;
  p.shots++;
  turnFlight(room);
  const seq = t.seq;

  if (mode) {
    // gesteuerter Schlag (Ultimate/Sling): Ergebnis steht erst fest, wenn die Steuerung vorbei ist
    if (mode === 'ult') p.ultUsed = true;
    const U = P.modeCfg(mode);
    room.ult = { pid: p.id, mode, from, vx: v.vx, vy: v.vy, cm: cmShot, pucks0, inputs: [], max: Math.round(U.steerTime / P.DT) * 2, accel: U.steerAccel };
    room.ult.timer = setTimeout(() => finishUltimate(room), (U.steerTime / U.slowmo + 15) * 1000);
    broadcast(room, { type: 'shot', seq, id: p.id, mode, ult: mode === 'ult', from, others, magnets, vx: v.vx, vy: v.vy, pucks0, shots: p.shots });
    return;
  }

  const r = P.simulate(cmShot, from.x, from.y, v.vx, v.vy, { pucks: pucks0 });
  const gain = applyResult(room, p, from, r, r.time * 1000, pucks0);
  broadcast(room, { type: 'shot', seq, id: p.id, from, others, magnets, vx: v.vx, vy: v.vy, pucks0, pucks: r.pucks, result: r.result, end: p.ball, shots: p.shots, done: p.done, sunk: p.sunk, score: p.scores[room.holeIndex], gain, bonus: p.bonus, points: p.points[room.holeIndex] ?? null });
  turnResolved(room, r.time * 1000);
}

/** Steuer-Eingaben des Ultimate-Schützen sammeln und live weiterreichen */
function handleUltInput(room, p, msg) {
  const u = room.ult;
  if (!u || u.pid !== p.id || !Array.isArray(msg.inputs)) return;
  const lim = u.accel * 1.01;
  const chunk = [];
  for (const v of msg.inputs.slice(0, Math.max(0, u.max - u.inputs.length))) {
    const n = Math.round(Number(v));
    chunk.push(Number.isFinite(n) ? Math.max(-lim, Math.min(lim, n)) : 0);
  }
  if (chunk.length % 2) chunk.pop();
  u.inputs.push(...chunk);
  const s = JSON.stringify({ type: 'ultInput', id: p.id, inputs: chunk });
  for (const q of room.players) if (q !== p && q.ws.readyState === 1) q.ws.send(s);
}

function finishUltimate(room) {
  const u = room.ult;
  if (!u) return;
  clearTimeout(u.timer);
  room.ult = null;
  const p = room.players.find((q) => q.id === u.pid);
  const r = P.simulate(u.cm, u.from.x, u.from.y, u.vx, u.vy, { pucks: u.pucks0, kick: u.mode === 'ult', inputs: u.inputs });
  const seq = room.turn ? room.turn.seq : 0;
  if (!p) { room.pucks = r.pucks; broadcast(room, { type: 'shotEnd', seq, id: u.pid, pucks: r.pucks, gone: true }); turnResolved(room, 0); return; }
  const steerT = (u.inputs.length / 2) * P.DT;
  const rest = Math.max(0, r.time - steerT) * 1000;
  const gain = applyResult(room, p, u.from, r, rest, u.pucks0);
  broadcast(room, { type: 'shotEnd', seq, id: p.id, n: u.inputs.length / 2, pucks: r.pucks, result: r.result, end: p.ball, shots: p.shots, done: p.done, sunk: p.sunk, score: p.scores[room.holeIndex], gain, bonus: p.bonus, points: p.points[room.holeIndex] ?? null });
  // Zuschauer hängen beim Steuern etwas hinterher (Puffer + Zeitlupe) -> großzügiger Timeout
  turnResolved(room, rest, (P.modeCfg(u.mode).steerTime / P.modeCfg(u.mode).slowmo) * 1000 * 0.5);
}

/** laufendes Ultimate abbrechen (Bahnwechsel) bzw. abschließen (Spieler weg) */
function endUltimate(room, discard) {
  if (!room.ult) return;
  if (discard) { clearTimeout(room.ult.timer); room.ult = null; } else finishUltimate(room);
}

function leave(p) {
  const room = p.room;
  if (!room) return;
  if (room.ult && room.ult.pid === p.id) endUltimate(room, false);
  const t = room.turn;
  const wasAiming = t && t.id === p.id && t.phase === 'aim';
  room.players = room.players.filter((x) => x !== p);
  p.room = null;
  if (!room.players.length) { clearTimeout(room.timer); clearTurn(room); rooms.delete(room.code); return; }
  if (room.hostId === p.id) room.hostId = room.players[0].id;
  broadcast(room, { type: 'toast', text: `${p.name} hat den Raum verlassen` });
  if (room.phase === 'playing') {
    if (wasAiming) return endTurn(room);              // Zug an den Nächsten
    if (t && t.phase === 'flight') { t.expect.delete(p.id); tryEndTurn(room); }
    if (!room.turn && room.players.every((q) => q.done)) holeEnd(room);
  }
  syncRoom(room);
}

function joinRoom(p, room) {
  if (room.players.length >= P.config.maxPlayers) return send(p.ws, { type: 'error', text: `Raum ist voll (max. ${P.config.maxPlayers})` });
  leave(p);
  p.room = room;
  p.color = freeColor(room);
  p.scores = []; p.points = []; p.bonus = 0; p.puckBonus = 0; p.shots = 0; p.done = false; p.sunk = false; p.busyUntil = 0; p.ball = null;
  room.players.push(p);
  send(p.ws, { type: 'joined', code: room.code });
  if (room.phase === 'playing' || room.phase === 'holeEnd') {
    p.magnet = false; p.magnetLeft = P.config.magnet.usesPerHole;
    while (p.scores.length < room.holeIndex) p.scores.push(null);
    while (p.points.length < room.holeIndex) p.points.push(null);
    p.ball = { x: room.cm.start.x, y: room.cm.start.y };
    if (room.phase === 'holeEnd') { p.done = true; p.scores[room.holeIndex] = null; p.points[room.holeIndex] = null; }
    send(p.ws, { type: 'hole', index: room.holeIndex, total: room.playlist.length, map: room.map, config: P.config, pucks: room.pucks });
  }
  broadcast(room, { type: 'toast', text: `${p.name} ist beigetreten` });
  if (room.phase === 'playing' && !room.turn && !room.endPending) beginTurn(room, p.id);
  else syncRoom(room);
}

const wss = new WebSocketServer({ server, maxPayload: 96 * 1024 });
wss.on('connection', (ws) => {
  const p = { id: nextId++, ws, name: 'Spieler', room: null, scores: [], points: [] };
  send(ws, { type: 'welcome', id: p.id, config: P.config, build: BUILD });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    const room = p.room;
    const isHost = room && room.hostId === p.id;
    switch (msg.type) {
      case 'hello':
        p.name = String(msg.name || 'Spieler').trim().slice(0, 16) || 'Spieler';
        if ('avatar' in msg) p.avatar = validAvatar(msg.avatar);
        if (room) syncRoom(room);
        break;
      case 'avatar':
        p.avatar = validAvatar(msg.data);
        if (room) syncRoom(room);
        break;
      case 'create': {
        const r = {
          code: code(), hostId: p.id, players: [], phase: 'lobby', holeIndex: 0,
          playlist: listMaps().filter((m) => m.kind === 'builtin' && m.difficulty !== 'hard').map((m) => ({ id: m.id, name: m.name, par: m.par, difficulty: m.difficulty })),
          settings: {}, timer: null,
        };
        rooms.set(r.code, r);
        joinRoom(p, r);
        break;
      }
      case 'join': {
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) return send(ws, { type: 'error', text: 'Raum nicht gefunden' });
        joinRoom(p, r);
        break;
      }
      case 'leave': leave(p); send(ws, { type: 'left' }); break;
      case 'playlist':
        if (!isHost || room.phase !== 'lobby' && room.phase !== 'finished' || !Array.isArray(msg.ids)) return;
        {
          const all = new Map(listMaps().map((m) => [m.id, m]));
          room.playlist = msg.ids.slice(0, 40).filter((id) => all.has(id)).map((id) => ({ id, name: all.get(id).name, par: all.get(id).par, difficulty: all.get(id).difficulty }));
          syncRoom(room);
        }
        break;
      case 'settings':
        if (!isHost) return;
        syncRoom(room);
        break;
      case 'start':
        if (!isHost || !room.playlist.length) return;
        if (room.phase !== 'lobby' && room.phase !== 'finished') return;
        clearTimeout(room.timer);
        room.holeIndex = 0; room.endPending = false;
        for (const pl of room.players) { pl.scores = []; pl.points = []; }
        startHole(room);
        break;
      case 'skip':
        if (isHost && (room.phase === 'playing' || room.phase === 'holeEnd')) {
          endUltimate(room, true);
          for (const pl of room.players) if (!pl.done) { pl.shots = P.MAX_SHOTS; finishPlayer(room, pl, false); }
          room.endPending = false;
          nextHole(room);
        }
        break;
      case 'lobby':
        if (isHost && room.phase === 'finished') { room.phase = 'lobby'; syncRoom(room); }
        break;
      case 'shot':
        if (room) handleShot(room, p, msg);
        break;
      case 'ultInput':
        if (room) handleUltInput(room, p, msg);
        break;
      case 'magnet':
        if (room) handleMagnet(room, p);
        break;
      case 'animDone':
        // Browser meldet: Animation des Schlags seq ist fertig
        if (room && room.turn && room.turn.phase === 'flight' && msg.seq === room.turn.seq) { room.turn.acks.add(p.id); tryEndTurn(room); }
        break;
      case 'ultEnd':
        if (room && room.ult && room.ult.pid === p.id) finishUltimate(room);
        break;
      case 'chat':
        if (room) broadcast(room, { type: 'chat', name: p.name, color: p.color, text: String(msg.text || '').slice(0, 200) });
        break;
    }
  });
  ws.on('close', () => leave(p));
});

server.listen(PORT, () => console.log(`Skillshot läuft auf http://localhost:${PORT}  (Editor: /editor)`));
