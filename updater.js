'use strict';
/*
 * Updater für Skillgolf: Version anzeigen, nach Updates suchen, Update installieren, Server neu starten.
 * Einstellungen in update.json (liegt nicht im Repo, Vorlage: update.example.json):
 *   githubToken    GitHub-Token mit Lesezugriff auf das (private) Repo
 *   adminPassword  Passwort für die Admin-Seite /admin (ohne Passwort ist sie aus)
 *   autoUpdate     true = regelmäßig prüfen und automatisch installieren, wenn niemand spielt
 *   checkMinutes   Prüf-Intervall (Standard 30)
 *   restart        "auto" (Standard) oder ein eigener Befehl, z. B. "sudo systemctl restart skillgolf"
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, execFileSync, spawn } = require('child_process');

module.exports = function createUpdater({ root, activePlayers, notifyAll }) {
  const FILE = path.join(root, 'update.json');
  const SCRIPT = path.join(root, 'tools', 'update.sh');
  let busy = false, lastCheck = null, autoTimer = null;

  function settings() {
    try { return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}; } catch (e) { console.warn('update.json fehlerhaft:', e.message); return {}; }
  }

  function version() {
    try {
      const out = execFileSync('git', ['-c', `safe.directory=${root}`, 'log', '-1', '--format=%h|%cI|%s'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const [hash, date, ...msg] = out.split('|');
      return { hash, date, subject: msg.join('|') };
    } catch { return { hash: null, date: null, subject: 'kein Git-Repo' }; }
  }
  const startedWith = version();

  /** update.sh ausführen -> { ok, state, behind, log } */
  function run(args) {
    return new Promise((resolve) => {
      execFile('bash', [SCRIPT, ...args], { cwd: root, timeout: 5 * 60 * 1000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        const log = (stdout + (stderr ? '\n' + stderr : '')).trim();
        let state = 'error', behind = 0;
        if (/^AKTUALISIERT /m.test(log)) state = 'updated';
        else if (/^AKTUELL /m.test(log)) state = 'current';
        else if (/^NEU (\d+)/m.test(log) && !/^FEHLER/m.test(log)) { state = 'available'; behind = Number(/^NEU (\d+)/m.exec(log)[1]); }
        resolve({ ok: state !== 'error' && !err, state, behind, log });
      });
    });
  }

  async function check() {
    if (busy) return { ok: false, state: 'busy', log: 'Läuft bereits …' };
    busy = true;
    try { lastCheck = { at: new Date().toISOString(), ...(await run(['--check'])) }; return lastCheck; } finally { busy = false; }
  }

  async function install() {
    if (busy) return { ok: false, state: 'busy', log: 'Läuft bereits …' };
    busy = true;
    try {
      const r = await run([]);
      lastCheck = { at: new Date().toISOString(), ...r, state: r.state === 'updated' ? 'current' : r.state };
      if (r.state === 'updated') restartSoon('Update installiert');
      return r;
    } finally { busy = false; }
  }

  /**
   * Neu starten. "auto": unter systemd/pm2 einfach beenden (die starten neu; Exit-Code 75 zählt auch bei
   * Restart=on-failure), sonst startet sich der Server selbst als neuen Prozess und beendet den alten.
   */
  function restartSoon(reason) {
    notifyAll('🔄 Server wird aktualisiert – gleich geht\'s weiter …');
    console.log(`Neustart (${reason}) …`);
    setTimeout(() => {
      const how = String(settings().restart || 'auto');
      if (how !== 'auto') {
        spawn('sh', ['-c', how], { cwd: root, detached: true, stdio: 'ignore' }).unref();
        setTimeout(() => process.exit(75), 1500);
        return;
      }
      const managed = !!(process.env.INVOCATION_ID || process.env.pm_id || process.env.SKILLGOLF_MANAGED);
      if (!managed) {
        const logFile = path.join(root, 'server.log');
        const out = fs.openSync(logFile, 'a');
        spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, detached: true, stdio: ['ignore', out, out], env: { ...process.env, SKILLGOLF_RESTARTED: '1' } }).unref();
        console.log(`Neuer Server-Prozess gestartet (Ausgabe: ${logFile})`);
      }
      process.exit(75);
    }, 1500);
  }

  function status() {
    const s = settings();
    return {
      version: version(), runningSince: startedWith, busy, lastCheck,
      tokenSet: !!(s.githubToken || process.env.GITHUB_TOKEN), autoUpdate: !!s.autoUpdate,
      checkMinutes: Number(s.checkMinutes) || 30, players: activePlayers(),
      managed: !!(process.env.INVOCATION_ID || process.env.pm_id || process.env.SKILLGOLF_MANAGED),
    };
  }

  // -------------------------------------------------------------- Auto-Update
  function scheduleAuto() {
    clearInterval(autoTimer);
    const s = settings();
    if (!s.autoUpdate) return;
    const min = Math.max(5, Number(s.checkMinutes) || 30);
    autoTimer = setInterval(async () => {
      const r = await check();
      if (r.state !== 'available') return;
      if (activePlayers() > 0) { console.log(`Auto-Update: ${r.behind} neue Änderung(en), warte bis niemand spielt`); return; }
      console.log('Auto-Update: installiere …');
      const u = await install();
      if (!u.ok) console.warn('Auto-Update fehlgeschlagen:\n' + u.log);
    }, min * 60 * 1000);
    console.log(`Auto-Update aktiv (alle ${min} Minuten)`);
  }
  scheduleAuto();
  fs.watchFile(FILE, { interval: 2000 }, scheduleAuto);

  // -------------------------------------------------------------- HTTP-Schnittstelle /api/admin/*
  function authorized(req) {
    const pw = String(settings().adminPassword || '');
    if (!pw) return null; // Admin aus
    const given = String(req.headers['x-admin-password'] || '');
    const a = crypto.createHash('sha256').update(given).digest(), b = crypto.createHash('sha256').update(pw).digest();
    return crypto.timingSafeEqual(a, b);
  }
  function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }

  /** gibt true zurück, wenn die Anfrage behandelt wurde */
  function handle(req, res, p) {
    if (p === '/api/version') { const v = version(); json(res, 200, { hash: v.hash, date: v.date }); return true; }
    if (!p.startsWith('/api/admin/')) return false;
    const ok = authorized(req);
    if (ok === null) { json(res, 403, { error: 'Admin-Seite ist aus. Lege in update.json ein "adminPassword" fest.' }); return true; }
    if (!ok) { setTimeout(() => json(res, 401, { error: 'Falsches Passwort' }), 1000); return true; } // Raten bremsen
    const action = p.slice('/api/admin/'.length);
    if (action === 'status' && req.method === 'GET') { json(res, 200, status()); return true; }
    if (req.method !== 'POST') { json(res, 405, { error: 'POST erwartet' }); return true; }
    if (action === 'check') { check().then((r) => json(res, 200, r)); return true; }
    if (action === 'update') {
      const force = /force=1/.test(req.url);
      const n = activePlayers();
      if (n > 0 && !force) { json(res, 409, { error: `Gerade sind ${n} Spieler verbunden. Laufende Spiele gehen beim Neustart verloren.`, players: n }); return true; }
      install().then((r) => json(res, 200, r));
      return true;
    }
    if (action === 'restart') { json(res, 200, { ok: true }); restartSoon('von Hand'); return true; }
    json(res, 404, { error: 'Unbekannte Aktion' });
    return true;
  }

  return { handle, status, check, install };
};
