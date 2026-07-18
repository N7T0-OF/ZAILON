# Inventaire des API fournisseurs

Dernière vérification : 18 juillet 2026. Cet inventaire distingue volontairement ce que ZAILON exécute réellement de ce qui reste bloqué par une inscription, un identifiant ou une documentation incomplète.

| Fournisseur | Documentation vérifiée | Base / authentification | Pagination et limites | État ZAILON 1.4 |
|---|---|---|---|---|
| GameBanana | [Core/List/Like](https://api.gamebanana.com/docs/endpoints/Core/List/Like), [Core/List/New](https://api.gamebanana.com/docs/endpoints/Core/List/New), [Core/List/Section](https://api.gamebanana.com/docs/endpoints/Core/List/Section) | `https://api.gamebanana.com/Core`, catalogue public sans clé | `List/New` exige un numéro de page. `List/Like` fait une recherche par préfixe d’au moins 2 caractères mais accepte actuellement `Game` et `Member`, pas `Mod`. Aucun total n’est inventé par ZAILON. | Recherche distante de jeux, historique/jeux épinglés, filtre des mods de la page, nouveautés/mises à jour, pages précédent/suivant, détails, indicateur NSFW et fichiers GameBanana sûrs : **implémentés**. Le tri popularité/téléchargements et le filtre texte portent seulement sur la page chargée car l’API publique ne fournit pas de recherche `Mod` ni ces tris globaux. |
| Nexus Mods | Fichier utilisateur « Nexus Mods API 3.0.0 », [API Acceptable Use Policy](https://help.nexusmods.com/article/114-api-acceptable-use-policy), [limites API](https://help.nexusmods.com/article/105-i-have-reached-a-daily-or-hourly-limit-api-requests-have-been-consumed-rate-limit-exceeded-what-does-this-mean), [client officiel communautaire Nexus-Mods](https://github.com/Nexus-Mods/node-nexus-api) | La clé personnelle est transmise uniquement par le backend Rust à l’API Nexus v1 et stockée dans le coffre du système. Une application publique et le téléchargement direct doivent utiliser le parcours d’enregistrement/SSO autorisé par Nexus. | 20 000 requêtes par 24 h, puis 500 par heure selon la documentation Nexus consultée. ZAILON lit les quotas depuis les en-têtes de réponse et les affiche sans exposer le secret. | Validation du compte, statut masqué, quotas, catalogue de jeux, flux nouveaux/mis à jour/tendances et ouverture de la page source : **implémentés**. Téléchargement direct : **désactivé** tant que ZAILON n’est pas enregistré comme application publique ; aucun résultat ni droit de téléchargement n’est simulé. |
| CurseForge | Fichier utilisateur « Cusrforge api.txt », [REST API officielle](https://docs.curseforge.com/rest-api/), [demande de clé](https://support.curseforge.com/support/solutions/articles/9000208346-about-the-curseforge-api-and-how-to-apply-for-a-key) | `https://api.curseforge.com`, en-tête `x-api-key` obtenu après validation CurseForge/Overwolf | `pageSize` maximal 50 ; `index + pageSize` ne doit pas dépasser 10 000. | Stockage/révocation sécurisés de la clé : **implémentés**. `/v1/games`, `/v1/categories`, `/v1/mods/search`, fichiers, URL de téléchargement et empreintes sont documentés mais **non activés** sans clé développeur validée. |

## Endpoints pertinents confirmés

### GameBanana

- `GET /Core/List/Like?itemtype=Game&field=name&match=…` (`Mod` n’est pas un type accepté par cet endpoint au 18 juillet 2026)
- `GET /Core/List/New?itemtype=Mod&gameid=…&page=…&include_updated=…`
- `GET /Core/Item/Data` pour les détails et fichiers d’un mod

### Nexus Mods API 3.0 fournie

- `GET /games/{game_domain}/trending-mods`
- `GET /games/{game_domain}/mods/{game_scoped_id}`
- `GET /games/{game_domain}/mod-file-versions/{game_scoped_id}`
- `GET /mods/{id}/files`
- `POST /mods/batch`, `POST /mod-file-versions/batch`
- opérations de collections, versions et téléversements expérimentales

Le fichier fourni ne suffit pas à implémenter honnêtement la navigation publique complète, l’authentification SSO de l’application et toutes les règles de téléchargement. Ces éléments restent explicitement marqués comme manquants.

### CurseForge

- `GET /v1/games`, `GET /v1/games/{gameId}` et versions/catégories
- `GET /v1/mods/search`, `GET /v1/mods/{modId}`, `POST /v1/mods`
- fichiers, changelog, URL de téléchargement
- correspondances exactes et floues par empreinte

## Règles d’implémentation

- Aucun secret n’est stocké dans le store Zustand, le dépôt Git, les journaux ou les archives `.zailon-profile`.
- Une source détectée dans un README ou un manifeste reste une suggestion. Une mise à jour automatique exige une correspondance `exact` ou une confirmation explicite de l’utilisateur.
- Les liens externes ouverts par le natif sont limités à HTTPS et aux domaines de confiance GameBanana, Nexus Mods et CurseForge.
- Les résultats non disponibles ne sont jamais remplacés par des données fictives.
