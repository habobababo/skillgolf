#!/usr/bin/env bash
# Skillgolf-Updater: holt den neuesten Stand von GitHub (auch aus einem privaten Repo)
# und installiert bei Bedarf die Abhängigkeiten neu.
#
#   tools/update.sh           Update installieren
#   tools/update.sh --check   nur nachsehen, ob es etwas Neues gibt
#
# Zugang zum privaten Repo: GitHub-Token (nur Lesen) in update.json ("githubToken")
# oder in der Umgebungsvariable GITHUB_TOKEN. Der Token wird nur für diesen Aufruf
# mitgegeben und nirgends gespeichert (nicht in .git/config, nicht in der Remote-URL).
#
# Ausgabe-Zeilen für den Server: AKTUELL <hash> | NEU <anzahl> | AKTUALISIERT <alt> -> <neu> | FEHLER: …
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
export GIT_TERMINAL_PROMPT=0   # nie interaktiv nach Passwort fragen (würde im Server hängen)

fail() { echo "FEHLER: $*"; exit 2; }

ROOT="$(pwd -P)"
# Gehört der Ordner einem anderen Benutzer (z. B. root), verweigert Git sonst die Arbeit
# ("dubiose Besitzverhältnisse"). Wir erlauben genau diesen Ordner – nur für diesen Aufruf.
git() { command git -c safe.directory="$ROOT" "$@"; }

# Darf der Server-Benutzer hier überhaupt schreiben?
if [ ! -w "$ROOT" ] || [ ! -w "$ROOT/.git" ] || [ -n "$(find "$ROOT/.git" "$ROOT/public" "$ROOT/shared" ! -writable -print -quit 2>/dev/null)" ]; then
  OWNER="$(stat -c %U "$ROOT" 2>/dev/null || echo ?)"
  fail "Keine Schreibrechte im Ordner $ROOT (gehört: $OWNER, Updater läuft als: $(id -un)). Einmalig auf dem Server ausführen: sudo chown -R $(id -un): $ROOT"
fi

[ -d .git ] || fail "Kein Git-Repo. Skillgolf muss per 'git clone' installiert sein, damit der Updater funktioniert."

TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f update.json ]; then
  TOKEN="$(node -e 'try{process.stdout.write(String(require("./update.json").githubToken||""))}catch(e){}')"
fi

# Remote bestimmen: 'origin', sonst der erste vorhandene, sonst die Skillgolf-Adresse eintragen
# (eigene Adresse möglich über "repoUrl" in update.json)
DEFAULT_URL="$(node -e 'try{process.stdout.write(String(require("./update.json").repoUrl||""))}catch(e){}' 2>/dev/null)"
[ -n "$DEFAULT_URL" ] || DEFAULT_URL="https://github.com/habobababo/skillgolf.git"
REMOTE=origin
if ! git remote get-url origin >/dev/null 2>&1; then
  FIRST="$(git remote | head -1)"
  if [ -n "$FIRST" ]; then REMOTE="$FIRST"; echo "Kein 'origin' – nutze Remote '$REMOTE'."
  else git remote add origin "$DEFAULT_URL" || fail "Konnte Remote nicht eintragen."; echo "Remote 'origin' eingetragen: $DEFAULT_URL"; fi
fi
URL="$(git remote get-url "$REMOTE")"
# Alte Repo-Adresse (vor der Umbenennung) automatisch korrigieren
case "$URL" in
  *habobababo/skillshot*) NEWURL="${URL/habobababo\/skillshot/habobababo/skillgolf}"; git remote set-url "$REMOTE" "$NEWURL"; URL="$NEWURL"; echo "Repo-Adresse angepasst: $URL" ;;
esac
# Token nie in der URL speichern – falls doch einer drinsteht, entfernen
case "$URL" in
  https://*@github.com/*) CLEAN="https://github.com/${URL#*@github.com/}"; git remote set-url "$REMOTE" "$CLEAN"; URL="$CLEAN"; echo "Zugangsdaten aus der Repo-Adresse entfernt." ;;
esac

GIT=(git)   # die Funktion oben (mit safe.directory)
if [ -n "$TOKEN" ]; then
  case "$URL" in
    https://github.com/*)
      B64="$(printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')"
      GIT=(git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $B64") ;;
    *) echo "Hinweis: Repo-Adresse ist kein https://github.com/… – der Token wird nicht benutzt (SSH-Schlüssel?)." ;;
  esac
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" != "HEAD" ] || fail "Kein Branch ausgecheckt (detached HEAD)."
# Branch auf GitHub: gleicher Name wie lokal, sonst main
RBRANCH="$BRANCH"
if ! OUT="$("${GIT[@]}" fetch --quiet "$REMOTE" 2>&1)"; then
  echo "$OUT" | sed 's/^/  /'
  if echo "$OUT" | grep -qiE 'authentication|could not read username|not found|403|401'; then
    fail "GitHub verweigert den Zugriff. Ist der Token in update.json gültig und hat er Lesezugriff auf das Repo (Contents: Read)?"
  fi
  fail "git fetch fehlgeschlagen."
fi
git rev-parse --verify --quiet "$REMOTE/$RBRANCH" >/dev/null || RBRANCH=main
git rev-parse --verify --quiet "$REMOTE/$RBRANCH" >/dev/null || fail "Branch '$BRANCH' bzw. 'main' gibt es auf $URL nicht."

LOCAL="$(git rev-parse --short HEAD)"
BEHIND="$(git rev-list --count "HEAD..$REMOTE/$RBRANCH")"
if [ "$BEHIND" = "0" ]; then echo "AKTUELL $LOCAL"; exit 0; fi

echo "NEU $BEHIND"
git log --format='  %h %ad  %s' --date=format:'%d.%m. %H:%M' "HEAD..$REMOTE/$RBRANCH" | head -30
[ "${1:-}" = "--check" ] && exit 0

if ! git diff --quiet || ! git diff --cached --quiet; then
  git status --short | sed 's/^/  /'
  fail "Im Ordner wurden Dateien von Hand geändert (siehe oben). Bitte sichern oder mit 'git checkout -- <datei>' verwerfen. config.json, update.json und eigene Bahnen sind davon nicht betroffen."
fi

OLDLOCK="$(git rev-parse HEAD:package-lock.json 2>/dev/null || echo none)"
git merge --ff-only --quiet "$REMOTE/$RBRANCH" || fail "Update ließ sich nicht einspielen (lokale Commits?). Mit 'git status' nachsehen."
NEWLOCK="$(git rev-parse HEAD:package-lock.json 2>/dev/null || echo none)"

if [ "$OLDLOCK" != "$NEWLOCK" ] || [ ! -d node_modules ]; then
  echo "Installiere Abhängigkeiten …"
  # Server-Benutzer wie www-data haben oft kein beschreibbares Home -> npm-Cache im Projektordner
  [ -w "${HOME:-/nonexistent}" ] || export npm_config_cache="$ROOT/.npm-cache"
  npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -3 || fail "npm ci fehlgeschlagen."
fi

echo "AKTUALISIERT $LOCAL -> $(git rev-parse --short HEAD)"
