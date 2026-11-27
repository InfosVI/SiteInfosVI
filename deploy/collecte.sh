#!/usr/bin/env bash
# Collecte quotidienne (16 h 37 UTC) : BCE, Statistique Canada, Journal officiel, Légifrance.
# Le résultat de chaque requête est visible dans l'espace admin (journal des requêtes).
set -euo pipefail
cd /opt/indemnite
set -a; . ./.env; set +a
echo "== $(date -u +%FT%TZ) site" >> /var/log/indemnite-collecte.log
docker compose run --rm collecte >> /var/log/indemnite-collecte.log 2>&1
# L'aperçu a sa propre base : on y lance la même collecte, pour qu'il montre lui aussi des valeurs à jour
echo "== $(date -u +%FT%TZ) aperçu" >> /var/log/indemnite-collecte.log
docker compose run --rm -e DATABASE_URL="postgres://apercu:${MDP_BASE_APERCU}@base:5432/apercu" collecte >> /var/log/indemnite-collecte.log 2>&1 || true
