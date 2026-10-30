# Visual Profiles — migration en add-on

Spec « Visual Profiles devient un add-on » §57-61, §101-102. Livré en **1.88.0**.

## Avant / Après

**Avant** : l'onglet « Visual Profiles » était une fonctionnalité du Core,
toujours visible, avec son backend natif (Gamma Ramp, saturation, restauration).

**Après** : `official.zailon.visual-profiles` est un **add-on officiel**
(catégorie « Visuel », capacité `visual.profiles`, plateformes `windows`),
livré avec un vrai package construit et **Disponible** dans la page Add-ons.

Sans l'add-on installé et activé :

- aucun onglet « Visual Profiles » dans la Sidebar ;
- aucun badge « Visuel · … » dans le Hero de l'Accueil ;
- aucun onglet « Visuels » dans la page Bibliothèque du jeu (l'emplacement
  affiche une invitation à installer l'add-on) ;
- aucun appel au backend visuel natif depuis le Core.

Avec l'add-on : l'onglet, les badges, le panneau rapide et la restauration
automatique reviennent — déclarés via `slots` (`GameConfiguration.Visual`,
`QuickPanel.Visual`, `GameDiagnostics.Visual`).

## Architecture

- `addons/official.zailon.visual-profiles/` : manifest (capacité +
  permissions `game.read`, `display.profiles`), module lazy, README, LICENSE,
  icône.
- Le backend natif reste dans le pont du Core (`native.visualProfiles`) mais
  n'est **accessible que si l'add-on est installé ET activé** (gate
  `hasCapability(capabilities, 'visual.profiles')`, `addonGating.ts`).
- Le module est chargé **à la demande** (lazy, spec Add-ons §19) — jamais au
  démarrage de ZAILON.

## Distinction ReShade (spec §60-61)

Visual Profiles = réglages d'affichage système sûrs. ReShade = post-processing
du jeu. Les deux coexistent sans dépendance obligatoire.

## Publication

```bash
npm run addon:build:official
```

→ package dans `zailon-addons/packages/visual-profiles/`, catalogue mis à jour
(SHA-256 réel), puis commit + push (branche stable `zailon-addons-stable`).

## Limite connue

Le panneau rapide (fenêtre native séparée, sans accès au store) affiche ses
contrôles visuels si la session l'exige ; un nettoyage natif complet du pont
visuel pour le cas « add-on désinstallé en cours de session » est une phase
suivante.
