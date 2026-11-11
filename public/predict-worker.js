/*
 * Vorschau-Berechnung im Hintergrund (Web Worker), damit das Bild beim Zielen nicht ruckelt.
 * Nutzt exakt dieselbe Physik wie Server und Spiel -> die Vorschau bleibt deterministisch genau.
 */
importScripts('/shared/physics.js');
const P = self.SkillPhysics;
let cmId = 0, cm = null, cfgId = 0;

self.onmessage = (e) => {
  const m = e.data;
  if (m.config) { P.configure(m.config); cfgId = m.cfgId; }
  if (m.cm) { cm = m.cm; cmId = m.cmId; }
  if (m.cmId !== cmId || !cm || m.cfgId !== cfgId) { self.postMessage({ id: m.id, missing: true }); return; }
  const v = P.shotVelocity(m.angle, m.pw, m.mode);
  const pred = P.simulate(cm, m.x, m.y, v.vx, v.vy, m.opts);
  self.postMessage({ id: m.id, key: m.key, pred });
};
