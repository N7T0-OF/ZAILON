# ZAILON 1.6.1 — Nexus, grille partagée et import sécurisé

Date de validation : 22 juillet 2026

## Résultat

La barre de titre native affiche désormais uniquement `ZAILON · v1.6.1`. Le libellé `Universal Mod Launcher` n’y apparaît plus.

Explorer partage maintenant les mêmes contrôles entre GameBanana et Nexus Mods. L’import d’archives ne rejette plus un mod complet à cause d’un fichier sensible tel que `tools\scc.exe` : ZAILON inspecte ce fichier, conserve les éléments ordinaires et isole le contenu sensible sans jamais l’exécuter.

## Vérification des 20 exigences

1. **Barre fournisseur partagée** — `ProviderExplorerToolbar` est utilisée par GameBanana et Nexus.
2. **Grille/liste partagée** — les deux fournisseurs utilisent `ProviderViewModeToggle` et le même état persistant.
3. **Bouton cyclique unique** — `GridColumnCycleButton` remplace le menu déroulant des colonnes.
4. **Cycle 2 → 3 → 2** — contrôlé dans le navigateur avec les libellés accessibles correspondants.
5. **Masqué en mode liste** — zéro bouton de colonnes détecté après passage en liste.
6. **Persistance** — la préférence `exploreColumns` est conservée dans le store ; l’ancienne valeur `auto` est migrée vers `2`.
7. **Comportement responsive** — à 900 px, une préférence de trois colonnes se replie réellement sur deux colonnes, sans défilement horizontal.
8. **Retour visuel responsive** — le bouton annonce `3 colonnes choisies · 2 affichées temporairement faute d’espace`.
9. **Recherche Nexus** — recherche, chargement, erreur et absence de résultats sont gérés dans la même structure que GameBanana.
10. **Tri Nexus** — récent, mise à jour, popularité et téléchargements sont disponibles via le contrôle partagé.
11. **Pagination Nexus** — les pages sont calculées sur les résultats réellement chargés ; aucun total distant fictif n’est affiché.
12. **Requêtes Nexus obsolètes** — un identifiant de requête empêche une réponse ancienne de remplacer les résultats d’une recherche plus récente.
13. **Adaptateurs fournisseurs** — `GameBananaExplorerAdapter` et `NexusExplorerAdapter` normalisent les données avant affichage.
14. **Inspection avant déploiement** — extension, taille, SHA-256, signature, type magique et raisons du niveau de risque sont enregistrés.
15. **Détection sensible étendue** — exécutables, DLL, installateurs, scripts, liens, pilotes et binaires sans extension sont couverts.
16. **Règles propres aux jeux** — seuls les binaires attendus par un adaptateur connu, notamment Cyberpunk 2077 et FiveM, peuvent être déployés dans un chemin reconnu.
17. **Quarantaine par défaut** — un binaire inattendu est stocké sous `<appLocalData>/quarantine/<import-id>/files`, hors du jeu et hors du contenu actif.
18. **Décision explicite** — l’utilisateur peut exclure, mettre en quarantaine, garder inactif ou annuler ; aucune option d’exécution n’existe.
19. **Transaction et traçabilité** — annulation/erreur nettoie le staging et la quarantaine temporaire ; manifeste, évaluation et origine sont conservés pour une importation validée.
20. **Historique visible** — les états `awaiting_user_decision` et `completed_with_warnings` apparaissent dans Téléchargements et dans la barre d’état.

## Cas de non-régression `tools\scc.exe`

Le test Rust `quarantines_tools_scc_without_rejecting_or_executing_the_mod` construit une archive factice contenant :

- `readme.txt`, importé normalement ;
- `tools\scc.exe`, dont le contenu de test commence par la signature PE `MZ`.

Le résultat attendu et vérifié par le test est :

- l’archive complète n’est pas rejetée ;
- `readme.txt` existe dans le contenu importé ;
- `tools\scc.exe` n’existe pas dans le contenu actif ;
- `tools\scc.exe` existe dans la quarantaine ;
- le type magique détecté est `PE/COFF executable` ;
- le SHA-256 enregistré est `4b6d9f18bf5f9691b01595278001002d167ddd472b7a25e9b87af89642f3b089` ;
- `automaticExecution` reste à `false`.

Le binaire du test est une fixture inoffensive et n’est jamais lancé.

## Contrôles réalisés

- `npm.cmd run build` : réussi, TypeScript et bundle de production valides.
- `cargo fmt --all -- --check` : réussi.
- `git diff --check` : réussi.
- Contrôle dans le navigateur intégré à 1280 px et 900 px : titre correct, cycle des colonnes correct, mode liste correct, aucun débordement horizontal et aucune erreur console.
- Les tests Rust complets sont délégués à GitHub Actions sur Windows, macOS et Linux, car cette machine Windows ne dispose pas de l’éditeur de liens MSVC `link.exe`.

## Limites honnêtes

- ZAILON ne prétend pas qu’un fichier est « sûr » quand aucun moteur antivirus local n’est disponible. Le rapport indique alors `Unavailable` et conserve le traitement sensible.
- La vérification de signature est enregistrée comme inconnue lorsqu’elle ne peut pas être établie localement.
- Un connecteur Nexus non configuré n’invente ni résultats ni pagination. Une clé API personnelle valide reste nécessaire pour charger le catalogue Nexus dans l’application native.
