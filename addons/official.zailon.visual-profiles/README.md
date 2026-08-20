# Visual Profiles — official.zailon.visual-profiles

Profils visuels par jeu : luminosité, contraste, saturation, gamma et
restauration automatique en fin de session (spec « Visual Profiles en add-on »
§57-61, §101-102).

- **Capacité** : `visual.profiles`
- **Slots UI** : `GameConfiguration.Visual`, `QuickPanel.Visual`,
  `GameDiagnostics.Visual`
- **Installation optionnelle** — sans cet add-on, aucune fonctionnalité
  visuelle n'existe dans le Core (ni onglet, ni réglage, ni diagnostic).
- **Distinct de ReShade** (spec §60-61) : ici réglages d'affichage système
  sûrs ; ReShade = post-processing du jeu. Ils coexistent sans dépendance.

## Build

```bash
npm run addon:build:official
```

Le package est généré dans `zailon-addons/packages/visual-profiles/` et le
catalogue (`zailon-addons/catalog.json`) est mis à jour automatiquement
(SHA-256, taille, version).
