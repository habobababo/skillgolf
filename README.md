# Skillshot ⛳

Multiplayer-Minigolf im Browser mit eigenem Map-Editor.

- **Schleuder-Steuerung**: Irgendwo klicken und ziehen. Die Distanz zum Klickpunkt bestimmt die Kraft, der Ball fliegt in Zugrichtung. Beim Loslassen wird geschlagen.
- **Neon-Arcade-Look** mit vielen Effekten: Leuchtschweife hinter jedem Ball, Funken bei Treffern, aufblitzende Bumper, Screenshake, Wasser-Splash, Lochwirbel, Feuerwerk bei Birdie und Hole-in-One sowie synthetische Sounds (WebAudio, `M` schaltet den Ton stumm).
- **Profilbilder**: Jeder Spieler kann im Menü ein Bild hochladen, es erscheint auf seinem Ball. Standardbilder pro Platz legst du als `public/avatars/player1.jpg` … `player8.jpg` ab (auch `.png`/`.webp`). Sie gelten für Spieler ohne eigenes Bild und liegen per `.gitignore` nicht im Repo.
- **7 Schläge pro Bahn.** Wer danach nicht eingelocht hat, bekommt 8 Punkte.
- **Flugbahn-Vorschau** bis zum Stillstand, inklusive Abprallern, Hängen, Boosts, Wasser und Loch. Server und Client nutzen dieselbe deterministische Physik (`shared/physics.js`), deshalb stimmt die Vorschau exakt. Der Host kann die Länge der Vorschau einstellen (komplett/lang/mittel/kurz/aus).
- **Multiplayer**: Räume mit 4-stelligem Code, bis zu 8 Spieler. Alle spielen dieselbe Bahn gleichzeitig. Liegende Gegnerbälle sind Hindernisse.
- **7 eingebaute Bahnen**. Eigene Bahnen erstellst du im Editor (`/editor`) und speicherst sie auf dem Server (`maps/custom/`). Export und Import als JSON gehen auch.

## Start

```bash
npm install
npm start            # http://localhost:3100 (PORT per Umgebungsvariable änderbar)
```

## Spielwerte einstellen

Kopiere `config.example.json` nach `config.json` und ändere die Werte. Der Server merkt Änderungen innerhalb von etwa einer Sekunde, ein Neustart ist nicht nötig. Alle Spieler bekommen die neuen Werte automatisch. Was fehlt, bleibt auf dem Standardwert. `config.json` liegt nicht im Repo, deshalb überschreibt ein `git pull` deine Einstellungen nicht.

```bash
cp config.example.json config.json
nano config.json
```

| Wert | Standard | Bedeutung |
|---|---|---|
| `maxSpeed` | 3400 | Abschussgeschwindigkeit bei 100 % Kraft (px/s) |
| `speedCap` | 5000 | Absolute Höchstgeschwindigkeit, z. B. nach Boosts |
| `dragDistance` | 320 | Ziehweg in Bildschirm-Pixeln für 100 % Kraft |
| `maxShots` | 7 | Schläge pro Bahn |
| `missPenalty` | 1 | Nicht eingelocht ergibt `maxShots + missPenalty` Punkte |
| `waterPenalty` | 0 | Strafschläge bei Wasser |
| `ballRadius` / `holeRadius` | 8 / 14 | Größe von Ball und Loch |
| `captureSpeed` | 560 | Ist der Ball langsamer, fällt er ins Loch |
| `holePull` | 2600 | Sog am Lochrand |
| `maxShotTime` | 40 | Ein Schlag endet spätestens nach so vielen Sekunden |
| `surfaces.grass/sand/ice` | | `decel` = feste Bremsung, `drag` = Bremsung abhängig vom Tempo |
| `bounce.wall/block/border/bumper/ball` | | Rückprall (1 = verlustfrei, über 1 = beschleunigt) |
| `bounce.bumperKick` | 260 | Zusätzlicher Stoß der Bumper |
| `slopeFactor` / `boostFactor` | 1 / 1 | Multiplikator für alle Hänge bzw. Boosts |
| `preview.width` / `preview.minWidth` | 4 / 1.2 | Dicke der Flugbahn-Vorschau am Ball bzw. Mindestdicke |
| `preview.fade` | 0.8 | Wie stark die Vorschau zum Ende verblasst (0–1) |
| `preview.fadeLength` | 1500 | Weg in px, nach dem die Vorschau maximal dünn und blass ist |
| `holeEndDelay` | 5.5 | Sekunden, die die Punktetabelle zwischen den Bahnen steht |
| `maxPlayers` | 8 | Spieler pro Raum |

## Steuerung

| Aktion | Eingabe |
|---|---|
| Zielen | Maus |
| Kraft & Richtung | Klicken und in Schlagrichtung ziehen, loslassen schlägt |
| Feinjustierung des Winkels | ← / → (mit Shift grob), auch während des Ziehens |
| Schlag per Tastatur | Leertaste schlägt mit der Vorschau-Kraft (↑ / ↓) |
| Ton an/aus | M |
| Abbrechen | Rechtsklick / Esc |
| Chat | Enter |

## Editor-Elemente

Wand, Block, Bumper, Sand, Eis, Wasser, Hang (konstante Kraft), Boost, Abschlag, Loch.
Rückgängig/Wiederholen, Raster, Duplizieren, Ebenen und ein Testmodus mit voller Vorschau sind eingebaut.

## Struktur

```
server.js            HTTP + Map-API + WebSocket-Räume (autoritative Physik)
shared/physics.js    deterministische Physik (Browser + Node)
public/              Spiel (index.html, game.js), Editor (editor.html, editor.js), common.js
maps/builtin/        eingebaute Bahnen (erzeugt mit tools/genmaps.js)
maps/custom/         im Editor gespeicherte Bahnen
```
