# Skillshot ⛳

Multiplayer-Minigolf im Browser mit eigenem Map-Editor.

- **Schleuder-Steuerung**: Irgendwo klicken und ziehen. Die Distanz zum Klickpunkt bestimmt die Kraft, der Ball fliegt entgegen der Zugrichtung. Beim Loslassen wird geschlagen.
- **Neon-Arcade-Look** mit vielen Effekten: Leuchtschweife hinter jedem Ball, Funken bei Treffern, aufblitzende Bumper, Screenshake, Wasser-Splash, Lochwirbel, Feuerwerk bei Birdie und Hole-in-One sowie synthetische Sounds (WebAudio, `M` schaltet den Ton stumm).
- **Profilbilder**: Jeder Spieler kann im Menü ein Bild hochladen, es erscheint auf seinem Ball. `public/avatars/player2.jpg` wird, falls vorhanden, als Standardbild für Spieler 2 verwendet (liegt per `.gitignore` nicht im Repo).
- **7 Schläge pro Bahn.** Wer danach nicht eingelocht hat, bekommt 8 Punkte.
- **Flugbahn-Vorschau** bis zum Stillstand, inklusive Abprallern, Hängen, Boosts, Wasser und Loch. Server und Client nutzen dieselbe deterministische Physik (`shared/physics.js`), deshalb stimmt die Vorschau exakt. Der Host kann die Länge der Vorschau einstellen (komplett/lang/mittel/kurz/aus).
- **Multiplayer**: Räume mit 4-stelligem Code, bis zu 8 Spieler. Alle spielen dieselbe Bahn gleichzeitig. Liegende Gegnerbälle sind Hindernisse.
- **7 eingebaute Bahnen**. Eigene Bahnen erstellst du im Editor (`/editor`) und speicherst sie auf dem Server (`maps/custom/`). Export und Import als JSON gehen auch.

## Start

```bash
npm install
npm start            # http://localhost:3100 (PORT per Umgebungsvariable änderbar)
```

## Steuerung

| Aktion | Eingabe |
|---|---|
| Zielen | Maus |
| Kraft & Richtung | Klicken und vom Klickpunkt wegziehen (Schleuder), loslassen schlägt |
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
