# Configurer l'API Légifrance (PISTE)

La collecte quotidienne lit sur Légifrance les 3 textes qui fixent la **part fixe** de l'indemnité
(décret 2000-1159 art. 18, grille des indices, barème des traitements) et recalcule la part fixe.
Pour cela, elle utilise l'**API Légifrance**, publiée par la DILA sur la plateforme **PISTE**.

- Accès **gratuit**, mais **personnel** : chaque personne qui installe ou reprend le projet crée **son propre compte**.
- Les identifiants ne sont **jamais** dans le dépôt : uniquement dans le fichier `.env` (exclu de Git).
- Sans identifiants, le site fonctionne : la collecte signale l'échec dans le journal des requêtes de l'espace admin
  (« Identifiants de l'API Légifrance (PISTE) absents ») et la part fixe déjà stockée reste utilisée.

## 1. Créer le compte et l'application

1. Créer un compte sur **https://piste.gouv.fr** et valider l'adresse email.
2. Accepter les **conditions d'utilisation de l'API Légifrance** (rubrique des CGU des API, sur le portail).
3. Créer une **application** (environnement **production** pour un vrai site ; « sandbox » seulement pour des essais).
4. Dans cette application, **s'abonner à l'API « Légifrance »**.
5. Récupérer les identifiants **OAuth** de l'application :
   - **Client ID**
   - **Client Secret**

   La « clé API » (API key) affichée aussi par le portail **n'est pas utilisée** par ce projet.

Les intitulés exacts du portail peuvent évoluer ; en cas de doute, voir la documentation de PISTE.

## 2. Mettre les identifiants dans la configuration

Dans le fichier `.env` (sur le serveur, il est créé par le script d'installation qui demande ces deux valeurs) :

```
PISTE_CLIENT_ID=…
PISTE_CLIENT_SECRET=…
```

Ne jamais les écrire ailleurs (code, documentation, ticket, message). Le contrôle automatique avant chaque
enregistrement Git (`.githooks/pre-commit`) refuse une valeur de secret écrite en clair.

## 3. Vérifier

```
npm run verifier:piste
```

Résultat attendu : jeton obtenu, puis l'article 18 du décret 2000-1159 lu « en vigueur ». La commande n'affiche
jamais les identifiants ni le jeton.

## Fonctionnement (pour information)

| Étape | Adresse |
|---|---|
| Jeton d'accès (valable 1 h, jamais journalisé) | `POST https://oauth.piste.gouv.fr/api/oauth/token` — `grant_type=client_credentials`, `scope=openid` |
| Lecture d'un article | `POST https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/getArticle` — corps `{"id":"LEGIARTI…"}`, en-tête `Authorization: Bearer <jeton>` |

Code : `lib/collect/legifrance.ts`.

## En cas de problème

| Message dans le journal des requêtes | Que faire |
|---|---|
| Identifiants absents | Ajouter `PISTE_CLIENT_ID` et `PISTE_CLIENT_SECRET` dans `.env`, puis relancer le site |
| Jeton d'accès refusé (HTTP 400 / 401) | Vérifier les deux valeurs ; vérifier que l'application est bien abonnée à l'API Légifrance ; régénérer le secret si besoin |
| HTTP 403 sur la lecture d'un article | Abonnement à l'API Légifrance absent ou CGU non acceptées |
| Identifiants exposés par erreur | Les régénérer immédiatement sur le portail PISTE, puis mettre à jour `.env` |
