/* Skillshot – Spiel-Client */
(function () {
  const P = window.SkillPhysics, S = window.Skill;
  const $ = (id) => document.getElementById(id);

  let ws = null, myId = null, room = null, map = null, cm = null;
  let allMaps = [];
  let awaiting = false;
  let pucks = [], pucksVer = 0;      // Server-Stand der Pucks
  let ultBy = null;                  // Spieler-ID, die gerade einen Ultimate-Schlag spielt
  function setPucks(list) { pucks = list || []; pucksVer++; }
  const anims = new Map(); // playerId -> BallAnim
  const fx = new window.Skill.FX();
  const sfx = new window.Skill.SFX();

  // ------------------------------------------------------------ Verbindung
  function connect() {
    return new Promise((resolve, reject) => {
      if (ws && ws.readyState === 1) return resolve();
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
      ws.onopen = () => { send({ type: 'hello', name: myName(), avatar: myAvatar }); resolve(); };
      ws.onerror = () => reject(new Error('Keine Verbindung zum Server'));
      ws.onclose = () => { toast('Verbindung getrennt'); room = null; show('menu'); };
      ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    });
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function myName() { return ($('name').value.trim() || 'Spieler').slice(0, 16); }
  function me() { return room && room.players.find((p) => p.id === myId); }
  function isHost() { return room && room.hostId === myId; }

  function onMessage(m) {
    switch (m.type) {
      case 'welcome': myId = m.id; applyConfig(m.config); break;
      case 'config': applyConfig(m.config); break;
      case 'error':
        toast(m.text);
        if (!room && /nicht gefunden|voll/.test(m.text)) history.replaceState(null, '', location.pathname);
        break;
      case 'toast': toast(m.text); break;
      case 'joined': history.replaceState(null, '', '?room=' + m.code); break;
      case 'left': room = null; history.replaceState(null, '', location.pathname); show('menu'); break;
      case 'room': onRoom(m.room); break;
      case 'hole':
        if (m.config) P.configure(m.config);
        map = m.map; cm = P.compile(map); anims.clear(); awaiting = false; ultBy = null; setPucks(m.pucks);
        $('overlay').classList.add('hidden');
        show('game');
        toast(`Bahn ${m.index + 1}/${m.total}: ${map.name}`, true);
        break;
      case 'shot': onShot(m); break;
      case 'shotEnd': onShotEnd(m); break;
      case 'ultInput': { const a = anims.get(m.id); if (a && a.ult && !a.local) a.addInputs(m.inputs); break; }
      case 'holeEnd': showScoreTable(false); break;
      case 'finished': showScoreTable(true); break;
      case 'chat': chat(m); break;
    }
  }

  function applyConfig(c) {
    if (!c) return;
    P.configure(c);
    if (map) { cm = P.compile(map); shotCm = null; }
    renderHud(); renderBoard();
  }

  function onRoom(r) {
    const prevPhase = room && room.phase;
    // laufende Animationen behalten Vorrang vor Server-Positionen
    room = r;
    if (!r.ultBy) { /* lokales ultBy bleibt bis shotEnd */ } else ultBy = r.ultBy;
    if (r.phase === 'lobby') { show('lobby'); renderLobby(); }
    else if (r.phase === 'finished' && prevPhase !== 'finished') showScoreTable(true);
    else if (r.phase === 'finished') showScoreTable(true);
    renderBoard();
    renderHud();
  }

  function onShot(m) {
    const p = room && room.players.find((x) => x.id === m.id);
    if (!p || !cm) return;
    if (m.id === myId) awaiting = false;
    const mode = m.mode || (m.ult ? 'ult' : null);
    const ult = !!mode;
    const a = new S.BallAnim(P.withBalls(cm, m.others, m.from.x, m.from.y), m.from, m.vx, m.vy, m.end, m.result,
      { pucks: m.pucks0, mode, local: ult && m.id === myId });
    a.player = p; a.final = ult ? null : m; a.born = performance.now();
    anims.set(m.id, a);
    p.shots = m.shots;
    if (ult) {
      ultBy = m.id;
      if (mode === 'ult') p.ultUsed = true;
      if (m.id !== myId) toast(mode === 'ult' ? `⚡ ${p.name}: ULTIMATE BALL!` : `🌀 ${p.name}: SLING BALL`, mode === 'ult');
    } else { p.ball = m.end; setPucks(m.pucks); }
    renderHud(); renderBoard();
  }

  function onShotEnd(m) {
    if (ultBy === m.id) ultBy = null;
    setPucks(m.pucks);
    const p = room && room.players.find((x) => x.id === m.id);
    if (!p || m.gone) return;
    p.ball = m.end; p.shots = m.shots;
    const a = anims.get(m.id);
    if (a && a.ult) { a.finish(m.end, m.result); a.final = m; }
    else resolveShot(p, m, null);
  }

  /** Ergebnis eines Schlags anzeigen, sobald der Ball (in der Animation) liegt */
  function resolveShot(p, m, a) {
    p.done = m.done; p.sunk = m.sunk;
    if (m.score != null) p.scores[room.holeIndex] = m.score;
    const mine = p.id === myId;
    const pos = a ? a.pos : m.end;
    if (m.result === 'sunk') {
      const par = map.par, s = m.shots;
      const word = s === 1 ? 'HOLE-IN-ONE!' : s <= par - 2 ? 'EAGLE!' : s === par - 1 ? 'BIRDIE!' : s === par ? 'PAR' : s === par + 1 ? 'BOGEY' : `+${s - par}`;
      fx.text(map.hole.x, map.hole.y - 40, word, p.color, s === 1 ? 54 : s < par ? 40 : 30);
      if (s === 1 || s <= par - 1) celebrate(p.color, s === 1);
      toast(mine ? `⛳ ${word} (${s} Schl.)` : `${p.name}: ${word}`, mine);
    } else if (m.result === 'water') {
      fx.text(pos.x, pos.y - 20, 'SPLASH!', '#5aa0ff', 26);
      if (mine) toast('💦 Wasser! Zurück zur letzten Position');
      if (mine && m.done) toast(`Keine Schläge mehr – ${P.MISS_SCORE} Punkte`);
    } else if (mine && m.done) toast(`Keine Schläge mehr – ${P.MISS_SCORE} Punkte`);
    const nm = nextMode(p);
    if (nm) {
      const name = nm === 'ult' ? 'ULTIMATE BALL' : 'SLING BALL';
      if (mine) ultBanner(nm); else if (nm === 'ult') toast(`${p.name}: next BALL is ${name}`);
    }
    renderBoard(); renderHud();
  }

  /** Modus des nächsten Schlags ('ult' | 'sling' | null) – gleiche Regel wie der Server */
  function nextMode(p) { return p && !p.done ? P.shotMode(p.shots + 1, p.ultUsed) : null; }
  function ultimateNext(p) { return nextMode(p) === 'ult'; }

  let bannerTimer = null;
  function ultBanner(mode) {
    const b = $('ultBanner'), sl = mode === 'sling';
    b.querySelector('b').textContent = sl ? 'SLING BALL' : 'ULTIMATE BALL';
    b.classList.toggle('sling', sl);
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    if (sl) { sfx.sling(); fx.screen(0.3, '0,234,255'); } else { sfx.alarm(); fx.screen(0.5, '255,46,136'); fx.shake(6); }
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 3200);
  }

  // ------------------------------------------------------------ Bildschirme
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  }

  function toast(text, big) {
    const d = document.createElement('div');
    d.className = 'toast' + (big ? ' big' : '');
    d.textContent = text;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), big ? 2600 : 3200);
  }

  function chat(m) {
    const d = document.createElement('div');
    const n = document.createElement('b'); n.style.color = m.color; n.textContent = m.name + ': ';
    d.appendChild(n); d.appendChild(document.createTextNode(m.text));
    $('chatlog').appendChild(d);
    while ($('chatlog').children.length > 8) $('chatlog').firstChild.remove();
  }
  $('chat').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = $('chatIn').value.trim();
    if (t) send({ type: 'chat', text: t });
    $('chatIn').value = ''; $('chatIn').blur();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && $('game').classList.contains('active') && document.activeElement !== $('chatIn')) { $('chatIn').focus(); e.preventDefault(); }
  });

  // ------------------------------------------------------------ Profilbilder
  let myAvatar = localStorage.getItem('skillshot.avatar') || null;
  const imgCache = new Map();
  function img(url) {
    if (!url) return null;
    let i = imgCache.get(url);
    if (!i) { i = new Image(); i.src = url; imgCache.set(url, i); }
    return i;
  }
  // Standardbilder pro Platz: public/avatars/player1..8.(jpg|jpeg|png|webp)
  let slotAvatars = {};
  fetch('/api/avatars').then((r) => r.json()).then((a) => { slotAvatars = a || {}; renderBoard(); renderLobby(); }).catch(() => {});
  function avatarOf(p) {
    if (p.avatar) return p.avatar;
    const i = room ? room.players.indexOf(p) : -1;
    return i >= 0 ? slotAvatars[i + 1] || null : null;
  }
  function avatarHtml(p) {
    const a = avatarOf(p);
    return a ? `<span class="avatar" style="color:${p.color};background-image:url('${a}')"></span>`
      : `<span class="dot" style="background:${p.color};color:${p.color}"></span>`;
  }
  function renderAvPrev() {
    $('avPrev').style.backgroundImage = myAvatar ? `url('${myAvatar}')` : '';
    $('avPrev').textContent = myAvatar ? '' : '🙂';
  }
  renderAvPrev();
  $('btnAv').onclick = () => $('avFile').click();
  $('btnAvClear').onclick = () => { myAvatar = null; localStorage.removeItem('skillshot.avatar'); renderAvPrev(); send({ type: 'avatar', data: null }); };
  $('avFile').onchange = () => {
    const f = $('avFile').files[0]; if (!f) return;
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), m = Math.min(im.width, im.height);
      g.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, 128, 128);
      myAvatar = c.toDataURL('image/jpeg', 0.85);
      try { localStorage.setItem('skillshot.avatar', myAvatar); } catch { /* voll */ }
      renderAvPrev(); send({ type: 'avatar', data: myAvatar });
      URL.revokeObjectURL(im.src);
    };
    im.onerror = () => toast('Bild konnte nicht gelesen werden');
    im.src = URL.createObjectURL(f);
    $('avFile').value = '';
  };

  // ------------------------------------------------------------ Menü
  $('name').value = localStorage.getItem('skillshot.name') || '';
  $('name').addEventListener('change', () => localStorage.setItem('skillshot.name', myName()));
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) {
    // Einladungslink: direkt beitreten (Name/Bild aus dem letzten Besuch, in der Lobby änderbar)
    $('joinCode').value = urlRoom.toUpperCase();
    setTimeout(() => enter({ type: 'join', code: urlRoom.toUpperCase().trim() }), 0);
  }

  async function enter(msg) {
    localStorage.setItem('skillshot.name', myName());
    try { await connect(); send({ type: 'hello', name: myName(), avatar: myAvatar }); send(msg); }
    catch (e) { toast(e.message); }
  }
  $('btnCreate').onclick = () => enter({ type: 'create' });
  $('btnJoin').onclick = () => { const c = $('joinCode').value.trim(); if (c.length === 4) enter({ type: 'join', code: c }); else toast('Code hat 4 Zeichen'); };
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnJoin').click(); });

  // ------------------------------------------------------------ Lobby
  async function loadMapList() {
    try { allMaps = await (await fetch('/api/maps')).json(); } catch { allMaps = []; }
    renderLobby();
  }
  loadMapList();

  function renderLobby() {
    if (!room) return;
    if (document.activeElement !== $('lobbyName')) $('lobbyName').value = myName();
    $('lobbyCode').textContent = room.code;
    const ul = $('lobbyPlayers'); ul.innerHTML = '';
    for (const p of room.players) {
      const li = document.createElement('li');
      li.innerHTML = `${avatarHtml(p)}<span></span>${p.id === room.hostId ? '<span class="crown">👑</span>' : ''}`;
      li.children[1].textContent = p.name + (p.id === myId ? ' (du)' : '');
      ul.appendChild(li);
    }
    const host = isHost();
    $('btnStart').classList.toggle('hidden', !host);
    $('waitHost').classList.toggle('hidden', host);
    $('setPreview').disabled = !host;
    $('setPreview').value = room.settings.preview;
    $('setPreview').options[0].textContent = `Standard (${Math.round(P.config.preview.portion * 100)} %)`;
    for (const b of ['btnAllMaps', 'btnNoMaps']) $(b).classList.toggle('hidden', !host);
    $('btnStart').disabled = !room.playlist.length;

    const box = $('mapPick'); box.innerHTML = '';
    const order = room.playlist.map((e) => e.id);
    const list = host ? allMaps : order.map((id) => allMaps.find((m) => m.id === id) || room.playlist.find((e) => e.id === id));
    for (const m of list) {
      if (!m) continue;
      const idx = order.indexOf(m.id);
      const d = document.createElement('div');
      d.className = 'mapitem' + (idx >= 0 ? ' sel' : '') + (host ? '' : ' locked');
      d.innerHTML = `<span class="num">${idx >= 0 ? idx + 1 : ''}</span><span class="nm"></span><span class="meta">Par ${m.par}<br></span>`;
      d.querySelector('.nm').textContent = m.name;
      if (m.kind === 'custom') { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'eigene'; d.querySelector('.nm').appendChild(t); }
      if (m.author) d.querySelector('.meta').appendChild(document.createTextNode('von ' + m.author));
      if (host) d.onclick = () => {
        const ids = order.slice();
        const i = ids.indexOf(m.id);
        if (i >= 0) ids.splice(i, 1); else ids.push(m.id);
        send({ type: 'playlist', ids });
      };
      box.appendChild(d);
    }
    if (!list.length) box.innerHTML = '<p class="muted">Keine Bahnen ausgewählt</p>';
  }
  $('lobbyName').addEventListener('change', () => {
    $('name').value = $('lobbyName').value.trim().slice(0, 16);
    localStorage.setItem('skillshot.name', myName());
    send({ type: 'hello', name: myName() });
  });
  $('lobbyName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('lobbyName').blur(); });
  $('btnLobbyAv').onclick = () => $('avFile').click();
  $('btnStart').onclick = () => send({ type: 'start' });
  $('btnLeave').onclick = () => send({ type: 'leave' });
  $('btnCopy').onclick = () => {
    const url = location.origin + '/?room=' + room.code;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Link kopiert'), () => prompt('Link:', url));
  };
  $('setPreview').onchange = () => send({ type: 'settings', preview: $('setPreview').value });
  $('btnAllMaps').onclick = () => send({ type: 'playlist', ids: allMaps.map((m) => m.id) });
  $('btnNoMaps').onclick = () => send({ type: 'playlist', ids: [] });
  $('btnRefreshMaps').onclick = loadMapList;

  // ------------------------------------------------------------ Spiel-HUD
  $('btnQuit').onclick = () => { if (confirm('Raum verlassen?')) send({ type: 'leave' }); };
  $('btnSkip').onclick = () => { if (confirm(`Bahn für alle beenden? Wer nicht eingelocht hat, bekommt ${P.MISS_SCORE}.`)) send({ type: 'skip' }); };

  function renderHud() {
    if (!room || !map) return;
    $('hudHole').textContent = `Bahn ${room.holeIndex + 1}/${room.playlist.length}`;
    $('hudMap').textContent = map.name;
    $('hudPar').textContent = `Par ${map.par}` + (map.author ? ` · von ${map.author}` : '');
    $('btnSkip').classList.toggle('hidden', !isHost());
    const p = me();
    const used = p ? p.shots : 0;
    const un = P.config.ultimate.afterShots;
    const sl = P.config.sling;
    $('shotDots').innerHTML = Array.from({ length: P.MAX_SHOTS }, (_, i) => `<i class="${i < used ? 'used' : ''}${un > 0 && i === un ? ' ult' : ''}${sl.steerTime > 0 && sl.shots.includes(i + 1) ? ' sling' : ''}" title="Schlag ${i + 1}"></i>`).join('');
    const nm = nextMode(p);
    $('ultBadge').classList.toggle('hidden', !nm);
    $('ultBadge').classList.toggle('sling', nm === 'sling');
    $('ultBadge').textContent = nm === 'sling' ? '🌀 SLING BALL' : '⚡ ULTIMATE BALL';
  }

  function total(p) { return p.scores.reduce((a, b) => a + (b || 0), 0); }
  function parSum(n) { let s = 0; for (let i = 0; i < n; i++) s += (room.playlist[i] && room.playlist[i].par) || 0; return s; }

  function renderBoard() {
    if (!room) return;
    const b = $('board');
    const ps = room.players.slice().sort((a, c) => total(a) - total(c));
    let h = '<h4>Rangliste</h4>';
    const legend = `<div class="legend"><h4>Pucks</h4>${['light', 'medium', 'heavy'].map((c) => `<span><i style="color:${S.PUCK_COL[c]};border-color:${S.PUCK_COL[c]}"></i>${S.PUCK_NAME[c]}</span>`).join('')}<p class="muted">Schlag ${P.config.sling.shots.join(' & ')}: <b style="color:#00eaff">SLING BALL</b> – Ball mit der Maus lenken.<br>Schlag ${P.config.ultimate.afterShots + 1}: <b style="color:#ff2e88">ULTIMATE BALL</b> – Pucks wegsprengen, Zeitlupe, lenken.</p></div>`;
    for (const p of ps) {
      const a = anims.get(p.id);
      const rolling = a && !a.done;
      let st;
      if (room.phase === 'lobby') st = '';
      else if (p.done && !rolling) st = p.sunk ? `⛳ eingelocht mit <b>${p.shots}</b>` : `✖ <b>${P.MISS_SCORE}</b> Punkte`;
      else st = rolling ? 'rollt …' : `Schlag <b>${p.shots + 1}</b> / ${P.MAX_SHOTS}`;
      h += `<div class="bp ${p.id === myId ? 'me' : ''}"><div class="top">${avatarHtml(p)}<span class="nm">${esc(p.name)}</span>${p.id === room.hostId ? '👑' : ''}<span class="tot">${total(p)}</span></div><div class="st">${st}</div></div>`;
    }
    b.innerHTML = h + (room.phase === 'lobby' ? '' : legend);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function showScoreTable(final) {
    if (!room) return;
    const n = final ? room.playlist.length : room.holeIndex + 1;
    const ps = room.players.slice().sort((a, c) => total(a) - total(c));
    let h = `<div class="card"><h2>${final ? '🏆 Endstand' : `Bahn ${room.holeIndex + 1} beendet`}</h2>`;
    h += '<table class="score"><tr><th>Spieler</th>';
    for (let i = 0; i < n; i++) h += `<th title="${esc(room.playlist[i].name)}">${i + 1}</th>`;
    h += '<th>Σ</th><th>±Par</th></tr><tr class="muted"><td>Par</td>';
    for (let i = 0; i < n; i++) h += `<td>${room.playlist[i].par}</td>`;
    h += `<td>${parSum(n)}</td><td></td></tr>`;
    ps.forEach((p, k) => {
      h += `<tr class="${final && k === 0 ? 'win' : ''}"><td>${avatarHtml(p)} ${esc(p.name)}</td>`;
      for (let i = 0; i < n; i++) {
        const s = p.scores[i], par = room.playlist[i].par;
        h += `<td class="${s == null ? '' : s < par ? 'under' : s > par ? 'over' : ''}">${s == null ? '–' : s}</td>`;
      }
      const d = total(p) - parSum(n);
      h += `<td><b>${total(p)}</b></td><td>${d > 0 ? '+' + d : d}</td></tr>`;
    });
    h += '</table>';
    if (final) {
      h += isHost()
        ? '<div class="row" style="margin-top:16px"><button class="primary" id="btnAgain">Nochmal spielen</button><button id="btnToLobby">Zur Lobby</button></div>'
        : '<p class="muted">Warte auf den Host …</p>';
    } else h += '<p class="muted">Nächste Bahn startet gleich …</p>';
    h += '</div>';
    const ov = $('overlay');
    ov.innerHTML = h; ov.classList.remove('hidden');
    show('game');
    if ($('btnAgain')) $('btnAgain').onclick = () => send({ type: 'start' });
    if ($('btnToLobby')) $('btnToLobby').onclick = () => send({ type: 'lobby' });
  }

  // ------------------------------------------------------------ Rendering & Eingabe
  const canvas = $('cv');
  const view = new S.View(canvas);
  const ctrl = new S.ShotController(canvas, view, {
    fx, sfx,
    color: () => (me() ? me().color : '#fff'),
    canShoot: () => {
      const p = me();
      if (!room || room.phase !== 'playing' || !p || p.done || awaiting || !cm || ultBy) return false;
      const a = anims.get(myId);
      return !(a && !a.done);
    },
    getPucks: () => ({ list: pucks, ver: pucksVer }),
    shotMode: () => nextMode(me()),
    onShoot: (angle, power) => { awaiting = true; send({ type: 'shot', angle, power }); setTimeout(() => { awaiting = false; }, 3000); },
  });

  $('btnMute').textContent = sfx.muted ? '🔇' : '🔊';
  $('btnMute').onclick = () => { $('btnMute').textContent = sfx.toggle() ? '🔇' : '🔊'; $('btnMute').blur(); };
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && document.activeElement.tagName !== 'INPUT') $('btnMute').click(); });

  // Kollisionswelt für den eigenen nächsten Schlag (gleiche Regel wie der Server)
  let shotCm = null, shotCmKey = '';
  function cmForMe(mine) {
    const others = [];
    for (const q of room.players) if (q.id !== myId && q.ball && !q.sunk) others.push(q.ball.x, q.ball.y);
    const key = others.join(',') + '|' + mine.ball.x + ',' + mine.ball.y;
    if (key !== shotCmKey || !shotCm || shotCm.base !== cm) {
      shotCm = P.withBalls(cm, others, mine.ball.x, mine.ball.y);
      shotCm.base = cm; shotCmKey = key;
    }
    return shotCm;
  }

  function ballPos(p) {
    const a = anims.get(p.id);
    if (a) return a.done && a.result === 'water' ? p.ball : a.pos;
    return p.ball;
  }

  /** Feuerwerk über der ganzen Bahn */
  function celebrate(color, big) {
    sfx.fanfare();
    fx.screen(big ? 0.7 : 0.35, big ? '255,240,180' : '255,255,255');
    fx.shake(big ? 14 : 7);
    const n = big ? 9 : 4;
    const cols = [color, '#00eaff', '#ff2e88', '#ffe600', '#39ff8a', '#c36bff'];
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const x = map.width * (0.15 + Math.random() * 0.7), y = map.height * (0.15 + Math.random() * 0.7), c = cols[i % cols.length];
        fx.spark(x, y, c, 70, 520, { life: 1.1, drag: 2.2 });
        fx.spark(x, y, '#fff', 20, 300, { life: 0.6, kind: 'dot' });
        fx.ring(x, y, c, 120, 0.8, 4);
        sfx.tone(300 + Math.random() * 500, 0.3, 'triangle', 0.12, 80);
      }, 200 + i * 180);
    }
  }

  const SPAWN_FADE = 5;
  /** Steuerung beim Ultimate: Ball beschleunigt Richtung Mauszeiger */
  function steer(st, a) {
    const m = ctrl.mouse;
    if (!m) return [0, 0];
    const dx = m.x - st.x, dy = m.y - st.y, d = Math.hypot(dx, dy);
    if (d < 2) return [0, 0];
    const k = (a && a.mc ? a.mc.steerAccel : P.config.ultimate.steerAccel) * Math.min(1, d / 150) / d;
    return [Math.round(dx * k), Math.round(dy * k)];
  } // Sekunden, die ein Schweif nach dem Stillstand nachleuchtet
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    if ($('game').classList.contains('active') && map && room) {
      for (const [id, a] of anims) {
        a.update(dt, a.local ? steer : null);
        S.animFx(a, fx, sfx, a.player ? a.player.color : '#fff', map, dt);
        if (a.local) {
          if (a.inputs.length > a.sent) { send({ type: 'ultInput', inputs: a.inputs.slice(a.sent) }); a.sent = a.inputs.length; }
          if (!a.endSent && (a.ballDone || a.s.n >= a.steerSteps)) { a.endSent = true; send({ type: 'ultEnd' }); }
        }
        if (a.ballDone && a.final && !a.fired) { a.fired = true; resolveShot(a.player, a.final, a); }
        if (a.done && a.fired && a.fade > SPAWN_FADE) anims.delete(id);
      }
      // Effekte laufen in der Zeitlupe mit
      let ws = 1;
      for (const [, a] of anims) if (a.steering) ws = Math.min(ws, a.timeScale);
      fx.ambient(map, dt * ws);
      fx.update(dt * ws);
      view.fit(map.width, map.height);
      view.begin(fx);
      const ctx = view.ctx;
      S.drawMap(ctx, map, t, { view, cache: true, fx });
      const mine = me();
      // Leuchtschweife (Curve-Linien) aller Schläge
      for (const [, a] of anims) if (a.player) S.drawTrail(ctx, a.trail, a.player.color, a.done ? Math.max(0, 1 - a.fade / SPAWN_FADE) : 1);
      // Pucks: aus der jüngsten laufenden Animation, sonst Server-Stand
      let live = null;
      for (const [, a] of anims) if (!a.done && (!live || a.born > live.born)) live = a;
      S.drawPucks(ctx, live ? live.pucks : pucks, t);
      const ordered = room.players.slice().sort((a, b) => (a.id === myId) - (b.id === myId));
      for (const p of ordered) {
        if (!p.ball) continue;
        const a = anims.get(p.id);
        if (p.done && p.sunk && !(a && !a.ballDone)) continue; // im Loch
        const pos = ballPos(p);
        S.drawBall(ctx, pos.x, pos.y, p.color, p.id === myId ? null : p.name, p.id === myId ? 1 : 0.85, img(avatarOf(p)));
      }
      if (mine && mine.ball) {
        ctrl.update(dt, mine.ball);
        const nm = ctrl.enabled ? nextMode(mine) : null;
        if (nm) {
          // Aura für Ultimate (pink/lila) bzw. Sling (cyan/grün)
          const c1 = nm === 'ult' ? '#ff2e88' : '#00eaff', c2 = nm === 'ult' ? '#b45cff' : '#3dff7a';
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 3; i++) {
            ctx.strokeStyle = i % 2 ? c1 : c2; ctx.globalAlpha = 0.5 - i * 0.12; ctx.lineWidth = 3 - i * 0.6;
            ctx.beginPath(); ctx.arc(mine.ball.x, mine.ball.y, P.BALL_R + 22 + i * 9 + Math.sin(t * 6 + i) * 4, t * (2 + i), t * (2 + i) + 4.5); ctx.stroke();
          }
          ctx.restore();
          if (Math.random() < 0.5) fx.spark(mine.ball.x, mine.ball.y, Math.random() < 0.5 ? c1 : c2, 1, 90, { life: 0.5, kind: 'dot' });
        }
        if (ctrl.enabled && !ctrl.dragging) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = mine.color; ctx.globalAlpha = 0.35 + Math.sin(t * 5) * 0.25; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(mine.ball.x, mine.ball.y, P.BALL_R + 18 + Math.sin(t * 5) * 3, 0, 7); ctx.stroke(); ctx.restore();
        }
        ctrl.draw(ctx, mine.ball, mine.color, cmForMe(mine), 60, t, S.previewPortion(room.settings.preview));
      }
      fx.draw(ctx);
      for (const [, a] of anims) if (a.steering) S.drawUltOverlay(ctx, view, a, a.local ? ctrl.mouse : null, t);
      fx.drawScreen(ctx, canvas.width, canvas.height);
      const pw = ctrl.dragging ? ctrl.power : ctrl.lastPower;
      $('hudPower').textContent = ctrl.enabled ? `Kraft ${(pw * 100).toFixed(0)} % · Winkel ${((ctrl.angle * 180 / Math.PI + 360) % 360).toFixed(1)}°` : '';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
