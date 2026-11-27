#!/usr/bin/env bash
# Aperçu privé (toutes les 5 minutes) : si GitHub a publié une nouvelle image « preparation » (branche dev),
# la télécharge, applique les migrations sur la base de l'aperçu et redémarre l'aperçu. Le vrai site n'est pas touché.
set -euo pipefail
cd /opt/indemnite
set -a; . ./.env; set +a
IMG="ghcr.io/$GITHUB_PROPRIETAIRE/indemnite-site:${APERCU_TAG:-preparation}"
AVANT=$(docker image inspect -f '{{.Id}}' "$IMG" 2>/dev/null || true)
docker pull -q "$IMG" >/dev/null 2>&1 || exit 0
APRES=$(docker image inspect -f '{{.Id}}' "$IMG")
[ "$AVANT" = "$APRES" ] && exit 0
docker pull -q "ghcr.io/$GITHUB_PROPRIETAIRE/indemnite-outils:${APERCU_TAG:-preparation}" >/dev/null 2>&1 || true
docker run --rm --network indemnite_donnees -e DATABASE_URL="postgres://apercu:$MDP_BASE_APERCU@base:5432/apercu" \
  "ghcr.io/$GITHUB_PROPRIETAIRE/indemnite-outils:${APERCU_TAG:-preparation}" npx tsx scripts/migrer.ts
docker compose up -d apercu
docker image prune -f >/dev/null 2>&1 || true   # images remplacées (place disque)
# Version installée : numéro prévu (package.json de l'image) + repère du code (GIT_SHA)
V=$(docker run --rm --entrypoint node "$IMG" -p "require('/app/package.json').version" 2>/dev/null || echo "?")
SHA=$(docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$IMG" | sed -n 's/^GIT_SHA=//p' | cut -c1-7)
echo "$(date -u +%FT%TZ) Aperçu mis à jour : v$V en préparation${SHA:+ · $SHA}" >> /var/log/indemnite-apercu.log
