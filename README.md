# Skillgolf ⛳

Multiplayer-Minigolf im Browser mit eigenem Map-Editor.

- **Schleuder-Steuerung**: Irgendwo klicken und ziehen. Die Distanz zum Klickpunkt bestimmt die Kraft, der Ball fliegt in Zugrichtung. Beim Loslassen wird geschlagen.
- **Neon-Arcade-Look** mit flackerndem Titel samt Neon-Brummen und -Knistern und vielen weiteren Effekten: Leuchtschweife hinter jedem Ball, Funken bei Treffern, aufblitzende Bumper, Screenshake, Wasser-Splash, Lochwirbel, Feuerwerk bei Birdie und Hole-in-One sowie synthetische Sounds (WebAudio, `M` schaltet den Ton stumm).
- **Pucks**: Auf jeder Bahn liegen mindestens 10 Pucks an zufälligen Stellen. Sie werden echt simuliert und lassen sich anstoßen. Grün ist leicht, gelb mittel, rot schwer und kaum zu bewegen. Pucks können im Wasser versinken, und die Vorschau zeigt auch ihre Bahnen.
- **SLING BALL**: Schlag 2 und 4 sind Sling-Schläge. Nach dem Abschlag lenkst du den Ball 2,5 Sekunden lang mit der Maus, in leichter Zeitlupe.
- **ULTIMATE BALL**: Nach 5 Schlägen erscheint „next BALL is ULTIMATE BALL“, und der nächste Schlag ist erzwungen ein Ultimate-Schlag. Der Ball startet mit halber Geschwindigkeit, ein Stoß schleudert alle Pucks weg, dann läuft das Spiel in Zeitlupe und du steuerst den Ball 6 Sekunden lang mit der Maus. Die anderen Spieler sehen das live und können währenddessen nicht schlagen.
- **Gummibänder** (orange, mit Pfosten): Der Ball prallt schneller zurück, als er kam, und das Band schwingt nach.
- **Glaswände**: Ein schneller Ball zerbricht die Scheibe und verliert dabei knapp die Hälfte seines Tempos. Ist er zu langsam, prallt er ab. Kaputtes Glas bleibt für alle bis zum Ende der Bahn weg.
- **Bomben-Pucks** (schwarz mit Zündschnur, 2 pro Bahn): Werden sie berührt, vom Ball oder von einem anderen Puck, sind sie scharf und zeigen einen Countdown. Der läuft aber erst los, wenn der Zug vorbei ist, und nur während jemand zielt. Rollt ein Ball, steht er still, deshalb bleibt die Vorschau exakt. Bei 0 explodiert die Bombe und schleudert Pucks und liegende Bälle weg, andere Bomben im Radius werden mit scharf. Landet ein Ball dabei im Wasser oder im Loch, bleibt er, wo er lag. Danach bekommt der Spieler am Zug neue Zeit.
- **Feld-Puck**: Auf jeder Bahn hat genau ein Puck ein Feld, zufällig eins von beiden: lila zieht den rollenden Ball an (Gravitation), orange drückt ihn weg (Abstoßung). Die Ringe laufen bei Gravitation nach innen und bei Abstoßung nach außen.
- **Schwarzes Loch**: Das Loch zieht in seinem Umkreis alles an, also Ball, Pucks und sogar die Funken. Schnelle Bälle werden in einer Kurve abgelenkt, langsame fallen hinein. Pucks, die hineingeraten, werden verschluckt. Die Vorschau zeigt auch das exakt.
- **Punktesystem (mehr ist besser)**: Pro Bahn gibt es Punkte nach Schlägen im Vergleich zum Par. Hole-in-One 10, Eagle 7, Birdie 5, Par 3, Bogey 2, schlechter 1, nicht eingelocht 0. Dazu kommen Boni: +1 pro Puck, den dein Schlag versenkt (im Wasser oder im schwarzen Loch), bei schweren Pucks +2, höchstens 5 pro Bahn. Ein **Trickshot** bringt +2, wenn der einlochende Schlag mindestens 3 Abpraller hatte. Die Rangliste sortiert nach Punkten, bei Gleichstand nach weniger Schlägen.
- **7 Schläge pro Bahn.**
- **Flugbahn-Vorschau** erscheint erst, wenn du ziehst (im Editor-Testmodus schon beim Zielen). Sie reicht bis zum Stillstand, inklusive Abprallern, Hängen, Boosts, Wasser und Loch. Server und Client nutzen dieselbe deterministische Physik (`shared/physics.js`), deshalb stimmt die Vorschau exakt.
- **Multiplayer reihum**: Räume mit 4-stelligem Code, bis zu 8 Spieler. Wer den Einladungslink öffnet, ist sofort im Raum und kann den Namen in der Lobby ändern. Es wird abwechselnd geschlagen, wer dran ist, sieht groß „DU BIST DRAN“, alle anderen sehen „NAME IST DRAN“ in der Farbe des Spielers. Jede Bahn beginnt ein anderer Spieler, und jeder Zug hat ein Zeitlimit. Läuft es ab, gibt es **+1 Strafschlag**, und der Nächste ist dran. Liegende Gegnerbälle sind Hindernisse.
- **MAGNETISIEREN**: Wer gerade wartet und auf der Bahn selbst noch im Spiel ist (also nicht eingelocht und nicht ohne Schläge), kann seinen liegenden Ball per Knopf (oder Taste `G`) zum Magneten machen oder einen **Puck anklicken** und ihn magnetisieren. Der Magnet zieht dann den Ball des Schützen beim nächsten Schlag stark an. Ein Puck-Magnet wandert mit, wenn der Puck angestoßen wird. Der Schütze sieht das Magnetfeld und die verbogene Flugbahn in der Vorschau. Pro Bahn gibt es 2 Ladungen. Ein Magnet, der erst kurz vor dem Schlag aktiviert wird und in der Vorschau des Schützen noch nicht zu sehen war, gilt erst ab dem nächsten Schlag. So stimmt die Vorschau immer.
- **16 eingebaute Bahnen** in drei Stufen: LEICHT, MITTEL und HART. Harte Bahnen sind rot markiert. In der Lobby sind die Bahnen nach Stufen gruppiert, mit Knöpfen zum Hinzufügen ganzer Stufen. Neue Räume starten mit allen leichten und mittleren Bahnen. Eigene Bahnen erstellst du im Editor (`/editor`) und speicherst sie auf dem Server (`maps/custom/`). Export und Import als JSON gehen auch.

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
| `missPenalty` | 1 | Nicht eingelocht ergibt `maxShots + missPenalty` Schläge in der Statistik |
| `waterPenalty` | 0 | Strafschläge bei Wasser |
| `ballRadius` / `holeRadius` | 8 / 14 | Größe von Ball und Loch |
| `captureSpeed` | 560 | Ist der Ball langsamer, fällt er ins Loch |
| `holePull` | 2600 | Sog am Lochrand |
| `blackHole.radius` / `blackHole.strength` | 180 / 700 | Reichweite und Anziehung (px/s² im Zentrum) des schwarzen Lochs, `0` = aus |
| `blackHole.puckFactor` | 1 | Wie stark Pucks angezogen werden (schwere zusätzlich weniger) |
| `points.holeInOne/eagle/birdie/par/bogey/worse/miss` | 10/7/5/3/2/1/0 | Punkte pro Bahn |
| `points.puck` / `points.heavyPuck` / `points.maxPuckBonus` | 1 / 2 / 5 | Bonus pro versenktem Puck, für schwere Pucks, Höchstwert pro Bahn |
| `points.trickshot` / `points.trickBounces` | 2 / 3 | Trickshot-Bonus und nötige Abpraller |
| `maxShotTime` | 40 | Ein Schlag endet spätestens nach so vielen Sekunden |
| `surfaces.grass/sand/ice` | | `decel` = feste Bremsung, `drag` = Bremsung abhängig vom Tempo |
| `bounce.wall/block/border/bumper/ball` | | Rückprall (1 = verlustfrei, über 1 = beschleunigt) |
| `bounce.bumperKick` | 260 | Zusätzlicher Stoß der Bumper |
| `bounce.band` / `bounce.bandKick` | 1.3 / 140 | Rückprall und Zusatz-Schwung der Gummibänder |
| `glass.breakSpeed` / `glass.keep` / `glass.bounce` | 1100 / 0.55 / 0.6 | Aufprall-Tempo zum Zerbrechen, verbleibender Tempo-Anteil, Rückprall wenn es hält |
| `pucks.bombs.count` / `pucks.bombs.fuse` | 2 / 5 | Bomben pro Bahn und Countdown in Sekunden |
| `pucks.bombs.radius` / `pucks.bombs.force` | 280 / 2600 | Explosionsradius und Wucht |
| `pucks.fieldCount` | 1 | Pucks mit Feld pro Bahn (Art zufällig) |
| `pucks.attract` / `pucks.repel` | `radius` 230/210, `strength` 900/1100 | Reichweite und Stärke von Gravitation bzw. Abstoßung |
| `slopeFactor` / `boostFactor` | 1 / 1 | Multiplikator für alle Hänge bzw. Boosts |
| `preview.width` / `preview.minWidth` | 4 / 1.2 | Dicke der Flugbahn-Vorschau am Ball bzw. Mindestdicke |
| `preview.fade` | 0.8 | Wie stark die Vorschau zum Ende verblasst (0–1) |
| `preview.fadeLength` | 1500 | Weg in px, nach dem die Vorschau maximal dünn und blass ist |
| `pucks.count` | 12 | Pucks pro Bahn (mindestens 10) |
| `pucks.light/medium/heavy` | | `mass`, `radius`, `share` (Anteil) je Gewichtsklasse |
| `pucks.ballMass` / `pucks.bounce` / `pucks.friction` | 1 / 0.8 / 1.4 | Masse des Balls im Vergleich, Elastizität, Reibung der Pucks |
| `ultimate.afterShots` | 5 | Nach so vielen Schlägen ist der nächste Schlag Ultimate (0 = aus) |
| `ultimate.kickRadius` / `ultimate.kickForce` | 2500 / 3000 | Reichweite und Stärke des Wegkick-Stoßes |
| `ultimate.launchFactor` | 0.5 | Startgeschwindigkeit des Ultimate-Balls relativ zum normalen Schlag |
| `ultimate.slowmo` | 0.3 | Zeitlupen-Faktor |
| `ultimate.steerTime` / `ultimate.steerAccel` | 6 / 2600 | Wie lange (Spielsekunden) und wie stark der Ball gesteuert wird |
| `sling.shots` | [2, 4] | Schlagnummern, die Sling-Schläge sind (`[]` = aus) |
| `sling.launchFactor` / `sling.slowmo` | 1 / 0.6 | Startgeschwindigkeit und Zeitlupe beim Sling |
| `sling.steerTime` / `sling.steerAccel` | 2.5 / 1800 | Lenkdauer und Lenkstärke beim Sling |
| `turn.timeLimit` | 45 | Sekunden pro Zug, danach ist der Nächste dran (0 = unbegrenzt) |
| `magnet.usesPerHole` | 2 | Magnet-Ladungen pro Spieler und Bahn (0 = aus) |
| `magnet.strength` / `magnet.radius` | 3200 / 420 | Anziehung direkt am Magneten (nimmt nach außen ab) und Reichweite |
| `fps` | 60 | Bildrate im Browser (0 = unbegrenzt) |
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
| Magnetisieren (wenn ein anderer dran ist) | G oder Knopf (eigener Ball), Klick auf einen Puck |
| Abbrechen | Rechtsklick / Esc |
| Chat | Enter |

## Editor-Elemente

Wand, Gummiband, Glaswand, Block, Bumper, Sand, Eis, Wasser, Hang (konstante Kraft), Boost, Abschlag, Loch.
Rückgängig/Wiederholen, Raster, Duplizieren, Ebenen und ein Testmodus mit voller Vorschau sind eingebaut.

## Struktur

```
server.js            HTTP + Map-API + WebSocket-Räume (autoritative Physik)
shared/physics.js    deterministische Physik (Browser + Node)
public/              Spiel (index.html, game.js), Editor (editor.html, editor.js), common.js
maps/builtin/        eingebaute Bahnen (erzeugt mit tools/genmaps.js)
maps/custom/         im Editor gespeicherte Bahnen
```
