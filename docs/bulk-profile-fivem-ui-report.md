# Rapport d’implémentation — profils, lots, FiveM et interface

## 1. Périmètre

Cette itération traite les blocages signalés : profils non hérités, persistance native séparée, opérations groupées, FiveM client, matériau natif honnête, accent, Explorer, galerie et notifications.

## 2. Contrat de création

`addProfile` crée maintenant un objet neuf avec `modStates: {}`, zéro temps de jeu et aucun réglage hérité. La duplication reste une action séparée et renseigne `clonedFromProfileId`.

## 3. Arborescence native

Chaque profil est matérialisé sous `games/<game-id>/profiles/<profile-id>/` avec `profile.json`, `mods.manifest.json`, `load-order.json`, `settings/`, `overwrite/`, `generated/`, `deployment/` et `cache/`.

## 4. Store immuable

Les nouveaux paquets importés utilisent `games/<game-id>/store/<package-id>/content`. La lecture et le déploiement restent compatibles avec l’ancien dossier `mods/` pour ne pas casser les installations existantes.

## 5. Manifeste avant/après

Avant, un nouveau profil copiait directement `modStates` du profil actif. Après, son manifeste contient zéro entrée. Une duplication copie explicitement les entrées et conserve une origine auditable.

## 6. Transactions

Une opération native écrit son journal `games/<game-id>/transactions/<operation-id>.json`, puis les manifestes cibles. Une erreur restaure les profils du snapshot `beforeProfiles`.

## 7. Sélection multiple

La liste prend en charge la case individuelle, le tout-visible tri-état, Ctrl/Cmd, Shift, Ctrl/Cmd+A lorsque la liste a le focus et Échap pour effacer.

## 8. Portée filtrée

« Tout visible » cible uniquement la recherche et l’étiquette actives. Le compteur affiche sélection visible et nombre de résultats visibles.

## 9. Barre d’actions

La barre collante expose Activer, Désactiver, Transférer, Copier, Étiquette, Retirer et effacer la sélection.

## 10. Transfert

Le transfert écrit d’abord la destination et retire ensuite les références source dans une même transaction logique. Aucun contenu partagé n’est supprimé.

## 11. Copie et copy-on-write logique

La copie réutilise le paquet immuable. Les modifications futures sont capturées dans l’`overwrite` du profil destination, ce qui évite une duplication massive et protège la source.

## 12. Retrait

Le retrait peut viser le profil courant ou tous les profils. Le paquet est conservé dans le store ; le nettoyage physique est séparé afin de garantir l’annulation et d’éviter une suppression encore référencée.

## 13. Annulation

Le dernier lot annulable restaure les profils précédents, ou les anciennes étiquettes pour une opération de catégorisation.

## 14. Verrouillage

Un profil verrouillé refuse renommage, ordre, note, activation, retrait et opération groupée. L’état est persisté dans son `profile.json`.

## 15. Dossiers et intégrité

L’interface ouvre racine, `overwrite` ou `generated`. Le backend crée les dossiers manquants, valide les identifiants et contrôle l’existence et le JSON des trois manifestes.

## 16. Corbeille des profils

La suppression d’un profil déplace son répertoire vers `games/<game-id>/trash/profiles/` au lieu d’un effacement immédiat.

## 17. FiveM — détection

Sous Windows, la détection ciblée vérifie `%LOCALAPPDATA%\FiveM\FiveM.exe`, `FiveM.app` et le dossier officiel de plugins. Une installation portable reste ajoutable manuellement.

## 18. FiveM — base neutre

`base-snapshot.json` contient chemins relatifs, tailles et signatures jusqu’à une profondeur bornée. L’installation complète n’est jamais copiée ; caches, logs et crashes sont exclus.

## 19. FiveM — séparation client/serveur

Les plugins `.asi`, DLL, INI et shaders sont mappés vers `FiveM.app/plugins`. La présence de `fxmanifest.lua`, `__resource.lua` ou `server.cfg` bloque l’import client avec une explication explicite.

## 20. FiveM — sécurité

ZAILON ne contourne ni anti-cheat, ni pure mode, ni règles serveur. L’interface rappelle que les serveurs peuvent refuser les plugins.

## 21. Matériau natif

La fenêtre Tauri est transparente. Le backend demande Mica/Acrylic sous Windows et Vibrancy sous macOS via l’API Tauri. Linux annonce un résultat dépendant du compositeur et utilise le repli CSS.

## 22. Preuve et état honnête

`dynamicBackdropVerified` reste `false` tant qu’un test manuel n’a pas confirmé que le changement du fond externe affecte la fenêtre. Aucun binaire DWMBlurGlass ni injection n’est utilisé.

## 23. Accent

La couleur par défaut est blanche. Préréglages, sélecteur libre et réinitialisation pilotent `--zailon-accent`, hover, active, muted, texte et focus ring. Les couleurs sémantiques ne sont pas remplacées.

## 24. Explorer et galerie

Le nombre de colonnes `Auto/2/3` est persisté et visible uniquement en grille. Un clic sur l’image principale ouvre une visionneuse plein format avec fermeture fond/Escape/X, flèches, compteur et miniatures, sans perdre la fiche parente.

## 25. Notifications et étiquettes

Les notifications sont dédupliquées, temporisées selon leur sévérité, mises en pause au survol et conservées dans un historique. Les étiquettes sont inférées prudemment depuis noms, chemins et métadonnées, puis peuvent être ajoutées et verrouillées par l’utilisateur.

## 26. Validation et limites

Le build frontend de production réussit. `cargo fmt --check` réussit après formatage. Les tests Rust ajoutés couvrent le mapping FiveM, le refus serveur et l’absence de diagnostics Cyberpunk sur un jeu générique. Leur exécution locale est bloquée sur cette machine par l’absence de `link.exe` MSVC ; la CI Windows possède l’outil requis. Le test visuel externe Mica/Acrylic reste manuel et ne doit pas être déclaré réussi par la CI.
