# Skillgolf ⛳

Multiplayer-Minigolf im Browser mit eigenem Map-Editor.

- **Schleuder-Steuerung**: Irgendwo klicken und ziehen. Die Distanz zum Klickpunkt bestimmt die Kraft, der Ball fliegt in Zugrichtung. Beim Loslassen wird geschlagen.
- **Neon-Arcade-Look** mit flackerndem Titel samt Neon-Brummen und -Knistern und vielen weiteren Effekten: Leuchtschweife hinter jedem Ball, Funken bei Treffern, aufblitzende Bumper, Screenshake, Wasser-Splash, Lochwirbel, Feuerwerk bei Birdie und Hole-in-One sowie synthetische Sounds (WebAudio, `M` schaltet den Ton stumm).
- **Pucks**: Auf jeder Bahn liegen mindestens 10 Pucks an zufälligen Stellen. Sie werden echt simuliert und lassen sich anstoßen. Grün ist leicht, gelb mittel, rot schwer und kaum zu bewegen. Pucks können im Wasser versinken, und die Vorschau zeigt auch ihre Bahnen.
- **Handy & Tablet**: Gespielt wird per Touch: irgendwo antippen und ziehen, loslassen schlägt. Zum Abbrechen zurück zum Startpunkt ziehen oder mit einem zweiten Finger tippen. Der Ziehweg für volle Kraft passt sich dem Bildschirm an. Auf kleinen Bildschirmen wird die Leiste schlanker, die Rangliste öffnet sich über 🏆, und ⛶ schaltet auf Vollbild (Android/Tablet). Hochkant erscheint ein Hinweis, das Handy quer zu drehen; man kann aber auch hochkant weiterspielen. Auf dem iPhone gibt es echtes Vollbild nur über „Zum Home-Bildschirm“. Der Map-Editor ist weiterhin für Maus gedacht.
- **Gadgets zum Einsammeln**: Auf dem Feld liegt immer mindestens ein Gadget jeder Sorte (Sling 🌀, Ghost 👻, Eis ❄️, Schleim 🟢, Bombe 💣). Welches Gadget beim nächsten Schlag wirkt, sieht man deutlich: Wer dran ist, bekommt eine große Einblendung („EIS BALL“). Über der Bahn steht ein leuchtender Hinweis mit dem aktiven Gadget und dem, was danach kommt, und in der Leiste ein Badge. Um den Ball läuft ein Ring in Gadget-Farbe, dazu ein Symbol, das auch die Gegner sehen. Jedes bleibt 2–4 Züge liegen und verschwindet dann, fehlende werden zu jedem Zug ergänzt. Rollt dein Ball darüber, sammelst du es ein. Eingesammelte Gadgets stellen sich in eine Reihe, und jeder deiner Schläge verbraucht das vorderste. Zwei Gadgets ergeben also zwei besondere Schläge. Ein erzwungener Ultimate verbraucht keins. Die Vorschau zeigt, welches Gadget dein Schlag einsammeln würde.
  - ❄️ **EIS**: Der nächste Schlag ist ein Eis-Ball. Er ist langsamer (70 %) und schmilzt nach 3,5 s, dann bleibt er liegen, wo er ist. Jeden Puck, den er berührt, friert er ein: Der Puck ist **2 Züge lang unbeweglich** (Zahl über dem Puck) und wirkt wie eine feste Wand. Eingefrorene Bomben werden entschärft. Eine Explosion sprengt das Eis.
  - 🟢 **SCHLEIM**: Beim nächsten Schlag **bleiben berührte Pucks am Ball kleben** und fahren mit, auch Pucks, die den Klumpen berühren. Jeder Puck bremst den Ball, schwere stärker. Bleibt der Ball liegen, fallen die Pucks ab.
  - 💣 **BOMBE**: Wird nicht aufgehoben, sondern gezündet. Zu Beginn des nächsten Zugs explodiert es **an deinem Ball und an allen anderen liegenden Bällen**. Alle fliegen weg (ins Wasser = zurück zum Abschlag, ins Loch = eingelocht), und **5 neue Bomben** liegen auf der Bahn.
  - 🌀 **SLING**: Der nächste Schlag ist ein Sling-Ball. Nach dem Abschlag lenkst du den Ball 2,5 Sekunden lang mit der Maus, in leichter Zeitlupe.
  - 👻 **GHOST**: Der nächste Schlag ist ein Geist. Er fliegt durch Pucks und Gegnerbälle und ist immun gegen alle Effekte: Feld-Pucks, Magnete, Sog des schwarzen Lochs, Hänge, Boosts, Sand, Eis und Wasser. Bomben macht er nicht scharf. Wände und Glas halten ihn weiter auf, einlochen kann er normal.
- **ULTIMATE BALL**: Nach 5 Schlägen erscheint „next BALL is ULTIMATE BALL“, und der nächste Schlag ist erzwungen ein Ultimate-Schlag. Der Ball startet mit halber Geschwindigkeit, dann läuft das Spiel in Zeitlupe und du steuerst den Ball 6 Sekunden lang mit der Maus. Er **gleitet über Wasser**. Bleibt er am Ende darauf liegen, zählt es aber als Wasser. Hältst du dabei die **linke Maustaste** gedrückt, zieht ein Zugstrahl den Ball direkt zum Mauszeiger. Der Hinweis dazu steht oben im Bild. Dabei **frisst er gnadenlos alles auf seinem Weg** und wird mit jedem Bissen größer: Pucks, Bomben, Gegnerbälle, Wände, Blöcke, Bumper, Gummibänder und Glas. Gefressene Hindernisse bleiben bis zum Ende der Bahn weg. Gefressene Gegnerbälle landen wieder am Abschlag, das kostet sie aber keinen Schlag. Nur der Außenrand hält stand. Die anderen Spieler sehen das live und können währenddessen nicht schlagen.
- **Gegnerbälle sind beweglich**: Triffst du einen liegenden Gegnerball, schubst du ihn weg (Billard!). Schleuderst du ihn ins Wasser, muss er **zurück zum Abschlag**, das gilt auch bei Explosionen. Fällt er ins Loch, **zählt das als eingelocht** (mit seiner bisherigen Schlagzahl, mindestens 1). Das gilt auch, wenn ihn eine Explosion oder ein Gravity-Puck hineinschleudert. Fällt dein eigener Ball ins Wasser, kommt er wie bisher an die Stelle zurück, von der du geschlagen hast. Die Vorschau zeigt auch, wohin er rollt.
- **Gummibänder** (orange, mit Pfosten): Der Ball prallt schneller zurück, als er kam, und das Band schwingt nach.
- **Glaswände**: Ein schneller Ball zerbricht die Scheibe und verliert dabei knapp die Hälfte seines Tempos. Ist er zu langsam, prallt er ab. Kaputtes Glas bleibt für alle bis zum Ende der Bahn weg.
- **Gravity-Puck (Taste `F`)**: Einmal pro Bahn kannst du in deinem Zug statt des Balls einen lila Gravitations-Puck abschießen, er startet direkt vor deinem Ball. Das zählt **nicht** als Schlag. Danach schlägst du ganz normal und kannst den Puck so nutzen, um deinen Schuss umzulenken. Ein kleiner Hinweis im HUD erinnert daran, auf dem Handy kann man ihn antippen. Beim Ziehen zeigt eine lila Vorschau, wo der Puck liegen bleibt.
- **Bomben** (schwarz mit Zündschnur, 3 pro Bahn, groß oder klein): Ab deinem **2. Schlag** auf einer Bahn macht jede Berührung sie scharf, vom Ball oder von einem anderen Puck. Beim 1. Schlag verhalten sie sich wie normale Pucks und zeigen „🔒 ab 2. Schlag“. Scharfe Bomben zeigen einen Countdown, der erst nach dem Zug losläuft und nur, während jemand zielt. Bei 0 explodieren sie: Große Bomben knallen stärker und weiter als kleine. Pucks und liegende Bälle fliegen weg, andere Bomben im Radius werden scharf. Dabei kommen **neue Pucks zum Vorschein** (große Bombe 5, kleine 3), jeder davon mit 1 % Wahrscheinlichkeit ein Gravitations- oder Abstoß-Puck. Für weggeschleuderte Bälle gilt dasselbe wie oben (Wasser = zurück zum Abschlag, Loch = eingelocht). Die Explosion **unterbricht den Zug nicht**: Die Zeit läuft weiter, und du kannst sofort schlagen, auch während es noch knallt.
- **Zugzeit 23 Sekunden**: Ein großer Countdown über dem Spielfeld zeigt die Restzeit. Die Zahl wird immer größer, je weniger Zeit bleibt, und färbt sich in den letzten 5 Sekunden rot und tickt.
- **Feld-Puck**: Auf jeder Bahn hat genau ein Puck ein Feld, zufällig eins von beiden: lila zieht den rollenden Ball an (Gravitation), orange drückt ihn weg (Abstoßung). Die Ringe laufen bei Gravitation nach innen und bei Abstoßung nach außen. Das Feld wirkt auch auf die **liegenden Bälle der anderen Spieler**, solange sich etwas bewegt (Schuss, Explosion, Gravity-Puck): Im Umkreis von gut 200 px rutschen sie zum lila Puck und bleiben dort liegen, der orange schiebt sie weg.
- **Schwarzes Loch**: Das Loch zieht in seinem Umkreis alles an, also Ball, Pucks und sogar die Funken. Schnelle Bälle werden in einer Kurve abgelenkt. Kommt der Ball im Wirkungsbereich zur Ruhe, wird er **immer** hineingezogen, auch auf Sand und auch als Geist. Pucks, die hineingeraten, werden verschluckt. Die Vorschau zeigt auch das exakt.
- **Punktesystem (mehr ist besser)**: Pro Bahn gibt es Punkte nach Schlägen im Vergleich zum Par. Hole-in-One 10, Eagle 7, Birdie 5, Par 3, Bogey 2, schlechter 1, nicht eingelocht 0. Dazu kommen Boni: Für jeden Puck, den du **ins schwarze Loch** beförderst, gibt es **+2**, für schwere Pucks +3, höchstens 10 pro Bahn. Das zählt beim Schlag, mit deinem Gravity-Puck und mit dem Bomben-Gadget, aber nicht für deinen eigenen Gravity-Puck. Die Punkte erscheinen groß am Loch. Für einen Puck im Wasser oder einen, den der Ultimate frisst, gibt es +1, bei schweren +2, höchstens 5 pro Bahn. Ein **Trickshot** bringt +2, wenn der einlochende Schlag mindestens 3 Abpraller hatte. Die Rangliste sortiert nach Punkten, bei Gleichstand nach weniger Schlägen.
- **7 Schläge pro Bahn.**
- **Flugbahn-Vorschau** erscheint erst, wenn du ziehst. Sie zeigt den ganzen Weg deines eigenen Balls bis zum Stillstand. Wohin getroffene Pucks und Gegnerbälle rollen, zeigt sie nicht. Mit `"preview": { "pucks": true }` in der `config.json` siehst du auch deren Wege, mit `"untilFirstHit": true` endet die Vorschau beim ersten Aufprall.
- **Multiplayer reihum**: Räume mit 4-stelligem Code, bis zu 8 Spieler. Wer den Einladungslink öffnet, ist sofort im Raum und kann den Namen in der Lobby ändern. Es wird abwechselnd geschlagen, wer dran ist, sieht groß „DU BIST DRAN“, alle anderen sehen „NAME IST DRAN“ in der Farbe des Spielers. Jede Bahn beginnt ein anderer Spieler, und jeder Zug hat ein Zeitlimit. Läuft es ab, gibt es **+1 Strafschlag**, und der Nächste ist dran. Liegende Gegnerbälle sind Hindernisse.
- **MAGNETISIEREN**: Wer gerade wartet und auf der Bahn selbst noch im Spiel ist (also nicht eingelocht und nicht ohne Schläge), kann seinen liegenden Ball per Knopf (oder Taste `G`) zum Magneten machen oder einen **Puck anklicken** und ihn magnetisieren. Der Magnet zieht dann den Ball des Schützen beim nächsten Schlag stark an. Ein Puck-Magnet wandert mit, wenn der Puck angestoßen wird. Der Schütze sieht das Magnetfeld und die verbogene Flugbahn in der Vorschau. Pro Bahn gibt es 2 Ladungen. Ein Magnet, der erst kurz vor dem Schlag aktiviert wird und in der Vorschau des Schützen noch nicht zu sehen war, gilt erst ab dem nächsten Schlag. So stimmt die Vorschau immer.
- **16 eingebaute Bahnen** in drei Stufen: LEICHT, MITTEL und HART. Harte Bahnen sind rot markiert. In der Lobby sind die Bahnen nach Stufen gruppiert, mit Knöpfen zum Hinzufügen ganzer Stufen. Neue Räume starten mit allen leichten und mittleren Bahnen. Eigene Bahnen erstellst du im Editor (`/editor`) und speicherst sie auf dem Server (`maps/custom/`). Export und Import als JSON gehen auch.

## Start

```bash
npm install
npm start            # http://localhost:3100 (PORT per Umgebungsvariable änderbar)
```

## Leistung

- Das Neon-Leuchten kommt aus einem einzigen **Bloom**-Durchgang pro Bild statt aus vielen einzelnen Weichzeichner-Schatten. Der Look ist derselbe, der Aufwand nur ein Bruchteil.
- Das schwarze Loch, Feld-Schleier und der Hintergrund sind **vorgerendert** und werden nur noch eingefügt bzw. gedreht.
- Die **Flugbahn-Vorschau** rechnet in einem Hintergrund-Thread (`public/predict-worker.js`). Das Bild ruckelt beim Ziehen nicht mehr, und die Vorschau bleibt exakt, weil der Thread dieselbe Physik nutzt.
- **Spar-Modus** ⚡: Fällt die Bildrate 6 Sekunden lang unter etwa 30 FPS, schaltet das Spiel automatisch auf weniger Effekte, weniger Partikel und einfache Auflösung um. Der Knopf ✨/⚡ oben rechts schaltet von Hand um, die Wahl wird gemerkt.

## Updates (auch bei privatem Repo)

Skillgolf bringt einen Updater mit: `tools/update.sh` holt den neuesten Stand von GitHub und installiert neue Abhängigkeiten nur, wenn sich `package-lock.json` geändert hat. Die Admin-Seite **`/admin`** zeigt die Version und hat Knöpfe für „Nach Updates suchen“, „Update installieren & neu starten“ und „Nur neu starten“.

**Einrichtung (einmalig):**

1. **GitHub-Token erstellen**: GitHub → Settings → Developer settings → *Fine-grained tokens* → *Generate new token*. Unter *Repository access* nur `habobababo/skillgolf` auswählen und bei *Permissions → Contents* **Read-only** einstellen. Mehr Rechte braucht der Token nicht.
2. **`update.json` anlegen** (Vorlage: `update.example.json`, die Datei liegt nicht im Repo):
   ```json
   { "githubToken": "github_pat_…", "adminPassword": "langes-passwort", "autoUpdate": false }
   ```
   `chmod 600 update.json`, damit nur der Server-Benutzer sie lesen kann.
3. **Server neu starten**. Danach unter `http://dein-server:3100/admin` mit dem Passwort anmelden.

**Updaten:** auf `/admin` „Nach Updates suchen“ und dann „Update installieren“ klicken. Oder auf dem Server `tools/update.sh` ausführen und den Server neu starten. Sind gerade Spieler online, fragt die Seite vorher nach, weil laufende Spiele beim Neustart verloren gehen. Die Spieler sehen „Server wird aktualisiert“, ihre Browser laden danach automatisch neu.

**Neustart:** Läuft der Server unter **systemd** oder **pm2**, beendet er sich nach dem Update, und der Dienst startet ihn neu. Eine fertige Vorlage liegt in `tools/skillgolf.service`. Läuft er einfach per `npm start`, startet er sich selbst als neuen Prozess, die Ausgabe landet dann in `server.log`. Mit `"restart": "sudo systemctl restart skillgolf"` in `update.json` kannst du auch einen eigenen Befehl angeben.

**Auto-Update:** Mit `"autoUpdate": true` prüft der Server alle `checkMinutes` Minuten (Standard 30) und installiert Updates von selbst, aber nur, wenn gerade niemand spielt.

Fehlt im Server-Ordner der Git-Remote `origin`, trägt der Updater `https://github.com/habobababo/skillgolf.git` selbst ein. Eine andere Adresse gibst du mit `"repoUrl"` in `update.json` vor. Heißt der Remote anders, nimmt er den vorhandenen. Heißt der lokale Branch anders als auf GitHub, nimmt er `main`.

Der Token wird nur für den einzelnen `git fetch` mitgegeben und nirgends gespeichert, weder in `.git/config` noch in der Repo-Adresse. `config.json`, `update.json` und eigene Bahnen in `maps/custom/` bleiben bei Updates unverändert.

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
| `points.holePuck` / `points.holeHeavy` / `points.maxHoleBonus` | 2 / 3 / 10 | Bonus pro Puck im schwarzen Loch, für schwere, Höchstwert pro Bahn |
| `points.puck` / `points.heavyPuck` / `points.maxPuckBonus` | 1 / 2 / 5 | Bonus pro Puck im Wasser/vom Ultimate gefressen, für schwere, Höchstwert pro Bahn |
| `points.trickshot` / `points.trickBounces` | 2 / 3 | Trickshot-Bonus und nötige Abpraller |
| `maxShotTime` | 20 | Spätestens nach so vielen Sekunden endet jeder Schlag (z. B. wenn ein Ball um einen Magneten kreist) |
| `surfaces.grass/sand/ice` | | `decel` = feste Bremsung, `drag` = Bremsung abhängig vom Tempo |
| `bounce.wall/block/border/bumper/ball` | | Rückprall (1 = verlustfrei, über 1 = beschleunigt) |
| `bounce.bumperKick` | 260 | Zusätzlicher Stoß der Bumper |
| `bounce.band` / `bounce.bandKick` | 1.3 / 140 | Rückprall und Zusatz-Schwung der Gummibänder |
| `glass.breakSpeed` / `glass.keep` / `glass.bounce` | 1100 / 0.55 / 0.6 | Aufprall-Tempo zum Zerbrechen, verbleibender Tempo-Anteil, Rückprall wenn es hält |
| `pucks.bombs.count` / `pucks.bombs.fuse` | 3 / 5 | Bomben pro Bahn und Countdown in Sekunden |
| `pucks.bombs.armFromShot` / `pucks.bombs.fromHole` | 2 / 1 | Ab welchem Schlag Bomben scharf werden; ab welcher Bahn es Bomben gibt |
| `pucks.bombs.bigShare` | 0.5 | Anteil großer Bomben |
| `pucks.bombs.big` / `pucks.bombs.small` | r 20 / 10, Explosion 340 / 190 px, Wucht 3000 / 1900, 5 / 3 neue Pucks | Größe, Explosionsradius, Wucht und freigesprengte Pucks je Bombengröße |
| `pucks.bombs.fieldChance` | 0.01 | Chance, dass ein freigesprengter Puck Gravitation/Abstoßung hat |
| `gravityPuck.perHole` / `gravityPuck.speed` | 1 / 1 | Gravity-Pucks pro Spieler und Bahn, Abschuss-Tempo relativ zum Ball |
| `pucks.fieldCount` | 1 | Pucks mit Feld pro Bahn (Art zufällig) |
| `pucks.attract` / `pucks.repel` | `radius` 300/210, `strength` 1800/1100 | Reichweite und Stärke von Gravitation bzw. Abstoßung |
| `slopeFactor` / `boostFactor` | 1 / 1 | Multiplikator für alle Hänge bzw. Boosts |
| `preview.width` / `preview.minWidth` | 4 / 1.2 | Dicke der Flugbahn-Vorschau am Ball bzw. Mindestdicke |
| `preview.fade` | 0.8 | Wie stark die Vorschau zum Ende verblasst (0–1) |
| `preview.fadeLength` | 1500 | Weg in px, nach dem die Vorschau maximal dünn und blass ist |
| `pucks.count` | 12 | Pucks pro Bahn (mindestens 10) |
| `pucks.light/medium/heavy` | | `mass`, `radius`, `share` (Anteil) je Gewichtsklasse |
| `pucks.ballMass` / `pucks.bounce` / `pucks.friction` | 1 / 0.8 / 1.4 | Masse des Balls im Vergleich, Elastizität, Reibung der Pucks |
| `ultimate.afterShots` | 5 | Nach so vielen Schlägen ist der nächste Schlag Ultimate (0 = aus) |
| `ultimate.waterWalk` | true | Ultimate gleitet über Wasser |
| `ultimate.pullAccel` / `ultimate.pullDamp` | 7000 / 3.5 | Zugstrahl (linke Maustaste): Stärke und Dämpfung |
| `ultimate.eat` / `ultimate.grow` / `ultimate.maxScale` | true / 2.5 / 3 | Ultimate frisst alles; Wachstum pro Bissen (px) und maximale Größe |
| `ultimate.kickRadius` / `ultimate.kickForce` | 2500 / 3000 | Wegkick-Stoß beim Abschlag (nur wenn `eat` aus ist) |
| `ultimate.launchFactor` | 0.5 | Startgeschwindigkeit des Ultimate-Balls relativ zum normalen Schlag |
| `ultimate.slowmo` | 0.3 | Zeitlupen-Faktor |
| `ultimate.steerTime` / `ultimate.steerAccel` | 6 / 2600 | Wie lange (Spielsekunden) und wie stark der Ball gesteuert wird |
| `gadgets.sling` / `gadgets.ghost` | `min` 1, `max` 2 | Wie viele Gadgets jeder Sorte pro Zug erscheinen |
| `gadgets.radius` | 16 | Größe der Gadgets |
| `gadgets.life` | [2, 4] | So viele Züge bleibt ein Gadget liegen (zufällig dazwischen) |
| `gadgets.ice` / `gadgets.slime` / `gadgets.bomb` | `min`/`max` 1 | Anzahl pro Zug wie oben |
| `gadgets.ice.speed` / `.life` / `.turns` | 0.7 / 3.5 / 2 | Eis-Ball: Tempo-Faktor, Sekunden bis er schmilzt, Züge, die ein Puck eingefroren bleibt |
| `gadgets.slime.slow` / `.minKeep` / `.drag` | 0.12 / 0.35 / 0.6 | Schleim: Bremsung je Puck (`1/(1+slow·Masse)`, mindestens `minKeep`), zusätzliche Reibung je klebendem Puck |
| `gadgets.bomb.bombs` | 5 | Neue Bomben nach dem Bomben-Gadget |
| `magnet.damp` | 2.5 | Dämpfung im Magnetfeld, damit der Ball zur Ruhe kommt statt zu kreisen |
| `blackHole.alwaysPull` | true | Ball im Wirkungsbereich wird immer hineingezogen |
| `sling.launchFactor` / `sling.slowmo` | 1 / 0.6 | Startgeschwindigkeit und Zeitlupe beim Sling |
| `sling.steerTime` / `sling.steerAccel` | 2.5 / 1800 | Lenkdauer und Lenkstärke beim Sling |
| `turn.timeLimit` | 23 | Sekunden pro Zug, danach ist der Nächste dran (0 = unbegrenzt) |
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
| Gravity-Puck abschießen (zählt nicht als Schlag, 1× pro Bahn) | F, dann zielen & loslassen |
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
updater.js           Updater + Admin-API (/admin, /api/admin/*)
tools/update.sh      Update holen (Token aus update.json), Abhängigkeiten installieren
tools/skillgolf.service  Vorlage für einen systemd-Dienst
```
