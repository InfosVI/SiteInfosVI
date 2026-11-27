#!/usr/bin/env bash
# Sauvegarde de la base (chaque nuit à 03 h 47 UTC, et avant chaque mise en ligne).
# Copie de la base du site (et des statistiques), compressée, sur le serveur (dossier réservé à root, 7 copies gardées) ;
# la dernière est aussi déposée dans ~/sauvegardes de l'administrateur, pour la télécharger sur son ordinateur.
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

# Dernière sauvegarde mise à disposition de l'administrateur, pour la télécharger depuis son ordinateur (commande
# site-sauvegarde, puis copie SSH lancée par l'ordinateur : le serveur ne joint jamais l'ordinateur). Contient aussi .env.
U="${SAUVEGARDE_UTILISATEUR:-ubuntu}"
if id "$U" >/dev/null 2>&1; then
  D="$(getent passwd "$U" | cut -d: -f6)/sauvegardes"; install -d -m 700 -o "$U" -g "$U" "$D"
  cp "$DOSSIER/$NOM" "$D/site.sql.gz"
  [ -f "$DOSSIER/stats-${NOM#site-}" ] && cp "$DOSSIER/stats-${NOM#site-}" "$D/stats.sql.gz"
  cp .env "$D/env"; [ -d config-site ] && cp config-site/site.json "$D/site.json" 2>/dev/null || true
  date -u +%FT%TZ > "$D/date.txt"
  chown "$U:$U" "$D"/*; chmod 600 "$D"/*
fi
