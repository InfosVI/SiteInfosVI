#!/usr/bin/env bash
# Mise en ligne automatique (chaque jour à 04 h 17 UTC) : si GitHub a publié une nouvelle version (étiquette vX.Y.Z),
# sauvegarde la base, télécharge la nouvelle version, applique les migrations, redémarre le site,
# et revient automatiquement à l'ancienne version si le site ne répond pas correctement.
# Usage manuel : mettre-a-jour.sh [vX.Y.Z]   (sans argument : dernière version publiée)
set -euo pipefail
cd /opt/indemnite
set -a; . ./.env; set +a
journal(){ echo "$(date -u +%FT%TZ) $*" | tee -a /var/log/indemnite-maj.log; }

git fetch -q --tags origin
CIBLE="${1:-$(git tag -l 'v*' --sort=-v:refname | head -1)}"
[ -n "$CIBLE" ] || { journal "Aucune version publiée : rien à faire"; exit 0; }
ACTUELLE="$IMAGE_TAG"
[ "$CIBLE" = "$ACTUELLE" ] && { journal "Déjà à jour ($ACTUELLE)"; exit 0; }
journal "Nouvelle version $CIBLE (en ligne : $ACTUELLE)"

/usr/local/lib/sauvegarder.sh avant-maj-"$CIBLE" || { journal "Sauvegarde impossible : mise en ligne annulée"; exit 1; }

# Fichiers de configuration de la même version (docker-compose.yml, Caddyfile, deploy/)
git -c advice.detachedHead=false checkout -q "$CIBLE"
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG='$CIBLE'/" .env
export IMAGE_TAG="$CIBLE"

if ! docker compose pull -q site outils collecte; then
  journal "Téléchargement impossible : retour à $ACTUELLE"
  git -c advice.detachedHead=false checkout -q "$ACTUELLE"; sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG='$ACTUELLE'/" .env; exit 1
fi
# Correctifs de sécurité des autres services (même version majeure : caddy 2.10, postgres 17, umami figé)
docker compose pull -q caddy base >/dev/null 2>&1 || journal "Attention : correctifs de Caddy/PostgreSQL non téléchargés"
[ -n "${UMAMI_WEBSITE_ID:-}" ] && { docker compose --profile stats pull -q umami >/dev/null 2>&1 || true; }
docker compose up -d base >/dev/null
until docker compose exec -T base pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done
docker compose run --rm outils npx tsx scripts/migrer.ts
docker compose up -d caddy site apercu   # l'aperçu reçoit aussi la nouvelle configuration (variables du .env)
[ -n "${UMAMI_WEBSITE_ID:-}" ] && docker compose --profile stats up -d umami >/dev/null || true   # mesure d'audience, si installée

# Vérification : le site doit répondre correctement dans les 90 secondes
for i in $(seq 1 30); do
  if docker compose exec -T site node -e "fetch('http://127.0.0.1:3000/api/data').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    journal "Version $CIBLE en ligne"
    bash deploy/installer-taches.sh >/dev/null 2>&1 || journal "Attention : scripts du serveur non réinstallés"
    docker image prune -af --filter "until=72h" >/dev/null 2>&1 || true   # anciennes versions inutilisées (place disque)
    exit 0
  fi
  sleep 3
done

journal "La version $CIBLE ne répond pas : retour automatique à $ACTUELLE"
git -c advice.detachedHead=false checkout -q "$ACTUELLE"
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG='$ACTUELLE'/" .env
export IMAGE_TAG="$ACTUELLE"
docker compose up -d caddy site
exit 1
