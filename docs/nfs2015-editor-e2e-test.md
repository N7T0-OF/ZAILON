# NFS 2015 — Plan de test e2e de l'éditeur

> Spec §58, §117. NFS 2015 (`nfs16.exe`, profil `NFS16SDK`) est la **cible de
> validation complète** de l'add-on Frosty Editor. Runtime conseillé : **1.0.6.3**
> (les mods NFS 2015 actuels exigent cette branche).

## Prérequis

- Add-ons installés et activés : `official.zailon.frosty` + `official.zailon.frosty-editor` ;
- runtime Frosty **officiel** détecté par Frosty Support (jamais bundle) ;
- Need for Speed (2015) dans la Bibliothèque.

## Scénario principal (spec §112, §117)

| # | Étape | Attendu |
| - | ----- | ------- |
| 1 | Bibliothèque → NFS → « Création de mods » | l'espace Création Frosty s'ouvre, jeu présélectionné |
| 2 | Créer un projet « NFS Night Mod » | projet créé hors du dossier du jeu |
| 3 | Indexer les assets | progression arrière-plan, UI fluide (§17) |
| 4 | Rechercher `sky` | résultats virtuels instantanés (§14-18) |
| 5 | Ouvrir un asset EBX | édition de propriétés, PointerRef (§19-21) |
| 6 | Modifier une valeur | diff Original/Modified affiché (§22) |
| 7 | Exporter/importer une texture | validation dimensions/format/mips (§24-27) |
| 8 | Mesh (si support) | export/import, composite si présent (§28) |
| 9 | Audio (si support) | preview EALayer3 (§31-33) |
| 10 | Bundles | add/remove/whitelist (§34-35) |
| 11 | Build & Test | build `.fbmod` → installé dans le profil Development → lancement NFS |
| 12 | Vérifier en jeu | la modification est visible |

## Vérifications supplémentaires

- **Autosave** : fermer brutalement → projet récupéré (§12, §118) ;
- **Worker** : simuler un crash de plugin → ZAILON reste ouvert, Worker redémarre (§118) ;
- **RAM** : fermer l'éditeur → mémoire du Worker libérée (§120) ;
- **ModData** : le build passe par Frosty Support (trouver/valider/reconstruire, §65) ;
- **Build → profil** : « Installer dans Default / un autre profil / ouvrir dossier » (§53) ;
- **Dev profile** : le test utilise un profil Development, pas Default (§55).

## Critères d'acceptation

- [ ] Le dépôt local a été audité (docs/frosty-source-audit.md, source-map, plugins) ;
- [ ] Frosty Editor est un add-on distinct, dépendant de Frosty Support ;
- [ ] l'installation ZAILON standard contient **0 fichier Frosty Editor** ;
- [ ] Frosty Editor installé mais non ouvert = zéro indexation, zéro Worker (§116) ;
- [ ] NFS 2015 testé en vrai (profil → index → EBX → build → jeu) ;
- [ ] crash Worker ne ferme pas ZAILON ;
- [ ] fermeture de l'éditeur libère sa RAM ;
- [ ] licence/attributions validées (docs/frosty-license-audit.md).
