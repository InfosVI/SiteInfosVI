# Évaluation des facteurs relatifs à la vie privée

Site « Infos publiques sur les volontaires internationaux » — version du 26/11/2026.
Document tenu par l'éditeur du site, à mettre à jour à chaque changement important (nouvelle collecte, nouvel
hébergeur, nouvelle fonctionnalité). Il n'est pas un avis juridique.

Cadres pris en compte : **Loi 25** (Québec, Loi sur la protection des renseignements personnels dans le secteur privé,
notamment l'article 17 pour la communication hors du Québec), **LPRPDE** (Canada), **RGPD** (Union européenne, pour
les visiteurs situés dans l'UE) et recommandations de la **CNIL** sur la mesure d'audience.

## 1. Ce que fait le site

1. **Il collecte et republie des données publiques** : arrêtés du Journal officiel (open data DILA), textes de
   Légifrance (API PISTE), taux de change (BCE, Frankfurter), indices des prix (Statistique Canada).
   - Ces données décrivent des barèmes, des taux et des indices. **Elles ne concernent aucune personne** : ce ne sont
     pas des renseignements personnels.
   - Elles sont réutilisées selon leur licence (Licence Ouverte de la DILA, licence ouverte de Statistique Canada,
     conditions de la BCE), avec mention de la source, sans en modifier le sens. Seules les données publiques sont
     utilisées : aucun document privé (bulletin de paie, barème non publié) n'est utilisé ni publié.
2. **Il recueille quelques renseignements sur ses visiteurs**, détaillés ci-dessous. Le site n'a **pas de compte
   visiteur** et ne demande jamais de nom, d'adresse postale ou de pièce d'identité.

## 2. Renseignements recueillis sur les visiteurs

| Donnée | Pourquoi | Obligatoire ? | Durée |
|---|---|---|---|
| **Mesure d'audience** (Umami, sur le serveur du site) : **aucun cookie** ; identifiant anonyme calculé à partir de l'adresse IP et du navigateur brouillés (non conservés), renouvelé chaque mois ; réseau d'origine **tronqué** (IPv4 /16, IPv6 /32 : indique le fournisseur, pas la personne) ; pages vues, pays, type d'appareil, actions « Visiteur actif » (temps passé + interaction) | statistiques de fréquentation (visiteurs qui reviennent dans le mois), sans savoir qui est la personne | non : refusable à tout moment depuis la page Confidentialité | statistiques 25 mois (effacement automatique chaque nuit au-delà) |
| **Protection du site** : cookie technique aléatoire et informations techniques rendues non identifiantes | empêcher les votes multiples et bloquer les tentatives d'intrusion | oui, uniquement pour voter, proposer une valeur ou se connecter à l'espace admin | 30 jours |
| **Propositions et votes** (quand ils seront ouverts) | valeurs proposées par les visiteurs et leurs votes, sans lien avec une identité | non, à l'initiative du visiteur | propositions : jusqu'à 6 mois ; votes : liés à la protection ci-dessus |
| **Formulaire de contact** : message, adresse email **facultative** (aucun identifiant du visiteur n'est enregistré avec le message) ; pour limiter l'envoi à 1 message / 12 h : cookie et adresse IP rendus non identifiants (empreintes), effacés après 12 h | répondre au visiteur s'il le souhaite ; empêcher les envois en masse | non, à l'initiative du visiteur | message : 60 jours (effacement automatique) ; empreintes : 12 h |
| **Journaux techniques** du serveur, adresses IP rendues non identifiantes | sécurité et dépannage | oui | 30 jours |

Principes appliqués :
- **minimisation** : rien n'est demandé qui ne serve à l'une de ces finalités ;
- **pas de revente, pas de publicité, pas de profilage** ; les données ne sont transmises à **aucun tiers** ;
- **aucun outil tiers** de statistiques, de captcha ou de police d'écriture : tout est hébergé sur le serveur du site ;
- les données servant à la protection ne sont **jamais** utilisées pour la mesure d'audience, et inversement ;
- l'accès aux données est réservé à l'administrateur du site.

## 3. Où sont les données

- **Serveur** : chez l'hébergeur indiqué dans les mentions légales du site, au **Canada (Québec)**, serveur dédié au site.
- **Sauvegardes** : sur le serveur (accès réservé à l'administrateur système, 7 copies) et, à la demande, téléchargées sur
  l'ordinateur de l'administrateur ; aucun service de stockage tiers.
- Pour un visiteur du Québec, les données **restent au Québec** (serveur au Québec) : il n'y a pas de communication
  hors du Québec pour l'hébergement.
- Pour un visiteur situé dans l'Union européenne, les données sont traitées au Canada, pays reconnu par l'Union
  européenne comme offrant une protection adéquate (décision d'adéquation).

## 4. Communication hors du Québec (article 17 de la Loi 25)

Aucune aujourd'hui : le site et ses sauvegardes restent au Québec, sauf la copie que l'administrateur télécharge à la
demande sur son propre ordinateur. Elle concernerait l'hébergement lui-même si le serveur était un jour déplacé (par
exemple dans l'Union européenne).

Évaluation préparée pour le cas où des sauvegardes chiffrées seraient un jour envoyées vers un stockage distant :

| Critère de l'article 17 | Évaluation |
|---|---|
| **Sensibilité** des renseignements | **Faible** : identifiants aléatoires, informations techniques rendues non identifiantes, éventuellement une adresse email donnée volontairement. Aucune donnée de santé, financière, d'identité ou de localisation précise. |
| **Finalité** | Sauvegarde et continuité du service (ou hébergement) ; aucune autre utilisation. |
| **Mesures de protection** | Chiffrement **avant** l'envoi (le fournisseur ne voit que des données illisibles) ; accès restreint ; conservation limitée (30 jours, puis une sauvegarde par mois pendant 6 mois) ; contrat du fournisseur interdisant toute autre utilisation. |
| **Régime juridique** du lieu de destination | Union européenne : RGPD, protection au moins équivalente à celle du Québec. États-Unis : protection moindre en théorie, compensée ici par le chiffrement préalable (données illisibles pour le fournisseur). |

**Conclusion** : les renseignements bénéficieraient d'une **protection adéquate**, conforme aux principes
généralement reconnus, en raison de leur faible sensibilité, de leur minimisation et du chiffrement préalable. La
communication est donc acceptable dans ces conditions.

## 5. Droits des personnes

- **Accès, correction, effacement, opposition** : par le formulaire de contact du site.
- **Refus de la mesure d'audience** : en un clic dans la page Confidentialité ; le choix est respecté immédiatement.
- **Réclamation** : Commission d'accès à l'information du Québec ; au Canada, Commissariat à la protection de la vie
  privée ; dans l'Union européenne, l'autorité du pays du visiteur (en France, la CNIL).
- **Responsable** de la protection des renseignements personnels : l'éditeur du site, joignable par le formulaire de
  contact.

## 6. Incidents

En cas d'incident de sécurité touchant des renseignements personnels : évaluation du risque, registre des incidents,
avis à la Commission d'accès à l'information et aux personnes concernées si le risque de préjudice est sérieux (Loi 25),
et notification à l'autorité européenne compétente sous 72 heures si des visiteurs de l'UE sont concernés (RGPD).

## 7. Révision

À revoir :
- avant l'ouverture des propositions, des votes et du formulaire de contact ;
- en cas de changement d'hébergeur ou de lieu de stockage des sauvegardes ;
- au moins une fois par an.

| Date | Changement |
|---|---|
| 26/11/2026 | Première version (serveur au Québec) |
