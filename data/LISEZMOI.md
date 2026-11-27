# Données publiques de départ

Reconstituées à partir de sources **publiques uniquement**, sans aucune donnée personnelle.
Séparateur `;`, décimales avec un point, encodage UTF-8.

| Fichier | Contenu | Source |
|---|---|---|
| `indemnite-part-geo-trimestrielle.csv` | part géographique par zone et par trimestre, 2014 → 2026, modes VIE et VIA, avec statut de fiabilité et texte source (`JORFTEXT…`) | Journal officiel, open data DILA (Licence Ouverte) |
| `textes-sources-evenements.csv` | chaque valeur lue dans les arrêtés (base en € ou variation en %) | idem |
| `part-fixe.csv` | part fixe (50 % du traitement de l'indice brut 244), commune à toutes les zones | Légifrance : décret 2000-1159 art. 18, décrets 82-1105 et 85-1148 |
| `taux-change-mensuel.csv` | taux € → devise, moyenne mensuelle, 146 devises | BCE, sinon Frankfurter |
| `cout-vie-mensuel.csv` | indice des prix à la consommation (2002 = 100), villes canadiennes | Statistique Canada, tableau 18-10-0004-01 |
| `pays-devises.csv` | devise de chaque pays | — |

## Règles de calcul
- Nouvelle valeur = ancienne × (1 + %), **tronquée au centime**.
- Une zone absente d'un arrêté trimestriel est **inchangée**.
- Avant le 23/05/2021, barème VIE propre (publié au JO en 2014, 2015, 2016) ; depuis, VIE = VIA sauf pays dérogatoires.
- Les valeurs du 1er janvier 2026 recalculées retombent au centime sur la base publiée au Journal officiel
  à cette date (contrôle public).

## Statuts de fiabilité
| Statut | Signification |
|---|---|
| base officielle / derogatoire | montant publié tel quel au Journal officiel |
| verifie | calculé, puis confirmé au centime par une base publiée ensuite |
| calcule depuis base 2026 / calcule | calculé à partir d'une base publiée |
| reconstitue | calculé avant 2023, sans montant publié pour le contrôler |
| deduit | ville créée en cours de route : valeur de l'ancienne zone avant sa création |
| bareme VIE annuel | montant VIE publié au JO (2014-2016) |
| identique VIA | mode VIE égal au mode VIA |
| manquant | aucune source : la case reste vide, rien n'est inventé |
