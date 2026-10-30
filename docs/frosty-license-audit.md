# Frosty — Audit de licence

> Spec §87-89. Ce document est **bloquant** : aucune redistribution avant validation.

## Branche historique locale (CadeEvs/FrostyToolsuite, branche 1.0.6)

Le `README.md` de la source locale déclare explicitement :

> The Content, Name, Code, and all assets are licensed under a Creative Commons
> Attribution-NonCommercial-NoDerivatives 4.0 International License.

**CC BY-NC-ND 4.0** :

- ✅ Attribution possible ;
- ❌ **NonCommercial** — aucune utilisation commerciale ;
- ❌ **NoDerivatives** — aucune œuvre dérivée/modification redistribuable ;
- ❌ pas de sous-licenciement.

### Conséquences directes pour ZAILON

| Action | Autorisé ? |
| ------ | :--------: |
| Copier/embarquer le code Frosty dans l'add-on | ❌ **Interdit** |
| Modifier et redistribuer un build modifié | ❌ **Interdit** |
| **Piloter** le runtime Frosty officiel installé par l'utilisateur | ✅ (pas de copie) |
| Exécuter FrostyEditor.exe / FrostyModManager.exe officiels (téléchargés par l'utilisateur depuis le repo officiel) | ✅ à vérifier cas par cas (usage personnel, non commercial) |
| Réimplémenter les formats Frostbite (EBX/RES/chunks) depuis la documentation | ⚠️ formats ≠ code ; les formats ne sont pas protégeables, mais ne pas recopier l'implémentation |
| S'inspirer conceptuellement de l'architecture (séparation core/UI, services) | ✅ (idées/architecture ≠ expression) |

### Politique appliquée dans ZAILON (`FROSTY_LICENSE_POLICY`)

- `bundling: 'interdit'`
- `externalRuntime: 'requis — installation officielle Frosty détectée par Frosty Support'`
- Attribution conservée : **FrostyToolsuite — https://github.com/CadeEvs/FrostyToolsuite**
- L'add-on ne contient **jamais** de code, DLL ou assets Frosty : il détecte le runtime
  officiel (Frosty Support) et le pilote.

## Réécriture officielle moderne (FrostyToolsuite/FrostyToolsuite)

- **.NET 8 / Avalonia / MVVM Community Toolkit**, objectif cross-platform ;
- annoncée **en développement précoce, CLI-only, sans UI fonctionnelle complète** ;
- licence affichée : **GPL-3.0**.

### Conséquence

La GPL-3.0 du dépôt moderne ne couvre **pas** le code de la branche 1.0.6 (licences
différentes, pas de rétrocompatibilité de licence). On ne peut pas « contourner » la
CC BY-NC-ND en se basant sur la GPL-3.0 de l'autre dépôt.

## Recommandations

1. **Ne rien redistribuer** tant que la licence n'est pas clarifiée avec l'auteur.
2. ZAILON reste un **pilote** : l'utilisateur fournit son installation Frosty officielle
   (détection + intégration, exactement comme ReShade — spec ReShade §1-2).
3. Documenter la provenance dans l'add-on : `À propos → Sources → Licence`.
4. Ne pas « transformer » le projet ZAILON en dérivé Frosty : rester dans un launcher
   qui orchestre des outils externes.
