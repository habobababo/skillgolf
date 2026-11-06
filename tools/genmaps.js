// Erzeugt die eingebauten Maps unter maps/builtin/
// Aufruf: node tools/genmaps.js
const fs = require('fs'), path = require('path');
const W = (x1, y1, x2, y2, t = 14) => ({ type: 'wall', x1, y1, x2, y2, t });
const R = (type, x, y, w, h, extra) => Object.assign({ type, x, y, w, h }, extra || {});
const Bm = (x, y, r = 24) => ({ type: 'bumper', x, y, r });

/** Wasser überall außer in den angegebenen Land-Rechtecken [x,y,w,h] */
function waterExcept(Wd, Hd, land) {
  const xs = new Set([0, Wd]), ys = new Set([0, Hd]);
  for (const [x, y, w, h] of land) { xs.add(x); xs.add(x + w); ys.add(y); ys.add(y + h); }
  const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b);
  const isLand = (cx, cy) => land.some(([x, y, w, h]) => cx > x && cx < x + w && cy > y && cy < y + h);
  const out = [];
  for (let j = 0; j < Y.length - 1; j++) {
    let run = null;
    for (let i = 0; i < X.length - 1; i++) {
      const water = !isLand((X[i] + X[i + 1]) / 2, (Y[j] + Y[j + 1]) / 2);
      if (water) { if (!run) run = { x: X[i], y: Y[j], w: 0, h: Y[j + 1] - Y[j] }; run.w = X[i + 1] - run.x; }
      else if (run) { out.push(R('water', run.x, run.y, run.w, run.h)); run = null; }
    }
    if (run) out.push(R('water', run.x, run.y, run.w, run.h));
  }
  return out;
}

const base = { author: 'Skillshot', width: 1200, height: 800 };
const maps = {
  // ---------------------------------------------------------------- leicht
  '01-erste-schritte': { name: 'Erste Schritte', difficulty: 'easy', par: 2, start: { x: 120, y: 625 }, hole: { x: 1000, y: 200 }, objects: [
    R('block', 0, 0, 800, 450), W(1060, 800, 1200, 660), Bm(1000, 560, 20)] },
  '02-sandkasten': { name: 'Sandkasten', difficulty: 'easy', par: 3, start: { x: 120, y: 400 }, hole: { x: 1080, y: 400 }, objects: [
    R('sand', 280, 90, 200, 200), R('sand', 280, 510, 200, 200), R('sand', 830, 330, 130, 140),
    R('block', 560, 250, 80, 300), Bm(760, 170, 22), Bm(760, 630, 22),
    W(1100, 0, 1200, 100), W(1100, 800, 1200, 700)] },

  // ---------------------------------------------------------------- mittel
  '03-bumper-allee': { name: 'Bumper-Allee', difficulty: 'medium', par: 3, start: { x: 100, y: 700 }, hole: { x: 1100, y: 110 }, objects: [
    R('water', 0, 0, 230, 230), R('sand', 980, 210, 220, 70),
    Bm(350, 450, 26), Bm(550, 300, 26), Bm(550, 600, 26), Bm(750, 450, 26), Bm(950, 300, 26), Bm(750, 170, 26), Bm(950, 600, 26),
    W(1000, 0, 1000, 120)] },
  '04-eisbahn': { name: 'Eisbahn', difficulty: 'medium', par: 3, start: { x: 100, y: 400 }, hole: { x: 1090, y: 400 }, objects: [
    R('block', 0, 0, 1200, 120), R('block', 0, 680, 1200, 120),
    R('ice', 220, 120, 760, 560), R('water', 500, 320, 200, 160), R('water', 1165, 250, 35, 300),
    Bm(860, 250, 20), Bm(860, 550, 20)] },
  '05-rampen': { name: 'Rampen', difficulty: 'medium', par: 4, start: { x: 100, y: 650 }, hole: { x: 150, y: 150 }, objects: [
    R('block', 0, 300, 950, 200),
    R('slope', 400, 500, 300, 300, { angle: 180, strength: 380 }),
    R('boost', 975, 380, 200, 90, { angle: 270, strength: 2400 }),
    R('water', 430, 0, 280, 80),
    R('slope', 400, 80, 340, 220, { angle: 270, strength: 260 }),
    W(1100, 800, 1200, 700), W(1100, 0, 1200, 100)] },
  '06-labyrinth': { name: 'Labyrinth', difficulty: 'medium', par: 5, start: { x: 125, y: 100 }, hole: { x: 1100, y: 700 }, objects: [
    W(250, 0, 250, 580, 16), W(500, 220, 500, 800, 16), W(750, 0, 750, 580, 16), W(1000, 220, 1000, 800, 16),
    R('sand', 540, 320, 170, 160), Bm(375, 400, 20), Bm(875, 400, 20),
    W(0, 700, 100, 800), W(400, 0, 500, 100), W(650, 800, 750, 700), W(900, 0, 1000, 100)] },
  '08-zickzack': { name: 'Zickzack', difficulty: 'medium', par: 3, start: { x: 110, y: 690 }, hole: { x: 1090, y: 110 }, objects: [
    W(300, 800, 300, 330, 16), W(600, 0, 600, 470, 16), W(900, 800, 900, 330, 16),
    W(300, 330, 380, 250), W(600, 470, 520, 550), W(900, 330, 980, 250),
    R('sand', 640, 600, 220, 160), R('ice', 330, 40, 240, 200), Bm(750, 250, 22), Bm(450, 600, 22)] },
  '09-sandsturm': { name: 'Sandsturm', difficulty: 'medium', par: 3, start: { x: 100, y: 120 }, hole: { x: 1080, y: 680 }, objects: [
    R('sand', 220, 0, 160, 330), R('sand', 220, 470, 160, 330), R('sand', 520, 200, 160, 400),
    R('sand', 820, 0, 160, 330), R('sand', 820, 470, 160, 330),
    R('slope', 380, 0, 140, 800, { angle: 90, strength: 180 }), R('slope', 680, 0, 140, 800, { angle: 270, strength: 180 }),
    R('boost', 1000, 360, 160, 80, { angle: 90, strength: 1600 }), Bm(1100, 520, 20)] },

  // ---------------------------------------------------------------- hart
  '07-skillshot': { name: 'Skillshot', difficulty: 'hard', par: 3, start: { x: 120, y: 400 }, hole: { x: 1070, y: 400 }, objects: [
    R('water', 380, 0, 520, 370), R('water', 380, 430, 520, 370),
    R('boost', 420, 380, 70, 40, { angle: 0, strength: 1800 }),
    W(1000, 320, 1140, 320, 12), W(1140, 320, 1140, 480, 12), W(1000, 480, 1140, 480, 12),
    Bm(960, 250, 20), Bm(960, 550, 20)] },
  '10-nadeloehr': { name: 'Nadelöhr', difficulty: 'hard', par: 4, width: 1400, start: { x: 100, y: 400 }, hole: { x: 1300, y: 400 }, objects: [
    W(350, 0, 350, 180, 16), W(350, 240, 350, 800, 16),
    W(700, 0, 700, 560, 16), W(700, 620, 700, 800, 16),
    W(1050, 0, 1050, 370, 16), W(1050, 430, 1050, 800, 16),
    R('water', 370, 0, 310, 90), R('water', 370, 710, 310, 90),
    R('water', 720, 0, 310, 110), R('water', 720, 690, 310, 110),
    R('water', 500, 330, 70, 120), R('water', 860, 380, 60, 160),
    R('sand', 1080, 0, 320, 120), R('sand', 1080, 680, 320, 120),
    Bm(1200, 270, 20), Bm(1200, 530, 20)] },
  '11-brueckenlauf': { name: 'Brückenlauf', difficulty: 'hard', par: 5, width: 1400, start: { x: 120, y: 400 }, hole: { x: 1250, y: 680 }, objects: [
    ...waterExcept(1400, 800, [
      [0, 260, 260, 280],      // Abschlag-Insel
      [260, 380, 260, 40],     // Brücke 1 (horizontal)
      [520, 80, 240, 640],     // Insel B
      [760, 130, 240, 40],     // Brücke 2
      [1000, 60, 220, 220],    // Insel C
      [1090, 280, 40, 280],    // Brücke 3 (vertikal)
      [1000, 560, 400, 240],   // Loch-Insel
    ]),
    R('sand', 560, 120, 160, 120), R('sand', 1030, 90, 160, 160), Bm(640, 560, 22), Bm(1320, 600, 18)] },
  '12-eisspirale': { name: 'Eis-Spirale', difficulty: 'hard', par: 5, height: 900, start: { x: 100, y: 820 }, hole: { x: 600, y: 450 }, objects: [
    R('ice', 0, 0, 1100, 900), R('water', 1100, 0, 100, 900),
    W(280, 150, 1000, 150), W(1000, 150, 1000, 750), W(1000, 750, 200, 750), W(200, 750, 200, 250),
    W(330, 280, 870, 280), W(870, 280, 870, 520), W(770, 620, 330, 620), W(330, 620, 330, 280),
    W(540, 390, 740, 390), W(740, 390, 740, 510), W(740, 510, 460, 510), W(460, 510, 460, 430)] },
  '13-bumper-hoelle': { name: 'Bumper-Hölle', difficulty: 'hard', par: 4, start: { x: 80, y: 400 }, hole: { x: 1110, y: 400 }, objects: [
    ...[0, 1, 2, 3, 4, 5].flatMap((r) => [0, 1, 2, 3, 4, 5].map((c) => Bm(300 + c * 120 + (r % 2) * 60, 100 + r * 120, 22))),
    R('water', 250, 0, 760, 45), R('water', 250, 755, 760, 45),
    W(1040, 330, 1160, 330, 12), W(1160, 330, 1160, 470, 12), W(1040, 470, 1160, 470, 12),
    R('sand', 960, 340, 70, 120)] },
  '14-gegenwind': { name: 'Gegenwind', difficulty: 'hard', par: 5, width: 1400, start: { x: 100, y: 400 }, hole: { x: 1250, y: 400 }, objects: [
    R('slope', 300, 0, 800, 800, { angle: 180, strength: 290 }),
    R('boost', 650, 370, 80, 60, { angle: 0, strength: 2000 }),
    R('slope', 1150, 300, 100, 200, { angle: 180, strength: 240 }), R('slope', 1250, 300, 100, 200, { angle: 0, strength: 240 }),
    R('slope', 1150, 200, 200, 100, { angle: 270, strength: 240 }), R('slope', 1150, 500, 200, 100, { angle: 90, strength: 240 }),
    R('water', 1360, 0, 40, 800), R('water', 1150, 0, 210, 110), R('water', 1150, 690, 210, 110),
    R('water', 400, 0, 600, 60), R('water', 400, 740, 600, 60), Bm(900, 250, 22), Bm(900, 550, 22)] },
  '15-labyrinth-xl': { name: 'Labyrinth XL', difficulty: 'hard', par: 6, width: 1600, height: 1000, start: { x: 100, y: 100 }, hole: { x: 1500, y: 150 }, objects: [
    W(200, 0, 200, 800, 16), W(400, 200, 400, 1000, 16), W(600, 0, 600, 800, 16), W(800, 200, 800, 1000, 16),
    W(1000, 0, 1000, 800, 16), W(1200, 200, 1200, 1000, 16), W(1400, 0, 1400, 800, 16),
    W(400, 520, 300, 520), W(200, 320, 300, 320), W(800, 480, 700, 480), W(600, 300, 700, 300),
    W(1200, 520, 1100, 520), W(1000, 320, 1100, 320),
    R('sand', 220, 600, 160, 160), R('sand', 820, 620, 160, 160), R('sand', 1420, 400, 180, 160),
    R('water', 1100, 900, 90, 100), R('water', 610, 0, 90, 90), Bm(500, 700, 20), Bm(900, 300, 20), Bm(1300, 700, 20)] },
  '16-tresor': { name: 'Tresor', difficulty: 'hard', par: 4, start: { x: 150, y: 400 }, hole: { x: 900, y: 400 }, objects: [
    R('ice', 0, 60, 1200, 680), R('water', 0, 0, 1200, 60), R('water', 0, 740, 1200, 60),
    R('block', 420, 200, 70, 400),
    W(820, 320, 980, 320, 12), W(820, 320, 820, 480, 12), W(820, 480, 980, 480, 12),
    W(980, 320, 980, 372, 12), W(980, 428, 980, 480, 12),
    Bm(640, 180, 22), Bm(640, 620, 22)] },
};
const dir = path.join(__dirname, '..', 'maps', 'builtin');
for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) fs.unlinkSync(path.join(dir, f));
for (const [f, m] of Object.entries(maps)) fs.writeFileSync(path.join(dir, f + '.json'), JSON.stringify({ ...base, ...m }, null, 1));
console.log('geschrieben:', Object.keys(maps).length);
