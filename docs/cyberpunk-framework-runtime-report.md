# Cyberpunk — Rapport runtime frameworks (spec §36-43, §61)

État des frameworks Cyberpunk après les releases 1.43.0 et 1.44.0.

## Modèle hiérarchique

Ordre de vérification (spec §37) :

```
RED4ext → redscript → ArchiveXL → TweakXL → Codeware → CET
```

RED4ext est le framework racine critique : quand il échoue, ses dépendants
(TweakXL, ArchiveXL, Codeware — plugins RED4ext) peuvent apparaître
« absents » alors qu'ils sont simplement dépendants. ZAILON n'accumule plus
trois messages « framework manquant » : le **premier** framework non prêt dans
l'ordre est la **cause primaire**, les suivants (dépendants de RED4ext) sont
des **conséquences** (spec §43).

## États distingués (spec §40)

| État | Sens | Blocage |
| ---- | ---- | ------- |
| `ready` | fourni et exposé correctement | non |
| `missing` | requis par un contenu actif mais aucun mod ne le fournit | oui |
| `absent` | non fourni ET non requis par le profil | non |
| `misplaced` | fourni par signature de fichier mais hors emplacement canonique (ex. `tweakxl.dll` à plat au lieu de `red4ext/plugins/TweakXL/`) | oui |
| `not-deployed` | présent dans le profil mais absent de la table virtuelle (racine mal exposée) — vérifié quand l'audit est disponible | oui |
| `incompatible` | empreinte changée depuis le dernier lancement réussi (Last Known Good, spec §41) | non (avertissement) |
| `consequence` | non disponible à cause de la cause primaire (pas de message propre) | via la cause |

Un framework manquant mais **non requis** (aucun `r6/scripts/` → redscript
absent, aucun plugin → pas de besoin) ne bloque jamais : il s'affiche
« Non requis ».

## Règles de besoins

- `red4ext/plugins/…` présent → RED4ext requis (core `red4ext/red4ext.dll`) ;
- `r6/scripts/…` présent → redscript requis (`engine/tools/scc.exe`) ;
- `r6/tweaks/…` présent → TweakXL requis (`red4ext/plugins/TweakXL/`) ;
- fichier `.xl` présent → ArchiveXL requis (`red4ext/plugins/ArchiveXL/`) ;
- Codeware / CET : capacités seulement (pas de besoin déductible automatiquement).

## Points d'entrée

- **Verrou pré-lancement** (`store/useStore.ts`) : le lancement Cyberpunk est
  bloqué avec « Framework principal non chargé : X — … Conséquences : … ».
- **Carte « Diagnostic hiérarchique · frameworks »**
  (`GameDiagnosticPanel.tsx`, section Frameworks) : les 6 frameworks dans
  l'ordre avec leur état, bannière cause primaire, avertissements Last Known
  Good — alimentée par l'audit (table virtuelle) et le snapshot LKG.
- Logique pure dans `src/lib/frameworkHierarchy.ts` (tests dédiés).

## Capabilities (spec §28-31) — 1.43.0

Les 6 frameworks sont détectés par **dossier canonique OU signature de fichier**
(`tweakxl.dll`/`tweak_xl.dll`, `archivexl.dll`, `codeware.dll`), jamais par le
nom du dossier — un paquet « core_01 » mal nommé fournit quand même la
capacité. Le validateur agrège les capacités sur tous les mods actifs (graphe
global) avant de résoudre les besoins.

## Validation

- `tsc` ✅, build ✅, **90/90 tests** (6 nouveaux pour la hiérarchie :
  cause primaire RED4ext → conséquences TweakXL/ArchiveXL, tout-en-place,
  misplaced par signature, not-deployed via table virtuelle, incompatible LKG,
  framework prêt après la cause).
- **Verify native ✅ + Verify ZAILON ✅** (release 1.44.0).

## Limites restantes

- Le chargement **réel** au runtime (Loaded) n'est pas vérifiable avant
  lancement : ZAILON n'affiche jamais « chargé » sans le log du jeu.
- « Réparer RED4ext » reconstruit la table virtuelle (audit) mais ne
  télécharge jamais une version sans confirmation explicite.
- Les règles de besoins Codeware/CET restent non déductibles automatiquement
  (aucun fichier ne les « exige » de façon fiable avant le runtime).
