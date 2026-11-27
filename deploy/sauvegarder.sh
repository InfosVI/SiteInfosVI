#!/usr/bin/env bash
# Sauvegarde de la base (chaque nuit à 03 h 47 UTC, et avant chaque mise en ligne).
# 1. Copie de la base du site, compressée, sur le serveur (dossier réservé à root).
# 2. Si un stockage distant est configuré (RESTIC_REPOSITORY dans .env), copie chiffrée hors du serveur
#    avec conservation dégressive : 30 jours, puis une par mois pendant 6 mois.
# Usage : sauvegarder.sh [étiquette]
set -euo pipefail
cd /opt/indemnite
set -a; . ./.env; set +a
DOSSIER=/var/backups/indemnite; install -d -m 700 "$DOSSIER"
NOM="site-$(date -u +%Y%m%d-%H%M%S)${1:+-$1}.sql.gz"
docker compose exec -T base pg_dump -U postgres --clean --if-exists site | gzip -9 > "$DOSSIER/$NOM"
[ -s "$DOSSIER/$NOM" ] || { echo "Sauvegarde vide : échec" >&2; exit 1; }
# Statistiques de visite (Umami), si installées
if [ -n "${UMAMI_WEBSITE_ID:-}" ]; then
  docker compose exec -T base pg_dump -U postgres --clean --if-exists stats | gzip -9 > "$DOSSIER/stats-${NOM#site-}" || true
  ls -1t "$DOSSIER"/stats-*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
  # Durée de conservation annoncée dans la page Confidentialité : 25 mois, puis effacement
  docker compose exec -T base psql -U postgres -d stats -q >/dev/null <<'SQL' || true
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['event_data','session_data','revenue','session_replay','website_event','session_link','session'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM %I WHERE created_at < now() - interval ''25 months''', t);
    END IF;
  END LOOP;
END $$;
SQL
fi
cp .env "$DOSSIER/env-$(date -u +%Y%m%d)"; chmod 600 "$DOSSIER"/*
# Sur le serveur : on garde les 7 dernières copies
ls -1t "$DOSSIER"/site-*.sql.gz | tail -n +8 | xargs -r rm -f
ls -1t "$DOSSIER"/env-* | tail -n +8 | xargs -r rm -f
echo "$(date -u +%FT%TZ) Sauvegarde locale $NOM ($(du -h "$DOSSIER/$NOM" | cut -f1))" >> /var/log/indemnite-sauvegarde.log

# Copie chiffrée hors du serveur (activée quand le stockage distant est configuré)
if [ -n "${RESTIC_REPOSITORY:-}" ] && [ -n "${RESTIC_PASSWORD:-}" ]; then
  docker run --rm -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e B2_ACCOUNT_ID -e B2_ACCOUNT_KEY \
    -v "$DOSSIER":/sauvegardes:ro restic/restic:0.18.0 backup /sauvegardes --tag indemnite --host serveur
  docker run --rm -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e B2_ACCOUNT_ID -e B2_ACCOUNT_KEY \
    restic/restic:0.18.0 forget --tag indemnite --keep-daily 30 --keep-monthly 6 --prune
  echo "$(date -u +%FT%TZ) Copie chiffrée envoyée hors du serveur" >> /var/log/indemnite-sauvegarde.log
fi
