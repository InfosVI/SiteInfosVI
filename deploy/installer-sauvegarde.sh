#!/usr/bin/env bash
# Sauvegarde hors du serveur (Backblaze B2), à lancer une seule fois : sudo bash installer-sauvegarde.sh
# - demande les accès au compartiment B2 (la clé reste invisible à l'écran) ;
# - génère la clé de chiffrement des copies (à garder HORS du serveur : sans elle, les copies sont illisibles) ;
# - prépare le stockage chiffré, envoie une première copie, puis vérifie qu'on sait la relire (test de restauration).
# Ensuite, chaque nuit (03 h 47 UTC) et avant chaque mise en ligne, une copie chiffrée part automatiquement :
# 30 copies quotidiennes, puis une par mois pendant 6 mois.
set -euo pipefail
cd /opt/indemnite
vert(){ printf '\033[32m✓ %s\033[0m\n' "$*"; }
erreur(){ printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || erreur "À lancer avec sudo."
ajouter(){ if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1='$2'|" .env; else echo "$1='$2'" >> .env; fi; }
set -a; . ./.env; set +a
RESTIC="restic/restic:0.18.0"
restic(){ docker run --rm -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e B2_ACCOUNT_ID -e B2_ACCOUNT_KEY "$@"; }

if [ -n "${RESTIC_REPOSITORY:-}" ] && [ -n "${RESTIC_PASSWORD:-}" ]; then
  vert "Sauvegarde hors du serveur déjà configurée ($RESTIC_REPOSITORY) : simple vérification"
else
  read -r -p "Nom du compartiment (bucket) Backblaze B2 : " BUCKET </dev/tty
  read -r -p "keyID de la clé d'application : " B2_ACCOUNT_ID </dev/tty
  read -r -s -p "applicationKey (invisible à l'écran) : " B2_ACCOUNT_KEY </dev/tty; echo
  [ -n "$BUCKET" ] && [ -n "$B2_ACCOUNT_ID" ] && [ -n "$B2_ACCOUNT_KEY" ] || erreur "Les trois informations sont nécessaires."
  RESTIC_REPOSITORY="b2:$BUCKET:sauvegardes"
  RESTIC_PASSWORD=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40)
  export RESTIC_REPOSITORY RESTIC_PASSWORD B2_ACCOUNT_ID B2_ACCOUNT_KEY
  docker pull -q "$RESTIC" >/dev/null
  restic "$RESTIC" init >/dev/null 2>/tmp/restic-init.err || { cat /tmp/restic-init.err >&2; rm -f /tmp/restic-init.err; erreur "Impossible de préparer le stockage : vérifier le nom du compartiment et la clé (accès « Read and Write » à ce compartiment)."; }
  rm -f /tmp/restic-init.err
  ajouter RESTIC_REPOSITORY "$RESTIC_REPOSITORY"; ajouter RESTIC_PASSWORD "$RESTIC_PASSWORD"
  ajouter B2_ACCOUNT_ID "$B2_ACCOUNT_ID"; ajouter B2_ACCOUNT_KEY "$B2_ACCOUNT_KEY"
  chmod 600 .env
  vert "Stockage chiffré prêt sur Backblaze B2"
fi
export RESTIC_REPOSITORY RESTIC_PASSWORD B2_ACCOUNT_ID B2_ACCOUNT_KEY

# Première copie (sauvegarde locale + envoi chiffré)
/usr/local/lib/sauvegarder.sh hors-serveur >/dev/null
vert "Copie chiffrée envoyée"

# Test de restauration : on relit la dernière copie dans un dossier temporaire
TEST=$(mktemp -d)
restic -v "$TEST":/restauration "$RESTIC" restore latest --target /restauration >/dev/null
N=$(find "$TEST" -name 'site-*.sql.gz' | wc -l)
rm -rf "$TEST"
[ "$N" -gt 0 ] || erreur "La copie envoyée n'a pas pu être relue."
vert "Test de restauration réussi ($N sauvegarde(s) de la base relue(s))"
echo
restic "$RESTIC" snapshots --compact 2>/dev/null | tail -n 4
cat <<EOF

  IMPORTANT — clé de chiffrement des copies (à garder HORS du serveur, par ex. dans votre gestionnaire de mots de passe) :

      $RESTIC_PASSWORD

  Sans elle, les copies sur Backblaze sont illisibles, même pour vous. Elle est aussi dans /opt/indemnite/.env,
  mais si le serveur est perdu, ce fichier l'est aussi.
EOF
