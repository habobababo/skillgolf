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
      ws.onclose = () => {
        toast('Verbindung getrennt – verbinde neu …'); room = null; show('menu');
        setTimeout(() => location.reload(), 2000);
      };
      ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    });
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function myName() { return ($('name').value.trim() || 'Spieler').slice(0, 16); }
  function me() { return room && room.players.find((p) => p.id === myId); }
  function isHost() { return room && room.hostId === myId; }

  function onMessage(m) {
    switch (m.type) {
      case 'welcome': {
        myId = m.id; applyConfig(m.config);
        // neue Server-Version -> Seite neu laden, damit niemand mit altem Code spielt
        const old = sessionStorage.getItem('skillshot.build');
        sessionStorage.setItem('skillshot.build', m.build);
        if (old && m.build && old !== m.build) location.reload();
        break;
      }
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
      case 'turn': onTurn(m.turn); break;
      case 'magnet': onMagnet(m.id, m.puck); break;
      case 'timeout': onTimeout(m); break;
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

  // Zug-Zustand vom Server: { id, seq, phase: 'aim' | 'flight', left }
  let turn = null, turnDeadline = 0;
  function setTurnState(t) {
    turn = t || null;
    turnDeadline = turn && turn.phase === 'aim' && turn.left ? performance.now() + turn.left : 0;
  }
  function myTurn() { return !!turn && turn.id === myId && turn.phase === 'aim'; }
  function onRoom(r) {
    setTurnState(r.turn);
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
    if (!p || !cm) { if (m.seq) send({ type: 'animDone', seq: m.seq }); return; }
    if (m.id === myId) awaiting = false;
    const mode = m.mode || (m.ult ? 'ult' : null);
    const ult = !!mode;
    const a = new S.BallAnim(P.withBalls(cm, m.others, m.from.x, m.from.y, m.magnets, m.magPucks), m.from, m.vx, m.vy, m.end, m.result,
      { pucks: m.pucks0, mode, local: ult && m.id === myId });
    a.player = p; a.final = ult ? null : m; a.born = performance.now(); a.seq = m.seq;
    anims.set(m.id, a);
    p.shots = m.shots;
    if (turn && turn.seq === m.seq) { turn.phase = 'flight'; turnDeadline = 0; }
    $('hudTimer').textContent = '';
    a.magPucks = m.magPucks || [];
    for (const q of room.players) { q.magnet = false; q.magnetPuck = null; } // Magnet wirkt nur für diesen Schlag
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
    if (!p || m.gone) { const a = anims.get(m.id); if (a) a.final = a.final || m; else if (m.seq) send({ type: 'animDone', seq: m.seq }); return; }
    p.ball = m.end; p.shots = m.shots;
    const a = anims.get(m.id);
    if (a && a.ult) { a.finish(m.end, m.result); a.final = m; }
    else resolveShot(p, m, null);
  }

  /** Ergebnis eines Schlags anzeigen, sobald der Ball (in der Animation) liegt */
  function resolveShot(p, m, a) {
    p.done = m.done; p.sunk = m.sunk;
    if (m.score != null) p.scores[room.holeIndex] = m.score;
    if (!p.points) p.points = [];
    if (m.points != null) p.points[room.holeIndex] = m.points;
    if (m.bonus != null) p.bonus = m.bonus;
    const mine = p.id === myId;
    const pos = a ? a.pos : m.end;
    // Bonuspunkte einblenden
    const g = m.gain;
    if (g) {
      let dy = 0;
      if (g.puckPts > 0) { fx.text(pos.x, pos.y - 60 - dy, `+${g.puckPts} PUCK${g.pucks > 1 ? 'S' : ''}`, '#39ff8a', 24); dy += 28; sfx.tone(988, 0.15, 'triangle', 0.12); }
      if (g.trick > 0) { fx.text(map.hole.x, map.hole.y - 80, `+${g.trick} TRICKSHOT (${g.nb}× Bande)`, '#ffe03a', 28); if (mine) toast(`🎯 TRICKSHOT +${g.trick}`, true); }
      if (g.hole != null && mine) setTimeout(() => toast(`Bahn: ${g.hole} Punkte`, false), 900);
    }
    if (m.result === 'sunk') {
      const par = map.par, s = m.shots;
      const word = s === 1 ? 'HOLE-IN-ONE!' : s <= par - 2 ? 'EAGLE!' : s === par - 1 ? 'BIRDIE!' : s === par ? 'PAR' : s === par + 1 ? 'BOGEY' : `+${s - par}`;
      fx.text(map.hole.x, map.hole.y - 40, word, p.color, s === 1 ? 54 : s < par ? 40 : 30);
      if (s === 1 || s <= par - 1) celebrate(p.color, s === 1);
      toast(mine ? `⛳ ${word} (${s} Schl.)` : `${p.name}: ${word}`, mine);
    } else if (m.result === 'water') {
      fx.text(pos.x, pos.y - 20, 'SPLASH!', '#5aa0ff', 26);
      if (mine) toast('💦 Wasser! Zurück zur letzten Position');
      if (mine && m.done) toast(`Keine Schläge mehr – nicht eingelocht`);
    } else if (mine && m.done) toast(`Keine Schläge mehr – nicht eingelocht`);
    renderBoard(); renderHud();
  }

  /** Modus des nächsten Schlags ('ult' | 'sling' | null) – gleiche Regel wie der Server */
  function nextMode(p) { return p && !p.done ? P.shotMode(p.shots + 1, p.ultUsed) : null; }
  function ultimateNext(p) { return nextMode(p) === 'ult'; }

  let bannerTimer = null;
  /** große Meldung: „DU BIST DRAN“ (+ ggf. „next BALL is …“) */
  function banner(main, top, kind) {
    const b = $('ultBanner');
    b.querySelector('small').textContent = top || '';
    b.querySelector('b').textContent = main;
    b.classList.toggle('sling', kind === 'sling');
    b.classList.toggle('turn', kind === 'turn');
    b.classList.toggle('opp', kind === 'opp');
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 3200);
  }

  /** Zugwechsel */
  function onTurn(t) {
    if (!room || !t) return;
    setTurnState(t);
    const id = t.id;
    for (const q of room.players) { q.magnet = false; q.magnetPuck = null; }
    const p = room.players.find((x) => x.id === id);
    if (id === myId) {
      const nm = nextMode(me());
      if (nm === 'ult') { banner('ULTIMATE BALL', 'DU BIST DRAN · next BALL is', 'ult'); sfx.alarm(); fx.screen(0.5, '255,46,136'); fx.shake(6); }
      else if (nm === 'sling') { banner('SLING BALL', 'DU BIST DRAN · next BALL is', 'sling'); sfx.sling(); fx.screen(0.3, '0,234,255'); }
      else { banner('DU BIST DRAN', '', 'turn'); sfx.turn(); fx.screen(0.25, '0,234,255'); }
    } else if (p) {
      // Gegner ist dran: große Einblendung in seiner Farbe
      const b = $('ultBanner'); b.style.setProperty('--opp', p.color);
      const me_ = me();
      banner(`${p.name.toUpperCase()} IST DRAN`, me_ && !me_.done && P.config.magnet.usesPerHole > 0 && (me_.magnetLeft || 0) > 0 ? 'GEGNER · 🧲 Ball oder Puck magnetisieren' : 'GEGNER', 'opp');
    }
    renderHud(); renderBoard();
  }

  /** Zeit abgelaufen: Strafschlag */
  function onTimeout(m) {
    const p = room && room.players.find((x) => x.id === m.id);
    if (!p) return;
    p.shots = m.shots; p.done = m.done;
    if (p.ball && map) fx.text(p.ball.x, p.ball.y - 30, '+1 SCHLAG', '#ff3860', 26);
    if (m.id === myId) { sfx.alarm(); fx.shake(4); }
    renderHud(); renderBoard();
  }

  function onMagnet(id, puck) {
    const p = room && room.players.find((x) => x.id === id);
    if (!p) return;
    p.magnet = true; p.magnetPuck = puck != null ? puck : null; p.magnetLeft = Math.max(0, (p.magnetLeft || 0) - 1);
    const at = magnetPos(p);
    if (at) { fx.ring(at.x, at.y, '#ffe03a', P.config.magnet.radius, 0.8, 4); fx.ring(at.x, at.y, '#00eaff', P.config.magnet.radius * 0.6, 0.6, 3); }
    sfx.magnet();
    const what = p.magnetPuck != null ? 'einen PUCK' : 'seinen Ball';
    if (turn && turn.id === myId) toast(`🧲 ${p.name} hat ${what} MAGNETISIERT!`, true);
    else toast(`🧲 ${p.name} magnetisiert ${what}`);
    renderHud(); renderBoard();
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
    for (const b of ['btnAllMaps', 'btnNoMaps', 'btnEasy', 'btnMedium', 'btnHard']) $(b).classList.toggle('hidden', !host);
    $('btnStart').disabled = !room.playlist.length;

    const box = $('mapPick'); box.innerHTML = '';
    const order = room.playlist.map((e) => e.id);
    const list = (host ? allMaps : order.map((id) => allMaps.find((m) => m.id === id) || room.playlist.find((e) => e.id === id))).filter(Boolean);
    // nach Schwierigkeit gruppieren (Host); Gäste sehen die Playlist in Reihenfolge
    const groups = host ? ['easy', 'medium', 'hard'].map((d) => [d, list.filter((m) => (m.difficulty || 'medium') === d)]) : [[null, list]];
    for (const [d, items] of groups) {
      if (!items.length) continue;
      if (d) {
        const hd = document.createElement('div');
        hd.className = 'diffhead ' + d;
        hd.innerHTML = `${DIFF_LABEL[d]} <small>${items.length}</small>`;
        box.appendChild(hd);
      }
      for (const m of items) {
        const idx = order.indexOf(m.id);
        const el = document.createElement('div');
        el.className = 'mapitem' + (idx >= 0 ? ' sel' : '') + (host ? '' : ' locked');
        el.innerHTML = `<span class="num">${idx >= 0 ? idx + 1 : ''}</span><span class="nm"></span><span class="meta">Par ${m.par}<br></span>`;
        el.querySelector('.nm').textContent = m.name;
        const diff = m.difficulty || 'medium';
        const dt = document.createElement('span'); dt.className = 'dtag ' + diff; dt.textContent = DIFF_LABEL[diff]; el.querySelector('.nm').appendChild(dt);
        if (m.kind === 'custom') { const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = 'eigene'; el.querySelector('.nm').appendChild(tg); }
        if (m.author) el.querySelector('.meta').appendChild(document.createTextNode('von ' + m.author));
        if (host) el.onclick = () => {
          const ids = order.slice();
          const i = ids.indexOf(m.id);
          if (i >= 0) ids.splice(i, 1); else ids.push(m.id);
          send({ type: 'playlist', ids });
        };
        box.appendChild(el);
      }
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
  $('btnAllMaps').onclick = () => send({ type: 'playlist', ids: allMaps.map((m) => m.id) });
  $('btnNoMaps').onclick = () => send({ type: 'playlist', ids: [] });
  const addDiff = (d) => {
    const ids = room.playlist.map((e) => e.id);
    for (const m of allMaps) if ((m.difficulty || 'medium') === d && !ids.includes(m.id)) ids.push(m.id);
    send({ type: 'playlist', ids });
  };
  $('btnEasy').onclick = () => addDiff('easy');
  $('btnMedium').onclick = () => addDiff('medium');
  $('btnHard').onclick = () => addDiff('hard');
  $('btnRefreshMaps').onclick = loadMapList;

  // ------------------------------------------------------------ Spiel-HUD
  $('btnQuit').onclick = () => { if (confirm('Raum verlassen?')) send({ type: 'leave' }); };
  $('btnSkip').onclick = () => { if (confirm(`Bahn für alle beenden? Wer nicht eingelocht hat, bekommt ${P.config.points.miss} Punkte (+ bisherige Boni).`)) send({ type: 'skip' }); };

  function renderHud() {
    if (!room || !map) return;
    $('hudHole').textContent = `Bahn ${room.holeIndex + 1}/${room.playlist.length}`;
    $('hudMap').innerHTML = esc(map.name) + (map.difficulty === 'hard' ? ' <span class="dtag hard">HART</span>' : '');
    $('hudPar').textContent = `Par ${map.par}` + (map.author ? ` · von ${map.author}` : '');
    $('btnSkip').classList.toggle('hidden', !isHost());
    const p = me();
    const used = p ? p.shots : 0;
    const un = P.config.ultimate.afterShots;
    const sl = P.config.sling;
    $('shotDots').innerHTML = Array.from({ length: P.MAX_SHOTS }, (_, i) => `<i class="${i < used ? 'used' : ''}${un > 0 && i === un ? ' ult' : ''}${sl.steerTime > 0 && sl.shots.includes(i + 1) ? ' sling' : ''}" title="Schlag ${i + 1}"></i>`).join('');
    const tp = turn && room.players.find((x) => x.id === turn.id);
    const flying = turn && turn.phase === 'flight';
    $('hudTurn').innerHTML = room.phase !== 'playing' || !tp ? ''
      : tp.id === myId ? (flying ? 'Dein Ball rollt …' : '<b class="you">DU BIST DRAN</b>')
      : `Am Zug: <b style="color:${tp.color}">${esc(tp.name)}</b>${flying ? ' · rollt …' : ''}`;
    updateMagnetBtn();
    const nm = nextMode(p);
    $('ultBadge').classList.toggle('hidden', !nm);
    $('ultBadge').classList.toggle('sling', nm === 'sling');
    $('ultBadge').textContent = nm === 'sling' ? '🌀 SLING BALL' : '⚡ ULTIMATE BALL';
  }

  function updateMagnetBtn() {
    const p = me(), b = $('btnMagnet');
    // nur, solange man selbst noch auf der Bahn spielt
    const show = room && room.phase === 'playing' && p && !p.done && turn && turn.id !== myId && P.config.magnet.usesPerHole > 0;
    b.classList.toggle('hidden', !show);
    if (!show) return;
    const left = p.magnetLeft || 0;
    const tp = room.players.find((x) => x.id === turn.id);
    const close = tp && tp.ball && Math.hypot(tp.ball.x - p.ball.x, tp.ball.y - p.ball.y) < P.BALL_R * 2 + 0.5;
    b.classList.toggle('active', !!p.magnet);
    b.disabled = !!p.magnet || left <= 0 || turn.phase !== 'aim' || close || !p.ball || p.sunk;
    b.innerHTML = p.magnet ? (p.magnetPuck != null ? '🧲 PUCK-MAGNET AKTIV' : '🧲 MAGNET AKTIV')
      : `🧲 BALL MAGNETISIEREN <small>${close ? 'zu nah' : left + '×'}</small>${left > 0 && turn.phase === 'aim' ? '<small class="hint">oder Puck anklicken</small>' : ''}`;
  }
  $('btnMagnet').onclick = () => { send({ type: 'magnet' }); $('btnMagnet').blur(); };
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyG' && document.activeElement.tagName !== 'INPUT' && !$('btnMagnet').classList.contains('hidden') && !$('btnMagnet').disabled) $('btnMagnet').click(); });

  /** Punkte gesamt (mehr = besser); laufende Bahn zählt ihre Boni schon mit */
  function total(p) {
    const pts = (p.points || []).reduce((a, b) => a + (b || 0), 0);
    const live = room && room.phase === 'playing' && !p.done ? (p.bonus || 0) : 0;
    return pts + live;
  }
  function strokes(p) { return p.scores.reduce((a, b) => a + (b || 0), 0); }
  /** Rangfolge: mehr Punkte zuerst, bei Gleichstand weniger Schläge */
  function rankSort(a, c) { return total(c) - total(a) || strokes(a) - strokes(c); }
  function parSum(n) { let s = 0; for (let i = 0; i < n; i++) s += (room.playlist[i] && room.playlist[i].par) || 0; return s; }

  function renderBoard() {
    if (!room) return;
    const b = $('board');
    const ps = room.players.slice().sort(rankSort);
    let h = '<h4>Rangliste <small class="muted">Punkte</small></h4>';
    const legend = `<div class="legend"><h4>Pucks</h4>${['light', 'medium', 'heavy'].map((c) => `<span><i style="color:${S.PUCK_COL[c]};border-color:${S.PUCK_COL[c]}"></i>${S.PUCK_NAME[c]}</span>`).join('')}<p class="muted">Schlag ${P.config.sling.shots.join(' & ')}: <b style="color:#00eaff">SLING BALL</b> – Ball mit der Maus lenken.<br>Schlag ${P.config.ultimate.afterShots + 1}: <b style="color:#ff2e88">ULTIMATE BALL</b> – Pucks wegsprengen, Zeitlupe, lenken.</p>${pointsHelp()}</div>`;
    for (const p of ps) {
      const a = anims.get(p.id);
      const rolling = a && !a.done;
      let st;
      if (room.phase === 'lobby') st = '';
      else if (p.done && !rolling) { const hp = p.points && p.points[room.holeIndex]; st = (p.sunk ? `⛳ eingelocht mit ${p.shots}` : '✖ nicht eingelocht') + (hp != null ? ` · <b>+${hp}</b>` : ''); }
      else st = rolling ? 'rollt …' : `Schlag <b>${p.shots + 1}</b> / ${P.MAX_SHOTS}`;
      const isTurn = room.phase === 'playing' && !!turn && turn.id === p.id;
      if (isTurn && !(p.done && !rolling)) st = (rolling ? 'rollt …' : '▶ <b>am Zug</b>') + ` · Schlag ${p.shots + (rolling ? 0 : 1)}/${P.MAX_SHOTS}`;
      if (room.phase === 'playing' && !p.done && p.bonus) st += ` · <b style="color:#39ff8a">+${p.bonus} Bonus</b>`;
      if (p.magnet) st += ` · <b style="color:#ffe03a">🧲 ${p.magnetPuck != null ? 'Puck-Magnet' : 'Magnet'}</b>`;
      else if (room.phase === 'playing' && !p.done && P.config.magnet.usesPerHole > 0) st += ` · 🧲${p.magnetLeft || 0}`;
      h += `<div class="bp ${p.id === myId ? 'me' : ''} ${isTurn ? 'turn' : ''}"><div class="top">${avatarHtml(p)}<span class="nm">${esc(p.name)}</span>${p.id === room.hostId ? '👑' : ''}<span class="tot">${total(p)}</span></div><div class="st">${st}</div></div>`;
    }
    b.innerHTML = h + (room.phase === 'lobby' ? '' : legend);
  }
  const DIFF_LABEL = { easy: 'LEICHT', medium: 'MITTEL', hard: 'HART' };
  function pointsHelp() {
    const Q = P.config.points;
    return `<h4 style="margin-top:12px">Punkte</h4><p class="muted pts">Hole-in-One <b>${Q.holeInOne}</b> · Eagle <b>${Q.eagle}</b> · Birdie <b>${Q.birdie}</b> · Par <b>${Q.par}</b> · Bogey <b>${Q.bogey}</b> · schlechter <b>${Q.worse}</b> · nicht eingelocht <b>${Q.miss}</b><br>`
      + `Bonus: versenkter Puck <b>+${Q.puck}</b> (schwer <b>+${Q.heavyPuck}</b>, max. ${Q.maxPuckBonus}/Bahn) · Einlochen nach ≥${Q.trickBounces} Abprallern <b>+${Q.trickshot}</b></p>`;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function showScoreTable(final) {
    if (!room) return;
    const n = final ? room.playlist.length : room.holeIndex + 1;
    const ps = room.players.slice().sort(rankSort);
    let h = `<div class="card"><h2>${final ? '🏆 Endstand' : `Bahn ${room.holeIndex + 1} beendet`}</h2>`;
    h += '<table class="score"><tr><th>Spieler</th>';
    for (let i = 0; i < n; i++) h += `<th title="${esc(room.playlist[i].name)}" class="${room.playlist[i].difficulty === 'hard' ? 'hardcol' : ''}">${i + 1}</th>`;
    h += '<th>Punkte</th><th>Schläge</th><th>±Par</th></tr><tr class="muted"><td>Par</td>';
    for (let i = 0; i < n; i++) h += `<td>${room.playlist[i].par}</td>`;
    h += `<td></td><td>${parSum(n)}</td><td></td></tr>`;
    ps.forEach((p, k) => {
      h += `<tr class="${final && k === 0 ? 'win' : ''}"><td>${avatarHtml(p)} ${esc(p.name)}</td>`;
      for (let i = 0; i < n; i++) {
        const s = p.scores[i], par = room.playlist[i].par, pt = p.points ? p.points[i] : null;
        h += `<td class="${s == null ? '' : s < par ? 'under' : s > par ? 'over' : ''}">${pt == null ? '–' : `<b>${pt}</b><small class="stk">${s}</small>`}</td>`;
      }
      const d = strokes(p) - parSum(n);
      h += `<td><b class="ptot">${total(p)}</b></td><td>${strokes(p)}</td><td>${d > 0 ? '+' + d : d}</td></tr>`;
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
      if (!myTurn()) return false;
      for (const [, a] of anims) if (!a.done) return false;
      return true;
    },
    getPucks: () => ({ list: pucks, ver: pucksVer }),
    shotMode: () => nextMode(me()),
    onShoot: (angle, power) => {
      // welche Magnete waren in meiner Vorschau? (Server ignoriert ganz frische, die ich noch nicht sehen konnte)
      const mags = room.players.filter((q) => q.id !== myId && q.magnet && (q.magnetPuck != null || (q.ball && !q.sunk))).map((q) => q.id);
      awaiting = true; send({ type: 'shot', angle, power, mags });
      setTimeout(() => { awaiting = false; }, 3000);
    },
  });

  $('btnMute').textContent = sfx.muted ? '🔇' : '🔊';
  $('btnMute').onclick = () => { $('btnMute').textContent = sfx.toggle() ? '🔇' : '🔊'; $('btnMute').blur(); };
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && document.activeElement.tagName !== 'INPUT') $('btnMute').click(); });

  // Kollisionswelt für den eigenen nächsten Schlag (gleiche Regel wie der Server)
  let shotCm = null, shotCmKey = '';
  function cmForMe(mine) {
    const others = [];
    for (const q of room.players) if (q.id !== myId && q.ball && !q.sunk) others.push(q.ball.x, q.ball.y);
    const mags = [], mp = [];
    for (const q of room.players) {
      if (q.id === myId || !q.magnet) continue;
      if (q.magnetPuck != null) { if (pucks[q.magnetPuck] && pucks[q.magnetPuck].alive) mp.push(q.magnetPuck); }
      else if (q.ball && !q.sunk) mags.push(q.ball.x, q.ball.y);
    }
    const key = others.join(',') + '|' + mags.join(',') + '|' + mp.join(',') + '|' + mine.ball.x + ',' + mine.ball.y;
    if (key !== shotCmKey || !shotCm || shotCm.base !== cm) {
      shotCm = P.withBalls(cm, others, mine.ball.x, mine.ball.y, mags, mp);
      shotCm.base = cm; shotCmKey = key;
    }
    return shotCm;
  }

  /** wo sitzt der Magnet eines Spielers? (eigener Ball oder Puck) */
  function magnetPos(p, list) {
    list = list || pucks;
    if (p.magnetPuck != null) { const q = list[p.magnetPuck]; return q && q.alive ? { x: q.x, y: q.y } : null; }
    return p.ball && !p.sunk ? p.ball : null;
  }
  /** darf ich gerade einen Puck magnetisieren? */
  function canMagnetPuck() {
    const p = me();
    return !!(room && room.phase === 'playing' && p && !p.done && !p.magnet && (p.magnetLeft || 0) > 0 && turn && turn.id !== myId && turn.phase === 'aim' && P.config.magnet.usesPerHole > 0);
  }
  function puckAt(w) {
    if (!w) return -1;
    let best = -1, bd = Infinity;
    for (let i = 0; i < pucks.length; i++) {
      const q = pucks[i]; if (!q.alive) continue;
      const d = Math.hypot(q.x - w.x, q.y - w.y);
      if (d < q.r + 10 && d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && room.players.some((o) => o.magnet && o.magnetPuck === best)) return -1;
    return best;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !canMagnetPuck()) return;
    const i = puckAt(view.toWorld(e.clientX, e.clientY));
    if (i >= 0) send({ type: 'magnet', puck: i });
  });

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
  let lastDraw = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    // FPS-Begrenzung (config.fps, Standard 60)
    const fps = P.config.fps, iv = fps > 0 ? 1000 / fps : 0;
    if (iv && now - lastDraw < iv - 1) return;
    lastDraw = iv ? Math.max(lastDraw + iv, now - iv) : now;
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
        if (a.done && a.final && a.seq && !a.acked) { a.acked = true; send({ type: 'animDone', seq: a.seq }); }
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
      // Magnetfelder
      const livePucks = live ? live.pucks : pucks;
      const fields = [];
      for (const p of room.players) { const at = p.magnet ? magnetPos(p, livePucks) : null; if (at) fields.push(at); }
      // während eines Schlags: magnetisierte Pucks des laufenden Schlags (wandern mit)
      if (live && live.magPucks) for (const i of live.magPucks) { const q = livePucks[i]; if (q && q.alive) fields.push({ x: q.x, y: q.y }); }
      for (const at of fields) {
        const R = P.config.magnet.radius;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const f = ((t * 0.6 + i / 4) % 1), rr = R * (1 - f);
          ctx.strokeStyle = i % 2 ? '#ffe03a' : '#00eaff'; ctx.globalAlpha = 0.35 * f; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(at.x, at.y, rr, 0, 7); ctx.stroke();
        }
        ctx.globalAlpha = 0.12; ctx.fillStyle = '#ffe03a'; ctx.beginPath(); ctx.arc(at.x, at.y, R, 0, 7); ctx.fill();
        ctx.restore();
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2, d = R * (0.5 + Math.random() * 0.5);
          fx.parts.push({ x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d, vx: 0, vy: 0, t: 0, life: 0.8, color: Math.random() < 0.5 ? '#ffe03a' : '#00eaff', size: 1.6, drag: 0, kind: 'dot', pull: { x: at.x, y: at.y, k: 900 } });
        }
      }
      // Puck unter der Maus hervorheben, wenn man ihn magnetisieren kann
      const hp = canMagnetPuck() ? puckAt(ctrl.mouse) : -1;
      if (hp >= 0) {
        const q = pucks[hp];
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#ffe03a'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + Math.sin(t * 10) * 0.3;
        ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r + 8, 0, 7); ctx.stroke(); ctx.restore();
        canvas.style.cursor = 'pointer';
      } else if (canvas.style.cursor) canvas.style.cursor = '';
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
        ctrl.draw(ctx, mine.ball, mine.color, cmForMe(mine), 60, t);
      }
      fx.draw(ctx);
      for (const [, a] of anims) if (a.steering) S.drawUltOverlay(ctx, view, a, a.local ? ctrl.mouse : null, t);
      fx.drawScreen(ctx, canvas.width, canvas.height);
      if (turnDeadline) {
        const left = Math.max(0, Math.ceil((turnDeadline - performance.now()) / 1000));
        const el = $('hudTimer'); const txt = left + ' s';
        if (el.textContent !== txt) { el.textContent = txt; el.classList.toggle('low', left <= 10); }
      } else if ($('hudTimer').textContent) $('hudTimer').textContent = '';
      const pw = ctrl.dragging ? ctrl.power : ctrl.lastPower;
      $('hudPower').textContent = ctrl.enabled ? `Kraft ${(pw * 100).toFixed(0)} % · Winkel ${((ctrl.angle * 180 / Math.PI + 360) % 360).toFixed(1)}°` : '';
    }
  }
  requestAnimationFrame(frame);
})();
