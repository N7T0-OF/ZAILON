# Analyse des plugins MO2 locaux

Le dossier local contient 673 fichiers :

- 270 sources Python et 217 bytecodes ;
- 38 DLL de plugins et 59 modules Python natifs ;
- installateurs simple, manuel, BAIN, bundle, FOMOD et wizard ;
- plugins de diagnostic et de prévisualisation ;
- plugins de jeux Bethesda et `basic_games`.

## Classification

| Famille | Exemples locaux | Idée ZAILON | Réutilisation binaire |
|---|---|---|---:|
| GamePlugin | Cyberpunk, Skyrim, Fallout, Starfield | adaptateur de chemins/launch | non |
| InstallerPlugin | simple, manuel, BAIN, FOMOD | plan déclaratif vérifié | non |
| PreviewPlugin | fichiers, BSA, DDS | aperçu isolé | non |
| DiagnosePlugin | conflits, fichiers manquants | diagnostics sans exécution | non |
| ToolPlugin | FNIS, éditeur INI | exécutable géré validé | non |
| MetadataPlugin | Nexus/catégories | fournisseur typé | non |

Les DLL n’ont pas été chargées pendant l’audit. Leurs métadonnées Windows ne fournissent
pas de cartographie de licence suffisamment précise ; elles sont donc refusées.

`basic_games` est MIT et expose une architecture utile : identification du jeu,
détection de l’installation, validation/correction de l’arbre d’un mod, exécutables et
fonctionnalités optionnelles. ZAILON réimplémente ces idées avec ses types Rust/TypeScript
et ne cherche pas la compatibilité binaire avec l’API MO2.

## API ZAILON recommandée

```text
GamePlugin
InstallerPlugin
ProviderPlugin
PreviewPlugin
DiagnosePlugin
ToolPlugin
MetadataPlugin
```

Tout plugin futur doit déclarer son identifiant, sa version, ses capacités, ses jeux,
sa licence, son hash, sa provenance, ses permissions et son mode d’isolation. Une DLL
inconnue ne doit jamais être chargée par simple détection de dossier.

