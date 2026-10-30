# Cyberpunk 2077 : import à racine de jeu et réparation

Date du rapport : 23 juillet 2026

## Statut honnête

Les nouveaux imports Cyberpunk reconnaissent désormais plusieurs mods et frameworks dans un dossier général, détectent leur vraie racine et les stockent comme candidats indépendants. Un assistant peut aussi remettre à la racine du jeu les chemins incorrects d’anciens paquets avec snapshot et rollback.

L’assistant de réparation ne sépare pas encore un ancien paquet composite en plusieurs nouveaux identifiants de paquets. Les versions des frameworks ne sont pas extraites et aucun lancement réel de Cyberpunk n’a été exécuté sur ce poste. Ces limites empêchent de déclarer l’ensemble des critères du cahier des charges terminé.

## Cause du faux message de dépendance

L’ancienne fonction `import_candidate_roots` considérait explicitement un dossier ressemblant à une racine Cyberpunk comme un unique « composite mod ». Lorsqu’aucune racine directe n’était reconnue, `stage_content` copiait le dossier sous :

```text
content/mods/<nom-du-dossier>/
```

Un dossier importé pouvait donc devenir :

```text
content/mods/redscript/r6/scripts/
content/mods/RED4ext/red4ext/
content/mods/MyMod/archive/pc/mod/
```

Le diagnostic de lancement cherche les chemins qui seront réellement projetés :

```text
r6/scripts/
engine/tools/scc.exe
red4ext/plugins/
red4ext/red4ext.dll
archive/pc/mod/
```

Les frameworks existaient dans le stockage, mais derrière un conteneur artificiel `mods/<nom>`. Ils n’étaient donc pas visibles à l’endroit où Cyberpunk les charge, ce qui produisait les messages redscript/RED4ext manquants.

## Nouvelle détection

Les racines connues sont recherchées sans se fier uniquement au nom du dossier :

- `archive/pc/mod`
- `r6/scripts`
- `r6/tweaks`
- `red4ext/plugins`
- `bin/x64/plugins`
- `bin/x64/plugins/cyber_engine_tweaks/mods`
- vrai REDmod `mods/<nom>/info.json`
- `engine`
- `tools`

Le scan retourne pour chaque candidat :

```text
sourcePath
detectedRoot
detectedFramework
relativeGamePaths
strippedSegments
rootConfidence
rootReason
```

Les signatures de fichiers identifient notamment redscript, RED4ext, ArchiveXL, TweakXL, Codeware, CET, REDmod et les plugins génériques.

## Exemples avant / après

Redscript imbriqué :

```text
Avant
download/redscript-v1/redscript/r6/scripts/
download/redscript-v1/redscript/engine/tools/scc.exe

Après, paquet détecté
content/r6/scripts/
content/engine/tools/scc.exe
```

Plugin RED4ext :

```text
Avant
mods/RED4ext/red4ext/plugins/Example/plugin.dll

Après
content/red4ext/plugins/Example/plugin.dll
```

Archives :

```text
Avant
collection/archive/pc/mod/vehicle.archive

Après
content/archive/pc/mod/vehicle.archive
```

La destination virtuelle finale reste relative à la vraie racine de Cyberpunk :

```text
Cyberpunk 2077/
├── archive/pc/mod/
├── r6/scripts/
├── r6/tweaks/
├── red4ext/
├── bin/x64/plugins/
├── engine/
└── tools/
```

## Séparation des nouveaux imports

Un dossier racine contenant plusieurs éléments n’est plus renvoyé comme un seul candidat opaque. Le scan énumère les enfants probables des emplacements connus et les déduplique par chemin canonique.

Exemple testé par fixture :

```text
archive/pc/mod/vehicle.archive
archive/pc/mod/ui.archive
r6/scripts/VehicleHandling/main.reds
red4ext/plugins/TweakXL/TweakXL.dll
```

Le scan obtient plusieurs candidats, dont `VehicleHandling` et `TweakXL`, et ne conserve pas la racine générale comme unique paquet.

## Réparation des imports existants

L’assistant :

1. analyse chaque paquet du store ;
2. propose les déplacements prouvés, par exemple `mods/redscript/r6/...` vers `r6/...` ;
3. refuse les collisions ;
4. crée un snapshot complet dans `games/<game>/repairs/<repair-id>/snapshot` ;
5. reconstruit le contenu dans un dossier de travail ;
6. échange le contenu seulement après copie réussie ;
7. met à jour le manifeste ;
8. permet un rollback ultérieur.

Il ne retire pas arbitrairement le premier dossier reconnu et ne touche pas un vrai REDmod `mods/<nom>/info.json`.

## Profil, conflits et vue runtime

- Les paquets du store sont immuables ; le profil contient des références, activations, ordre et règles de conflits.
- Le backend actuel est `TemporaryCopy`, pas usvfs.
- Tous les paquets activés du profil participent au diagnostic : un framework peut donc satisfaire un autre mod.
- Pour chaque chemin, le gagnant est déterminé par l’ordre du profil ou par une règle explicite.
- Avant le lancement, les fichiers gagnants sont copiés dans la vraie racine du jeu.
- La signature du fichier source et celle du fichier projeté sont comparées.
- Un manifeste `resolved-files.json` marque chaque chemin `runtimeVisible: true`.
- Après fermeture, les originaux sont restaurés et les changements sont capturés dans `profiles/<profile>/overwrite`.

`runtimeVisible` prouve que le processus peut trouver le fichier à son chemin, pas que redscript ou RED4ext l’a effectivement chargé. Une preuve `loaded-by-game` demanderait un journal ou une API du framework.

## Diagnostic des frameworks

redscript est accepté si un mod fournit `r6/scripts/` et si `engine/tools/scc.exe` existe déjà dans le jeu ou est fourni par un paquet actif.

RED4ext est accepté si un plugin fournit `red4ext/plugins/` et si `red4ext/red4ext.dll` existe déjà ou est fourni par le profil.

La même vue combinée est utilisée pour CET, TweakXL, ArchiveXL, Codeware et REDmod. Le test ne se limite donc plus au paquet qui contient le mod dépendant.

Les versions et compatibilités de versions ne sont pas encore résolues.

## Tests ajoutés

- racine Cyberpunk générale divisée en candidats indépendants ;
- redscript doublement imbriqué et conteneurs supprimés ;
- staging d’un fragment `r6/scripts/<mod>` à la racine correcte ;
- reconnaissance de frameworks par fichiers ;
- normalisation de réparation ;
- protection d’un vrai REDmod ;
- conservation d’un chemin déjà correct.

Des tests plus anciens couvrent aussi le staging d’une racine composite, les diagnostics de frameworks, les conflits et la projection temporaire.

## Tests réellement exécutés

- `npm.cmd run build` : réussi.
- `cargo fmt` : réussi.
- `git diff --check` : réussi.
- GitHub Actions a compilé le backend et exécuté 29/29 tests Rust avec succès sur Windows et Linux, y compris les nouvelles fixtures Cyberpunk.
- Les mêmes tests ne peuvent pas être exécutés localement : le poste ne possède pas `link.exe` ni les bibliothèques du Windows SDK.
- Aucun import réel de plusieurs centaines de mods n’a été exécuté.
- Aucun package Cyberpunk réel de l’utilisateur n’a été modifié par ces tests.
- Aucun lancement Cyberpunk, test redscript en jeu ou test RED4ext en jeu n’a été exécuté.

## Limites bloquantes restantes

- L’ancien paquet composite réparé conserve son identifiant unique ; il est rerooté mais pas éclaté en plusieurs paquets.
- Aucun sélecteur manuel de racine n’est encore présent.
- Les versions de redscript/RED4ext/ArchiveXL/TweakXL/Codeware/CET ne sont pas lues.
- Les incompatibilités de versions et doublons de frameworks ne sont pas arbitrés.
- Il n’existe pas encore d’action « Créer un mod depuis Overwrite ».
- La classification complète `Vanilla / Framework / Mod / Unknown` d’une installation Cyberpunk déjà moddée n’est pas implémentée.
- La validation native et les essais sur une vraie installation Cyberpunk restent nécessaires.

La correction de structure est donc réelle pour les nouveaux imports et réversible pour les anciens chemins, mais le chantier MO2-style complet reste en cours.
