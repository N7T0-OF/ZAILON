# Nexus Collections : recherche, profils et file d’installation

Date du rapport : 23 juillet 2026

## Statut honnête

La recherche de Collections, la lecture d’une révision exacte, la création transactionnelle d’un profil vide et la file persistante de téléchargements sont implémentées. Les téléchargements Premium séquentiels et l’association NXM gratuite sont codés.

La fonction n’est pas encore une installation complète de Collection : les archives téléchargées ne sont pas encore analysées et stockées automatiquement comme paquets séparés, et le moteur d’instructions Vortex n’est pas implémenté. Le profil reste donc `NeedsAttention` après les téléchargements et n’est jamais annoncé `Ready` sans validation réelle.

## Services Nexus utilisés

- Recherche : `POST https://api.nexusmods.com/v2/graphql`, champ `collectionsV2`.
- Fiche et révision : GraphQL `collection` et `collectionRevision`.
- Compte : REST v1 `users/validate.json`.
- Lien de fichier autorisé : REST v1 `games/<domain>/mods/<modId>/files/<fileId>/download_link.json`.
- Réception gratuite : protocole officiel `nxm://`, avec `game`, `modId`, `fileId`, `key`, `expires` et `user_id`.

La clé API reste dans le coffre du système. Le lien NXM brut et ses paramètres temporaires ne sont ni persistés ni émis dans les événements.

## Recherche et fiche

Explorer > Nexus possède maintenant les modes `Mods` et `Collections`. La recherche, le tri, le filtre adulte et la pagination sont envoyés au serveur. Une fiche affiche les métadonnées réelles de la Collection et de la révision.

Exemple réel interrogé :

```text
Jeu : Cyberpunk 2077
Collection : iszwwe
Révision demandée et obtenue : 184
Entrées : chaque modFile possède son modId et son fileId exacts
Adulte désactivé : ADULT_CONTENT_BLOCKED renvoyé et présenté comme tel
Adulte activé : détail de révision reçu
```

La recherche réelle a également renvoyé 139 Collections pour le filtre testé et un `collectionCount` global du jeu de 675. Ces chiffres sont un relevé ponctuel, pas des constantes codées.

## Profil et plan reproductible

Le bouton d’installation :

1. recharge la révision depuis Nexus ;
2. détecte les capacités du compte ;
3. construit toutes les entrées avec leurs identifiants exacts ;
4. recherche un paquet local dont le manifeste porte les mêmes `nexusGameDomain`, `nexusModId` et `nexusFileId` ;
5. écrit atomiquement `games/<game>/collection-installs/<installation>/plan.json` ;
6. crée ensuite seulement le manifeste du nouveau profil ;
7. supprime le plan si la création du profil échoue.

Le profil créé est vide, verrouillé et indépendant :

```json
{
  "modStates": {},
  "locked": true,
  "collectionState": "Preparing ou NeedsAttention",
  "collectionMetadata": {
    "installId": "<identifiant>",
    "collectionId": 0,
    "slug": "<slug>",
    "installedRevisionId": null,
    "latestKnownRevisionId": 0,
    "selections": [],
    "localOverrides": []
  }
}
```

Il ne reprend ni mods, ni ordre, ni overwrite du profil actif.

## États de la file

Chaque entrée distincte peut être :

```text
Unavailable
WaitingForUser
Queued
NxmReceived
Downloading
Downloaded
Failed
```

Le plan conserve les entrées, tailles, exigences externes, avertissements, niveau de compte, état du profil et dates. La page Jeux > Téléchargements recharge ces plans après redémarrage et affiche progression, attente, file, erreurs, pause, reprise et annulation.

## Différence Premium / gratuit

Premium :

- `users/validate.json` doit confirmer `is_premium` ;
- aucune capacité n’est supposée à partir d’un texte UI ;
- le bouton Premium résout chaque lien officiel, un fichier après l’autre ;
- seules les destinations HTTPS Nexus/Nexus CDN sont acceptées ;
- limite de sécurité de 8 Gio par fichier ;
- taille exacte vérifiée lorsqu’elle est fournie ;
- reprise à partir des entrées déjà `Downloaded`.

Gratuit :

- chaque entrée devient `WaitingForUser` ;
- ZAILON ouvre la page officielle du fichier demandé ;
- l’utilisateur effectue la validation imposée par Nexus ;
- le retour NXM est associé uniquement au triplet exact jeu/mod/fichier ;
- le fichier est téléchargé depuis l’URL autorisée par Nexus ;
- après téléchargement complet, ZAILON ouvre la page de l’entrée suivante si cette option est active.

ZAILON ne simule aucun clic, ne scrape aucune page et n’utilise aucun miroir.

## Réutilisation locale

Deux cas sont reconnus :

- paquet déjà présent dans le store avec les trois identifiants Nexus exacts ;
- fichier déjà présent dans le cache exact `domain/modId/fileId`, non vide et de taille attendue.

La vérification par hash n’est pas possible lorsque Nexus n’en fournit pas. Un nom seul n’est jamais considéré comme une preuve suffisante.

## Instructions et indisponibilités

- Un fichier supprimé, introuvable ou en quarantaine devient `Unavailable`.
- Une entrée obligatoire indisponible maintient le profil dans `NeedsAttention`.
- Les ressources externes obligatoires sont conservées dans le plan.
- Une version de schéma inconnue ou un texte d’installation non vide est signalé comme instruction non prise en charge.
- Aucune instruction déclarative inconnue et aucun exécutable ne sont lancés.

Les priorités présentes dans la liste sont conservées comme ordre stable, mais elles ne sont pas encore appliquées à un manifeste de profil puisque les archives ne sont pas encore stagées.

## Tests réellement exécutés

- Requête réelle de catalogue Collections.
- Requête réelle de fiche et révision exacte `iszwwe`, révision 184.
- Cas adulte refusé puis autorisé.
- Compilation frontend `npm.cmd run build` réussie.
- Formatage Rust et contrôle du diff réussis.
- Tests purs de pagination serveur réussis.
- GitHub Actions : compilation et 29 tests Rust réussis sur Windows et Linux.
- La compilation native locale reste bloquée par l’absence du linker MSVC et du Windows SDK.
- Aucun compte Premium réel ni téléchargement complet de fichier Nexus n’a été utilisé pour un test de bout en bout.
- Aucun lancement de jeu avec un profil de Collection n’a été effectué.

## Fonctions restant à réaliser

- extraction ZIP/7z/RAR avec le même contrôle de sécurité que l’import manuel ;
- staging séparé de chaque archive dans `store/<package-id>` ;
- écriture des références et priorités dans le nouveau profil ;
- moteur sûr pour les règles, variantes, patches et choix optionnels ;
- sélection manuelle d’un fichier local et détection d’ambiguïté ;
- estimation et contrôle de l’espace disque avant démarrage ;
- retries temporisés, backoff et pause automatique sur quota ;
- progression octet par octet et historique enfant par fichier ;
- comparaison et mise à jour de révisions ;
- détachement d’un profil de sa Collection ;
- snapshot/rollback d’une mise à jour ;
- validation runtime et lancement du jeu ;
- compatibilité complète avec les instructions propres à Vortex.

Ces absences sont bloquantes pour annoncer « Collection installée ». La version actuelle doit être décrite comme un gestionnaire réel de catalogue, révision, profil et téléchargements, pas encore comme un installateur universel de Collections.

Références : [documentation GraphQL Nexus](https://graphql.nexusmods.com/), [politique d’utilisation de l’API](https://help.nexusmods.com/article/114-api-acceptable-use-policy), [règles officielles des Collections](https://help.nexusmods.com/article/115-guidelines-for-collections) et [client API Nexus officiel](https://github.com/Nexus-Mods/node-nexus-api).
