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

# Dernière sauvegarde mise à disposition de l'administrateur, en UNE archive dont le nom dit tout :
#   sauvegarde_2026-11-28_15h04UTC_site-v1.9.4_apercu-v1.9.5-1a2b3c4.tar.gz
# (date et heure UTC, version du vrai site, version de l'aperçu). Contient : site.sql.gz, stats.sql.gz, env, site.json.
# Téléchargée depuis l'ordinateur par SSH (le serveur ne joint jamais l'ordinateur) ; seule la dernière est gardée ici.
U="${SAUVEGARDE_UTILISATEUR:-ubuntu}"
if id "$U" >/dev/null 2>&1; then
  D="$(getent passwd "$U" | cut -d: -f6)/sauvegardes"; install -d -m 700 -o "$U" -g "$U" "$D"
  IMG_AP="ghcr.io/$GITHUB_PROPRIETAIRE/indemnite-site:${APERCU_TAG:-preparation}"
  V_AP=$(docker run --rm --entrypoint node "$IMG_AP" -p "require('/app/package.json').version" 2>/dev/null || echo "inconnue")
  SHA=$(docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$IMG_AP" 2>/dev/null | sed -n 's/^GIT_SHA=//p' | cut -c1-7)
  T=$(mktemp -d)
  cp "$DOSSIER/$NOM" "$T/site.sql.gz"
  [ -f "$DOSSIER/stats-${NOM#site-}" ] && cp "$DOSSIER/stats-${NOM#site-}" "$T/stats.sql.gz"
  cp .env "$T/env"; [ -f config-site/site.json ] && cp config-site/site.json "$T/site.json"
  A="sauvegarde_$(date -u +%Y-%m-%d_%Hh%M)UTC_site-${IMAGE_TAG:-inconnue}_apercu-v${V_AP}${SHA:+-$SHA}.tar.gz"
  find "$D" -mindepth 1 -maxdepth 1 -delete
  tar -C "$T" -czf "$D/$A" . && rm -rf "$T"
  chown "$U:$U" "$D/$A"; chmod 600 "$D/$A"
fi
