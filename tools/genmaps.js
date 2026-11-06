// Erzeugt die eingebauten Maps unter maps/builtin/
const fs = require('fs'), path = require('path');
const W = (x1, y1, x2, y2, t = 14) => ({ type: 'wall', x1, y1, x2, y2, t });
const R = (type, x, y, w, h, extra) => Object.assign({ type, x, y, w, h }, extra || {});
const Bm = (x, y, r = 24) => ({ type: 'bumper', x, y, r });
const base = { author: 'Skillshot', width: 1200, height: 800 };
const maps = {
  '01-erste-schritte': { name: 'Erste Schritte', par: 2, start: { x: 120, y: 625 }, hole: { x: 1000, y: 200 }, objects: [
    R('block', 0, 0, 800, 450), W(1060, 800, 1200, 660), Bm(1000, 560, 20) ] },
  '02-sandkasten': { name: 'Sandkasten', par: 3, start: { x: 120, y: 400 }, hole: { x: 1080, y: 400 }, objects: [
    R('sand', 280, 90, 200, 200), R('sand', 280, 510, 200, 200), R('sand', 830, 330, 130, 140),
    R('block', 560, 250, 80, 300), Bm(760, 170, 22), Bm(760, 630, 22),
    W(1100, 0, 1200, 100), W(1100, 800, 1200, 700) ] },
  '03-bumper-allee': { name: 'Bumper-Allee', par: 3, start: { x: 100, y: 700 }, hole: { x: 1100, y: 110 }, objects: [
    R('water', 0, 0, 230, 230), R('sand', 980, 210, 220, 70),
    Bm(350, 450, 26), Bm(550, 300, 26), Bm(550, 600, 26), Bm(750, 450, 26), Bm(950, 300, 26), Bm(750, 170, 26), Bm(950, 600, 26),
    W(1000, 0, 1000, 120) ] },
  '04-eisbahn': { name: 'Eisbahn', par: 3, start: { x: 100, y: 400 }, hole: { x: 1090, y: 400 }, objects: [
    R('block', 0, 0, 1200, 120), R('block', 0, 680, 1200, 120),
    R('ice', 220, 120, 760, 560), R('water', 500, 320, 200, 160), R('water', 1165, 250, 35, 300),
    Bm(860, 250, 20), Bm(860, 550, 20) ] },
  '05-rampen': { name: 'Rampen', par: 4, start: { x: 100, y: 650 }, hole: { x: 150, y: 150 }, objects: [
    R('block', 0, 300, 950, 200),
    R('slope', 400, 500, 300, 300, { angle: 180, strength: 380 }),
    R('boost', 975, 380, 200, 90, { angle: 270, strength: 2400 }),
    R('water', 430, 0, 280, 80),
    R('slope', 400, 80, 340, 220, { angle: 270, strength: 260 }),
    W(1100, 800, 1200, 700), W(1100, 0, 1200, 100) ] },
  '06-labyrinth': { name: 'Labyrinth', par: 5, start: { x: 125, y: 100 }, hole: { x: 1100, y: 700 }, objects: [
    W(250, 0, 250, 580, 16), W(500, 220, 500, 800, 16), W(750, 0, 750, 580, 16), W(1000, 220, 1000, 800, 16),
    R('sand', 540, 320, 170, 160), Bm(375, 400, 20), Bm(875, 400, 20),
    W(0, 700, 100, 800), W(400, 0, 500, 100), W(650, 800, 750, 700), W(900, 0, 1000, 100) ] },
  '07-skillshot': { name: 'Skillshot', par: 3, start: { x: 120, y: 400 }, hole: { x: 1070, y: 400 }, objects: [
    R('water', 380, 0, 520, 370), R('water', 380, 430, 520, 370),
    R('boost', 420, 380, 70, 40, { angle: 0, strength: 1800 }),
    W(1000, 320, 1140, 320, 12), W(1140, 320, 1140, 480, 12), W(1000, 480, 1140, 480, 12),
    Bm(960, 250, 20), Bm(960, 550, 20) ] },
};
const dir = path.join(__dirname, '..', 'maps', 'builtin');
for (const [f, m] of Object.entries(maps)) fs.writeFileSync(path.join(dir, f + '.json'), JSON.stringify({ ...base, ...m }, null, 1));
console.log('geschrieben:', Object.keys(maps).length);
