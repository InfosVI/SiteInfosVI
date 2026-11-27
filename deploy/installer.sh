#!/usr/bin/env bash
# Installation du site sur un serveur neuf (Ubuntu 26.04 LTS ou 24.04 LTS), en une seule commande, en tant que root :
#   curl -fsSL https://raw.githubusercontent.com/<compte>/<dépôt>/main/deploy/installer.sh -o installer.sh && sudo bash installer.sh
# Le script peut être relancé sans risque : il ne refait que ce qui manque et ne touche jamais aux données existantes.
set -euo pipefail

DOSSIER=/opt/indemnite
DEPOT_DEFAUT=""
vert(){ printf '\033[32m✓ %s\033[0m\n' "$*"; }
etape(){ printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
erreur(){ printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
demander(){ local q="$1" def="${2:-}" r; read -r -p "$q${def:+ [$def]} : " r </dev/tty; echo "${r:-$def}"; }
demander_secret(){ local q="$1" r; read -r -s -p "$q : " r </dev/tty; echo >&2; echo "$r"; }
alea(){ openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "${1:-40}"; }

[ "$(id -u)" -eq 0 ] || erreur "À lancer en tant que root (sudo bash installer.sh)."
. /etc/os-release; [ "${ID:-}" = ubuntu ] || erreur "Prévu pour Ubuntu (système détecté : ${PRETTY_NAME:-inconnu})."

# ---------------------------------------------------------------- 1. Réglages
etape "1. Réglages"
if [ -f "$DOSSIER/.env" ]; then
  vert "Configuration existante trouvée ($DOSSIER/.env) : elle est conservée."
  set -a; . "$DOSSIER/.env"; set +a
else
  DOMAINE=""; while [ -z "$DOMAINE" ]; do DOMAINE=$(demander "Nom de domaine du site (sans www)" ""); done
  GITHUB_PROPRIETAIRE=""; while [ -z "$GITHUB_PROPRIETAIRE" ]; do GITHUB_PROPRIETAIRE=$(demander "Compte ou organisation GitHub qui publie les images (en minuscules)" ""); done
  DEPOT=""; while [ -z "$DEPOT" ]; do DEPOT=$(demander "Adresse du dépôt GitHub (https://github.com/<compte>/<dépôt>.git)" ""); done
  ADMIN_EMAIL=$(demander "Email de connexion à l'espace admin" "admin@$DOMAINE")
  while :; do ADMIN_MDP=$(demander_secret "Mot de passe de l'espace admin (12 caractères minimum)"); [ ${#ADMIN_MDP} -ge 12 ] && break; echo "Trop court."; done
  APERCU_UTILISATEUR=$(demander "Identifiant de l'aperçu privé (apercu.$DOMAINE)" "apercu")
  while :; do APERCU_MDP=$(demander_secret "Mot de passe de l'aperçu privé (12 caractères minimum)"); [ ${#APERCU_MDP} -ge 12 ] && break; echo "Trop court."; done
  PISTE_CLIENT_ID=$(demander "API Légifrance : Client ID (laisser vide pour plus tard)" "")
  PISTE_CLIENT_SECRET=""; [ -n "$PISTE_CLIENT_ID" ] && PISTE_CLIENT_SECRET=$(demander_secret "API Légifrance : Client Secret")
fi

# ---------------------------------------------------------------- 2. Sécurité du serveur
etape "2. Sécurité du serveur"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -yq upgrade
apt-get install -yq ca-certificates curl git openssl ufw fail2ban unattended-upgrades postgresql-client >/dev/null
vert "Paquets à jour"

# Mises à jour de sécurité automatiques (redémarrage si nécessaire à 04 h 47 UTC, après la mise en ligne)
cat > /etc/apt/apt.conf.d/52indemnite <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:47";
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
vert "Mises à jour de sécurité automatiques"

# Connexion par clé SSH uniquement — seulement si une clé est déjà installée (sinon on ne bloque pas l'accès)
CLES=$(cat /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys 2>/dev/null | grep -c '^ssh-' || true)
if [ "${CLES:-0}" -gt 0 ]; then
  cat > /etc/ssh/sshd_config.d/50-indemnite.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  vert "Connexion SSH par clé uniquement ($CLES clé(s) trouvée(s))"
else
  printf '\033[33m! Aucune clé SSH installée : la connexion par mot de passe reste active. Ajoutez une clé puis relancez ce script.\033[0m\n'
fi

ufw default deny incoming >/dev/null; ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
vert "Pare-feu : seuls SSH, 80 et 443 sont ouverts"
systemctl enable --now fail2ban >/dev/null 2>&1 || true
vert "Blocage des tentatives répétées (fail2ban)"

# ---------------------------------------------------------------- 3. Docker
etape "3. Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -q && apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
fi
systemctl enable --now docker >/dev/null
vert "Docker $(docker --version | cut -d' ' -f3 | tr -d ,)"

# ---------------------------------------------------------------- 4. Fichiers du site
etape "4. Fichiers du site"
if [ -d "$DOSSIER/.git" ]; then git -C "$DOSSIER" fetch -q --tags origin && vert "Dépôt déjà présent : $DOSSIER"
else git clone -q --depth 50 "${DEPOT:-$DEPOT_DEFAUT}" "$DOSSIER" && vert "Dépôt récupéré dans $DOSSIER"; fi
cd "$DOSSIER"
# Dernière version publiée (étiquette vX.Y.Z), sinon la branche principale
TAG=$(git tag -l 'v*' --sort=-v:refname | head -1); [ -n "$TAG" ] && git -c advice.detachedHead=false checkout -q "$TAG" && vert "Version $TAG" || vert "Pas encore de version publiée : branche principale"

# ---------------------------------------------------------------- 5. Configuration (.env)
etape "5. Configuration"
if [ ! -f .env ]; then
  docker pull -q "caddy:2.10-alpine" >/dev/null
  APERCU_HASH=$(docker run --rm caddy:2.10-alpine caddy hash-password --plaintext "$APERCU_MDP")
  docker pull -q "ghcr.io/$GITHUB_PROPRIETAIRE/indemnite-outils:${TAG:-latest}" >/dev/null || erreur "Image introuvable sur le registre GitHub : vérifier que GitHub a bien publié la première version."
  ADMIN_HASH=$(docker run --rm -e MDP="$ADMIN_MDP" "ghcr.io/$GITHUB_PROPRIETAIRE/indemnite-outils:${TAG:-latest}" \
    node -e "require('@node-rs/argon2').hash(process.env.MDP).then(h=>process.stdout.write(h))")
  umask 077
  cat > .env <<EOF
# Configuration du serveur — créée par l'installation le $(date -u +%F). Jamais dans Git.
DOMAINE='$DOMAINE'
GITHUB_PROPRIETAIRE='$GITHUB_PROPRIETAIRE'
DEPOT='${DEPOT:-$DEPOT_DEFAUT}'
IMAGE_TAG='${TAG:-latest}'
APERCU_TAG='preparation'
ADMIN_EMAIL='$ADMIN_EMAIL'
ADMIN_PASSWORD_HASH='$ADMIN_HASH'
SESSION_SECRET='$(alea 48)'
SESSION_SECRET_APERCU='$(alea 48)'
APERCU_UTILISATEUR='$APERCU_UTILISATEUR'
APERCU_MOT_DE_PASSE_HASH='$APERCU_HASH'
MDP_BASE_ADMIN='$(alea 32)'
MDP_BASE_SITE='$(alea 32)'
MDP_BASE_APERCU='$(alea 32)'
PISTE_CLIENT_ID='$PISTE_CLIENT_ID'
PISTE_CLIENT_SECRET='$PISTE_CLIENT_SECRET'
EOF
  chmod 600 .env
  unset ADMIN_MDP APERCU_MDP
  vert "Configuration créée ($DOSSIER/.env, lisible par root seulement) ; secrets générés automatiquement"
fi
set -a; . ./.env; set +a

# Réglages propres à cette installation (nom du site, hébergeur, dons) : hors du dépôt, à adapter ensuite
if [ ! -f config-site/site.json ]; then install -d -m 0755 config-site && cp site.exemple.json config-site/site.json
  printf '\033[33m! Réglages du site à compléter : %s\033[0m\n' "$DOSSIER/config-site/site.json"; fi

# ---------------------------------------------------------------- 6. Démarrage
etape "6. Démarrage"
docker compose pull -q
docker compose up -d base
until docker compose exec -T base pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done
vert "Base de données prête"
docker compose run --rm outils npx tsx scripts/migrer.ts
docker compose run --rm outils npx tsx scripts/seed.ts
docker compose run --rm -e DATABASE_URL="postgres://apercu:$MDP_BASE_APERCU@base:5432/apercu" outils npx tsx scripts/seed.ts
vert "Données publiques chargées (site et aperçu)"
docker compose up -d caddy site apercu
vert "Site démarré"

# ---------------------------------------------------------------- 7. Tâches programmées et commandes utiles
etape "7. Tâches programmées"
bash deploy/installer-taches.sh
vert "Mise en ligne 04 h 17 UTC · aperçu toutes les 5 min · collecte 16 h 37 UTC · sauvegarde 03 h 47 UTC"

# ---------------------------------------------------------------- 7 bis. Statistiques de visite (Umami)
etape "7 bis. Statistiques de visite"
bash deploy/installer-stats.sh

# ---------------------------------------------------------------- 8. Résumé
etape "Terminé"
IP=$(curl -fsS4 https://ifconfig.co 2>/dev/null || hostname -I | cut -d' ' -f1)
cat <<EOF
  Site            : https://$DOMAINE
  Aperçu privé    : https://apercu.$DOMAINE  (identifiant : $APERCU_UTILISATEUR)
  Espace admin    : https://$DOMAINE/#admin  (email : $ADMIN_EMAIL)
  Statistiques    : https://stats.$DOMAINE  (votre compte Umami)
  Adresse du serveur : $IP

  À vérifier :
  - le nom de domaine, apercu.$DOMAINE et stats.$DOMAINE pointent vers $IP (sinon le https ne peut pas démarrer) ;
  - « site-etat » affiche l'état des conteneurs et des tâches.
EOF
