# Frosty Support — add-on officiel ZAILON

**ID** : `official.zailon.frosty` — **version** : 1.0.0 — **catégorie** : Jeux

Compatibilité Frosty pour les jeux Frostbite supportés (NFS, Battlefield,
Dragon Age, Mass Effect…). Ce module fournit la **capacité `frosty.backend`**
du Core : détection du runtime Frosty officiel (ModManager > Editor > Cmd),
scan réel des données du jeu, Worker natif isolé (PID + RAM) et parsing des
catalogues `.cat`.

## Installation

1. ZAILON → **Add-ons** → l'add-on doit être marqué **Disponible** (release
   publiée). Tant qu'il est « En développement », importez-le localement :
   **Importer un add-on** → `dist/official.zailon.frosty-v1.0.0.zailon-addon`.
2. Une fois installé et **activé**, l'espace « Création Frosty » et les
   options Frosty apparaissent (jeu Frostbite détecté).
3. **Frosty Editor** (`official.zailon.frosty-editor`) en dépend — le module
   d'édition s'installe par-dessus.

## Contrat

- **Lazy loading** : aucune initialisation au démarrage de ZAILON (§19).
- **Permissions minimales** : jeu (lecture/écriture), mods, réseau,
  lancement de processus — jamais d'accès implicite (§11-13).
- **Plateforme** : Windows (Frosty est Windows-only).
- Le runtime Frosty officiel n'est **jamais bundlé** (licence CC BY-NC-ND) —
  il est détecté sur l'appareil ou installé à la demande.

## Construction / publication

```powershell
.\scripts\release-addon.ps1 -AddonDir .\addons\official.zailon.frosty -Id official.zailon.frosty -Version 1.0.0
```

Voir `docs/addon-release-process.md` pour le cycle complet (tag → release →
`available: true`).
