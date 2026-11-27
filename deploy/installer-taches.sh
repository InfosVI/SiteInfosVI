#!/usr/bin/env bash
# Installe (ou réinstalle) les scripts, tâches programmées, commandes et la rotation des journaux du serveur.
# Lancé par l'installation, puis après chaque mise en ligne réussie (les améliorations des scripts suivent ainsi les versions).
set -euo pipefail
cd /opt/indemnite
install -m 0755 deploy/mettre-a-jour.sh deploy/apercu.sh deploy/collecte.sh deploy/sauvegarder.sh /usr/local/lib/
for f in deploy/systemd/*.service deploy/systemd/*.timer; do install -m 0644 "$f" /etc/systemd/system/; done
install -d -m 0750 /var/log/indemnite-visites
for c in site-version site-debloquer site-etat site-mdp-admin site-visites site-sauvegarde; do install -m 0755 "deploy/commandes/$c" "/usr/local/bin/$c"; done
install -m 0644 deploy/logrotate-indemnite /etc/logrotate.d/indemnite
systemctl daemon-reload
for t in indemnite-maj indemnite-apercu indemnite-collecte indemnite-sauvegarde; do systemctl enable --now "$t.timer" >/dev/null; done
