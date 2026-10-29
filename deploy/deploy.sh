#!/usr/bin/env bash
# Déploie Tripbook sur un serveur Debian/Ubuntu (VPS, Oracle Cloud, Google Cloud…) en une commande, re-exécutable.
#
#   deploy/deploy.sh utilisateur@hôte [--domain voyage.exemple.fr] [--no-push] [--dry-run] [--dir /opt/tripbook]
#
# - installe python3, rsync, Caddy (HTTPS automatique) ; crée l'utilisateur système « tripbook »
# - copie le code ; copie data/trip.json et data/files/ SEULEMENT s'ils n'existent pas encore (jamais d'écrasement)
# - crée /opt/tripbook/.env s'il manque : un jeton par voyageur (trip.json) + un pour l'assistant, clé de partage, TRIP_URL
# - service systemd « tripbook », Caddyfile (<ip-tirets>.sslip.io ou --domain), ouverture 80/443 dans iptables si besoin
# - vérifie /api/health, affiche les liens, écrit .env à la racine du dépôt (TRIP_URL + TRIP_TOKEN de l'assistant)
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"; shift || true
DIR=/opt/tripbook; DOMAIN=""; PUSH=1; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --no-push) PUSH=0; shift ;;
    --dry-run) DRY=1; shift ;;
    --dir) DIR="$2"; shift 2 ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
done
[ -n "$TARGET" ] || { sed -n 2,12p "$0"; exit 2; }
for t in ssh rsync openssl; do command -v $t >/dev/null || { echo "Il manque « $t » sur cet ordinateur." >&2; exit 2; }; done
[ -f "$HERE/data/trip.json" ] || echo "!! data/trip.json absent en local : le serveur devra en avoir un (skill trip-setup). Je continue."

AGENT="$(grep -E '^TRIP_AGENT=' "$HERE/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"; AGENT="${AGENT:-Claude}"
run() { if [ "$DRY" = 1 ]; then echo "+ $*"; else "$@"; fi; }
# root direct, sinon sudo sans mot de passe (sudo -n : échoue tout de suite plutôt que d'attendre un mot de passe)
if [ "$DRY" = 1 ]; then SUDO=sudo; else SUDO="$(ssh -o BatchMode=yes "$TARGET" 'if [ "$(id -u)" = 0 ]; then echo ""; else echo sudo; fi')" || { echo "Connexion SSH impossible vers $TARGET (clé SSH ?)" >&2; exit 1; }; fi
SUDO_N="${SUDO:+$SUDO -n}"
remote() { if [ "$DRY" = 1 ]; then echo "+ ssh $TARGET $SUDO bash -s <<'EOF'"; cat; echo "EOF"; else ssh -o BatchMode=yes "$TARGET" $SUDO_N bash -s; fi; }

echo "▶ 1/6 Préparation du serveur ($TARGET)"
remote <<EOF
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-venv rsync curl ca-certificates >/dev/null
if ! command -v caddy >/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
id tripbook >/dev/null 2>&1 || useradd --system --home-dir $DIR --shell /usr/sbin/nologin tripbook
mkdir -p $DIR/data/files
chown -R tripbook:tripbook $DIR
EOF

echo "▶ 2/6 Copie du code"
run rsync -az --delete --rsync-path="$SUDO_N rsync" \
  --exclude '.git' --exclude '.gstack' --exclude '.env' --exclude 'data' --exclude '__pycache__' --exclude 'venv' \
  "$HERE/server.py" "$HERE/app" "$HERE/deploy" "$HERE/docs" "$HERE/.claude" "$HERE/CLAUDE.md" "$HERE/README.md" "$TARGET:$DIR/"
if [ -f "$HERE/data/trip.json" ]; then
  if [ "$DRY" = 1 ] || ! ssh "$TARGET" "$SUDO_N test -f $DIR/data/trip.json"; then
    echo "   data/trip.json : première copie"
    run bash -c "ssh '$TARGET' '$SUDO_N tee $DIR/data/trip.json >/dev/null' < '$HERE/data/trip.json'"
  else
    echo "   data/trip.json : déjà présent sur le serveur, conservé"
  fi
fi
if [ -d "$HERE/data/files" ]; then
  run rsync -az --ignore-existing --rsync-path="$SUDO_N rsync" --exclude '.gitkeep' "$HERE/data/files/" "$TARGET:$DIR/data/files/"
fi

echo "▶ 3/6 Configuration (.env, venv, systemd, Caddy)"
remote <<EOF
set -e
cd $DIR
chown -R tripbook:tripbook $DIR
HOST="$DOMAIN"
if [ -z "\$HOST" ]; then IP=\$(curl -4 -s https://api.ipify.org || curl -4 -s https://ifconfig.me); HOST="\$(echo "\$IP" | tr . -).sslip.io"; fi
echo "\$HOST" > $DIR/.host
if [ ! -f .env ]; then
  TRAVELERS=\$(python3 -c "import json,re; t=json.load(open('data/trip.json'))['trip'].get('travelers') or ['voyageur']; print(','.join(re.sub(r'[^\w]','',x.lower()) or 'voyageur' for x in t))" 2>/dev/null || echo voyageur)
  TOKS=""
  for n in \$(echo "\$TRAVELERS" | tr , ' ') $(echo "$AGENT" | tr 'A-Z' 'a-z'); do TOKS="\$TOKS\$n:\$(openssl rand -hex 16),"; done
  cat > .env <<ENV
TRIP_TOKENS=\${TOKS%,}
TRIP_AGENT=$AGENT
TRIP_HOST=127.0.0.1
TRIP_PORT=8787
TRIP_URL=https://\$HOST
TRIP_SHARE_KEY=\$(openssl rand -hex 12)
ENV
  chmod 600 .env; chown tripbook:tripbook .env
  echo "   .env créé"
else
  sed -i "s#^TRIP_URL=.*#TRIP_URL=https://\$HOST#" .env
  echo "   .env conservé (TRIP_URL=https://\$HOST)"
fi
PY=/usr/bin/python3
if [ "$PUSH" = 1 ]; then
  [ -d venv ] || python3 -m venv venv
  venv/bin/pip install -q --upgrade pip >/dev/null
  venv/bin/pip install -q pywebpush py-vapid cryptography >/dev/null && PY=$DIR/venv/bin/python || echo "   !! pywebpush non installé : sans notifications push"
  chown -R tripbook:tripbook venv
fi
sed -e "s#__DIR__#$DIR#g" -e "s#__PYTHON__#\$PY#g" deploy/tripbook.service > /etc/systemd/system/tripbook.service
cat > /etc/caddy/Caddyfile <<CADDY
\$HOST {
    reverse_proxy 127.0.0.1:8787 {
        flush_interval -1
    }
}
CADDY
# images Oracle Cloud : tout est rejeté sauf SSH → ouvrir 80 et 443
if iptables -S INPUT 2>/dev/null | grep -q REJECT; then
  for p in 80 443; do iptables -C INPUT -p tcp --dport \$p -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport \$p -j ACCEPT; done
  command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true
fi
systemctl daemon-reload
systemctl enable -q tripbook caddy
systemctl restart tripbook
systemctl reload caddy 2>/dev/null || systemctl restart caddy
EOF

echo "▶ 4/6 Vérification"
HOST="$DOMAIN"
if [ "$DRY" = 1 ]; then HOST="${HOST:-<ip-tirets>.sslip.io}"; else HOST="$(ssh "$TARGET" "$SUDO_N cat $DIR/.host")"; fi
if [ "$DRY" = 0 ]; then
  sleep 2
  ssh "$TARGET" "curl -fsS http://127.0.0.1:8787/api/health" >/dev/null && echo "   serveur : ok" || { echo "   !! le serveur ne répond pas : ssh $TARGET sudo journalctl -u tripbook -n 50"; exit 1; }
  ok=0; for i in 1 2 3 4 5 6; do curl -fsS -m 10 "https://$HOST/api/health" >/dev/null 2>&1 && { ok=1; break; }; sleep 5; done
  [ "$ok" = 1 ] && echo "   HTTPS : ok (https://$HOST)" || echo "   !! HTTPS pas encore joignable : ports 80/443 ouverts chez l'hébergeur ? (ssh $TARGET sudo journalctl -u caddy -n 30)"
fi

echo "▶ 5/6 Jetons"
if [ "$DRY" = 0 ]; then
  ENVTXT="$(ssh "$TARGET" "$SUDO_N cat $DIR/.env")"
  TOKS="$(echo "$ENVTXT" | grep '^TRIP_TOKENS=' | cut -d= -f2-)"
  SHARE="$(echo "$ENVTXT" | grep '^TRIP_SHARE_KEY=' | cut -d= -f2-)"
  AGENT_LC="$(echo "$AGENT" | tr 'A-Z' 'a-z')"; AGENT_TOK=""
  echo "$TOKS" | tr , '\n' | while IFS=: read -r n t; do
    [ "$n" = "$AGENT_LC" ] && continue
    echo "   $n : https://$HOST/?token=$t"
  done
  AGENT_TOK="$(echo "$TOKS" | tr , '\n' | grep "^$AGENT_LC:" | cut -d: -f2- || true)"
  [ -n "$SHARE" ] && echo "   partage : https://$HOST/partage/?k=$SHARE&nom=Prénom"
  echo "▶ 6/6 .env local (pour l'assistant)"
  if [ -n "$AGENT_TOK" ]; then
    printf 'TRIP_URL=https://%s\nTRIP_TOKEN=%s\nTRIP_AGENT=%s\n' "$HOST" "$AGENT_TOK" "$AGENT" > "$HERE/.env"
    echo "   $HERE/.env écrit"
  fi
else
  echo "   (dry-run) les jetons seront générés sur le serveur"
fi
echo
echo "Terminé. iPhone : ouvrir le lien dans Safari → Partager → « Sur l'écran d'accueil ». Android : Chrome → Installer l'application."
echo "Mise à jour du code plus tard : relancer cette même commande (trip.json et .env du serveur sont conservés)."
