#!/usr/bin/env bash
# Mesure d'audience (Umami 3) sur le serveur. Lancée par installer.sh ; peut aussi être lancée seule :
#   cd /opt/indemnite && sudo bash deploy/installer-stats.sh
# - crée la base « stats » et son compte, génère les secrets ;
# - démarre Umami ;
# - remplace le compte « admin / umami » créé par défaut par VOTRE compte (identifiant et mot de passe choisis par vous) ;
# - range le site du site dans une équipe « Site » dont votre compte est propriétaire ;
# - crée un compte technique en LECTURE SEULE, membre de l'équipe, pour que l'espace admin du site lise les chiffres ;
# - redémarre le site pour activer le comptage des visites.
# Relançable : ce qui est déjà fait n'est pas refait (et une ancienne installation est mise en ordre).
set -euo pipefail
cd /opt/indemnite
vert(){ printf '\033[32m✓ %s\033[0m\n' "$*"; }
erreur(){ printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || erreur "À lancer avec sudo."
alea(){ openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "${1:-40}"; }
ajouter(){ if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1='$2'|" .env; else echo "$1='$2'" >> .env; fi; }
set -a; . ./.env; set +a

# 1. Secrets et base de données
[ -n "${MDP_BASE_STATS:-}" ] || { MDP_BASE_STATS=$(alea 32); ajouter MDP_BASE_STATS "$MDP_BASE_STATS"; }
[ -n "${UMAMI_APP_SECRET:-}" ] || { UMAMI_APP_SECRET=$(openssl rand -hex 32); ajouter UMAMI_APP_SECRET "$UMAMI_APP_SECRET"; }
[ -n "${UMAMI_SITE_UTILISATEUR:-}" ] || { UMAMI_SITE_UTILISATEUR="site-lecture"; ajouter UMAMI_SITE_UTILISATEUR "$UMAMI_SITE_UTILISATEUR"; }
[ -n "${UMAMI_SITE_MDP:-}" ] || { UMAMI_SITE_MDP=$(alea 40); ajouter UMAMI_SITE_MDP "$UMAMI_SITE_MDP"; }
chmod 600 .env
docker compose up -d base >/dev/null
until docker compose exec -T base pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done
docker compose exec -T base psql -U postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='stats') THEN CREATE ROLE stats LOGIN; END IF;
END \$\$;
ALTER ROLE stats PASSWORD '${MDP_BASE_STATS}';
SQL
docker compose exec -T base psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='stats'" | grep -q 1 \
  || docker compose exec -T base psql -U postgres -c "CREATE DATABASE stats OWNER stats" >/dev/null
docker compose exec -T base psql -U postgres -c "REVOKE ALL ON DATABASE stats FROM PUBLIC" >/dev/null
vert "Base « stats » prête"

# 2. Démarrage d'Umami
docker compose --profile stats up -d umami >/dev/null
API=http://127.0.0.1:3001
printf 'Démarrage d’Umami'; for _ in $(seq 1 60); do curl -fsS "$API/api/heartbeat" >/dev/null 2>&1 && break; printf '.'; sleep 3; done; echo
curl -fsS "$API/api/heartbeat" >/dev/null || erreur "Umami ne répond pas : voir « sudo docker compose logs umami »."
vert "Umami démarré"

# Petits outils : JSON sans dépendance (python3 est fourni par Ubuntu)
champ(){ python3 -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1], {}, {'d': d}))" "$1"; }
corps(){ python3 -c 'import json,sys; a=sys.argv[1:]; print(json.dumps({a[i]:a[i+1] for i in range(0,len(a),2)}))' "$@"; }
login(){ curl -fsS -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d "$(corps username "$1" password "$2")"; }
api(){ local m=$1 chemin=$2 jeton=$3; shift 3
  curl -fsS -X "$m" "$API$chemin" -H "Authorization: Bearer $jeton" -H 'Content-Type: application/json' ${1:+-d "$1"}; }

# 3. Connexion administrateur : compte par défaut (première fois) ou votre compte (mise en ordre)
NOUVEL_ADMIN=""
if R=$(login admin umami 2>/dev/null); then
  ADMIN_TOKEN=$(echo "$R" | champ "d['token']"); ADMIN_ID=$(echo "$R" | champ "d['user']['id']")
  read -r -p "Choisissez votre identifiant Umami (ex. votre prénom) : " U_NOM </dev/tty
  while :; do read -r -s -p "Choisissez votre mot de passe Umami (12 caractères minimum) : " U_MDP </dev/tty; echo
    [ ${#U_MDP} -ge 12 ] || { echo "Trop court."; continue; }
    read -r -s -p "Retapez-le : " U_MDP2 </dev/tty; echo; [ "$U_MDP" = "$U_MDP2" ] && break || echo "Les deux saisies sont différentes."; done
  NOUVEL_ADMIN=oui
elif [ -z "${UMAMI_EQUIPE_ID:-}" ]; then
  echo "Mise en ordre de l'installation existante : connexion avec VOTRE compte Umami."
  read -r -p "Votre identifiant Umami : " U_NOM </dev/tty
  read -r -s -p "Votre mot de passe Umami : " U_MDP </dev/tty; echo
  R=$(login "$U_NOM" "$U_MDP") || erreur "Identifiant ou mot de passe Umami incorrect."
  unset U_MDP
  ADMIN_TOKEN=$(echo "$R" | champ "d['token']")
else
  ADMIN_TOKEN=""
fi

if [ -n "$ADMIN_TOKEN" ]; then
  # 4. Compte technique en lecture seule
  if ! R=$(login "$UMAMI_SITE_UTILISATEUR" "$UMAMI_SITE_MDP" 2>/dev/null); then
    api POST /api/users "$ADMIN_TOKEN" "$(corps username "$UMAMI_SITE_UTILISATEUR" password "$UMAMI_SITE_MDP" role view-only)" >/dev/null
    R=$(login "$UMAMI_SITE_UTILISATEUR" "$UMAMI_SITE_MDP") || erreur "Compte technique : connexion impossible."
  fi
  TECH_ID=$(echo "$R" | champ "d['user']['id']")
  api POST "/api/users/$TECH_ID" "$ADMIN_TOKEN" "$(corps role view-only)" >/dev/null
  vert "Compte technique « $UMAMI_SITE_UTILISATEUR » (lecture seule)"

  # 5. Équipe « Site » (propriétaire : votre compte) et site rangé dedans
  if [ -z "${UMAMI_EQUIPE_ID:-}" ]; then
    # Équipe déjà créée lors d'un essai précédent ? (la liste peut être paginée : {data: [...]})
    UMAMI_EQUIPE_ID=$(api GET "/api/teams?pageSize=100" "$ADMIN_TOKEN" \
      | champ "next((t['id'] for t in (d.get('data', []) if isinstance(d, dict) else d) if t.get('name') == 'Site'), '')")
    if [ -z "$UMAMI_EQUIPE_ID" ]; then
      # La création renvoie [équipe, appartenance du propriétaire]
      UMAMI_EQUIPE_ID=$(api POST /api/teams "$ADMIN_TOKEN" "$(corps name Site)" \
        | champ "(d[0] if isinstance(d, list) else d)['id']")
    fi
    [ -n "$UMAMI_EQUIPE_ID" ] || erreur "Équipe « Site » : création impossible."
    ajouter UMAMI_EQUIPE_ID "$UMAMI_EQUIPE_ID"
  fi
  api POST "/api/teams/$UMAMI_EQUIPE_ID/users" "$ADMIN_TOKEN" "$(corps userId "$TECH_ID" role team-view-only)" >/dev/null 2>&1 || true
  if [ -z "${UMAMI_WEBSITE_ID:-}" ]; then
    UMAMI_WEBSITE_ID=$(api POST /api/websites "$ADMIN_TOKEN" "$(corps name "$DOMAINE" domain "$DOMAINE" teamId "$UMAMI_EQUIPE_ID")" | champ "d['id']")
    ajouter UMAMI_WEBSITE_ID "$UMAMI_WEBSITE_ID"
  else
    api POST "/api/websites/$UMAMI_WEBSITE_ID/transfer" "$ADMIN_TOKEN" "$(corps teamId "$UMAMI_EQUIPE_ID")" >/dev/null
  fi
  vert "Site « $DOMAINE » rangé dans l'équipe « Site » (visible depuis votre compte)"

  # 6. Votre compte remplace « admin / umami » (en dernier : le compte par défaut a servi jusqu'ici)
  if [ -n "$NOUVEL_ADMIN" ]; then
    api POST "/api/users/$ADMIN_ID" "$ADMIN_TOKEN" "$(corps username "$U_NOM" password "$U_MDP" role admin)" >/dev/null
    unset U_MDP U_MDP2
    login admin umami >/dev/null 2>&1 && erreur "Le compte « admin / umami » fonctionne encore : changement non pris en compte."
    vert "Votre compte Umami « $U_NOM » remplace « admin / umami »"
  fi
else
  vert "Comptes, équipe et site déjà en place"
fi

# 7. Vérification : le compte technique lit bien les chiffres du site
R=$(login "$UMAMI_SITE_UTILISATEUR" "$UMAMI_SITE_MDP") || erreur "Compte technique : connexion impossible."
T=$(echo "$R" | champ "d['token']")
api GET "/api/websites/$UMAMI_WEBSITE_ID" "$T" >/dev/null || erreur "Le compte technique ne voit pas le site dans Umami."
vert "L'espace admin du site peut lire les statistiques"

# 8. Activation du comptage sur le site
set -a; . ./.env; set +a
docker compose up -d caddy site apercu >/dev/null
vert "Comptage des visites activé"
cat <<EOF

  Statistiques complètes : https://stats.$DOMAINE  (votre identifiant Umami ; choisir l'équipe « Site » en haut à gauche)
  Résumé dans l'espace admin : https://$DOMAINE/#admin-stats
  L'enregistrement DNS « stats » doit pointer vers ce serveur pour que https://stats.$DOMAINE fonctionne.
EOF
