# Installer le site sur un serveur

Serveur prévu : VPS Ubuntu 26.04 LTS (ou 24.04 LTS), 2 cœurs, 4 Go de mémoire. Tout tourne en conteneurs Docker.

## Avant de commencer

1. **Les images du site sont publiées sur GitHub** (registre `ghcr.io`) par les tests automatiques du dépôt
   (première version étiquetée `vX.Y.Z`). Sans elles, l'installation s'arrête avec un message clair.
2. **Le nom de domaine pointe vers le serveur.** Chez le registraire du nom de domaine, zone DNS :

   | Type | Nom | Valeur |
   |---|---|---|
   | A | *(vide, ou @)* | adresse IP du serveur |
   | A | `www` | adresse IP du serveur |
   | A | `apercu` | adresse IP du serveur |

   Le https (certificats Let's Encrypt) ne démarre qu'une fois ces enregistrements actifs (quelques minutes à quelques heures).
3. **Les réglages à avoir sous la main** : email et mot de passe de l'espace admin, identifiant et mot de passe de
   l'aperçu privé, et facultativement les identifiants de l'API Légifrance (voir [configuration-piste.md](configuration-piste.md)).

## Installer (une seule commande)

Depuis l'ordinateur de l'administrateur (PowerShell), se connecter au serveur avec la clé SSH :

```
ssh -i $HOME\.ssh\id_ed25519_monindemnite ubuntu@ADRESSE_IP_DU_SERVEUR
```

Puis, sur le serveur :

```
curl -fsSL https://raw.githubusercontent.com/<compte>/<dépôt>/main/deploy/installer.sh -o installer.sh && sudo bash installer.sh
```

Le script :
1. demande les réglages (les mots de passe ne s'affichent pas à l'écran) ;
2. sécurise le serveur : mises à jour de sécurité automatiques, connexion SSH par clé uniquement (seulement si une clé
   est déjà installée), pare-feu (SSH, 80, 443), blocage des tentatives répétées ;
3. installe Docker ;
4. récupère la dernière version du site ;
5. crée le fichier `/opt/indemnite/.env` (lisible par root seulement) avec des secrets générés automatiquement ; le
   mot de passe admin n'y est jamais écrit en clair (empreinte Argon2) ;
6. démarre la base, applique les migrations, charge les données publiques (site et aperçu), démarre le site ;
7. programme les tâches : mise en ligne 04 h 17 UTC, aperçu toutes les 5 min, collecte 16 h 37 UTC, sauvegarde 03 h 47 UTC ;
8. affiche un résumé (adresses du site, de l'aperçu, de l'espace admin).

Il peut être relancé sans risque : la configuration et les données existantes sont conservées.

## Réglages du site (nom, hébergeur, dons)

Le nom du site, l'hébergeur affiché dans les mentions légales, le lien de dons et les coûts d'hébergement sont propres à
chaque installation : ils ne sont pas dans le dépôt. Sur le serveur, copier le modèle puis l'adapter :

```
cd /opt/indemnite && sudo mkdir -p config-site && sudo cp site.exemple.json config-site/site.json && sudo nano config-site/site.json
```

Pris en compte en une minute environ, sans redémarrage. Sans ce fichier, le site affiche des valeurs neutres.

## Commandes utiles sur le serveur

| Commande | Effet |
|---|---|
| `site-etat` (demande les droits d’dministrateur tout seul) | conteneurs, tâches programmées, dernières sauvegardes, espace disque |
| `site-version` | version en ligne et versions disponibles |
| `sudo site-version v1.4.1` | remettre une version précise |
| `site-mdp-admin` | choisir un nouveau mot de passe pour l'espace admin (oubli) |
| `site-visites` (ou `site-visites 100 7` : 100 pages, 7 jours) | dernières pages vues et réseaux les plus actifs, adresses IP **tronquées** (journal gardé 30 jours) |
| `sudo site-debloquer` | lever les blocages de 48 h (si l'administrateur s'est bloqué) |
| `sudo /usr/local/lib/sauvegarder.sh` | sauvegarde immédiate |

Journaux : `/var/log/indemnite-*.log`.

## Statistiques de visite (Umami)

Installées par le script d'installation (étape « 7 bis ») :
- il crée la base `stats` et démarre Umami ;
- il vous demande de **choisir** votre identifiant et votre mot de passe Umami, qui remplacent le compte par défaut
  « admin / umami » ;
- il range le site dans une équipe « Site » dont votre compte est propriétaire ;
- il crée un compte technique **en lecture seule** qui permet à l'espace admin de lire les chiffres ;
- il active le comptage.

Pour que `https://stats.<domaine>` fonctionne, ajouter l'enregistrement DNS `stats` (A vers l'IPv4 du serveur, AAAA vers
son IPv6). Sur un serveur déjà installé, ou pour remettre en ordre : `cd /opt/indemnite && sudo bash deploy/installer-stats.sh`
(relançable sans risque).

Dans Umami, choisir l'équipe **Site** dans le menu en haut à gauche pour voir le site. Résumé dans l'espace admin
(module **Statistiques**). L'aperçu privé n'est jamais compté. Les visiteurs qui ont refusé la mesure d'audience dans
la page Confidentialité ne sont pas comptés. La base des statistiques est sauvegardée chaque nuit avec celle du site ;
Umami redémarre avec chaque mise à jour.

## Sauvegardes hors du serveur (à activer ensuite)

Copie chiffrée chaque nuit vers Backblaze B2 (quasi gratuit) : 30 copies quotidiennes, puis une par mois pendant 6 mois.

1. Sur backblaze.com : créer un compte, un compartiment (bucket) **privé**, puis une clé d'application limitée à ce
   compartiment, avec l'accès « Read and Write ».
2. Sur le serveur : `cd /opt/indemnite && sudo bash deploy/installer-sauvegarde.sh` — le script demande le nom du
   compartiment et la clé, envoie une première copie et vérifie qu'on sait la relire.
3. **Garder la clé de chiffrement affichée à la fin hors du serveur** (gestionnaire de mots de passe) : sans elle, les
   copies sont illisibles.
