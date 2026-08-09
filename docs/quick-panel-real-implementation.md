# Quick Panel — fenêtre réelle, état réel, diagnostic

Statut : **implémenté et validé** (release 1.40.0)

Le Quick Panel est une **fenêtre native Tauri indépendante** (jamais une
injection, jamais une div cachée de la fenêtre principale). Cette release
complète le panneau avec l'**état réel de la session** (spec §49) et le
**diagnostic de la fenêtre** (spec §22, §50).

## 1. Fenêtre native (déjà en place, spec §10-19)

`src-tauri/src/quick_panel.rs` :

- `WebviewWindowBuilder` — label `quick-panel`, 340×460, borderless,
  transparent, `always_on_top`, `skip_taskbar` ;
- **réutilisée** : `open_quick_panel` ramène la fenêtre existante au premier
  plan (`show` + `set_focus`) — créée une seule fois, réouverture sans
  recréation lourde (spec §19) ;
- **fermeture à la perte de focus** après le premier focus (spec §18) — le
  joueur reclique dans le jeu → le panneau se ferme, les réglages restent ;
- positionnée en bas à droite de l'écran du jeu ;
- raccourci global (Ctrl+Alt+Z par défaut) → `toggle_quick_panel` ;
- plein écran exclusif → message « Utiliser Borderless », aucune injection
  (spec §20) ; le panneau se ferme aussi lui-même s'il détecte le mode exclusif.

## 2. Contenu (déjà en place, spec §16-17, §24-25)

`src/components/QuickPanel.tsx` — rendu uniquement dans la fenêtre
`quick-panel` (même bundle, routage par `getCurrentWindow().label`) :

- session prioritaire adaptative : jeu, profil, mods actifs, disposition,
  bypass, RED4ext ⚠ ;
- visuel : activer/désactiver, profil précédent/suivant, restaurer ;
- clavier : bascule disposition ZAILON ;
- actions : « Ouvrir ZAILON » (focus fenêtre principale) et « Fermer » ;
- échange d'état par événements : `quick-panel-ready` →
  `quick-panel-state` (la fenêtre principale répond avec le résumé).

## 3. NOUVEAU — état réel (spec §49)

Le résumé `quick-panel-state` transmet maintenant les statuts **réels** de la
session (`connected`, `inputActive`, `visualActive`, `runtimeActive`), pas
seulement la configuration. Le panneau affiche :

```
✓ Connexion ZAILON   ✓ Clavier   ✓ Visuel   ✓ Runtime
```

Chaque badge en ✓/⚠ selon l'état d'activation réel. L'interrupteur clavier se
synchronise sur `inputActive` — fini l'état local optimiste.

## 4. NOUVEAU — diagnostic fenêtre (spec §22, §50)

- Commande native `quick_panel_status` → `{ created, visible, focused,
  alwaysOnTop, width, height, position }` (interrogée à l'instant, jamais de
  fausse activation) ;
- carte **« Quick Panel — diagnostic fenêtre »** dans État & Diagnostic >
  Lancement, **en mode avancé uniquement** :
  - `Window created` / `Visible` / `AlwaysOnTop` / `Focused` (état natif) ;
  - `Target session` — session prioritaire (spec §15) ;
  - `Foreground game` — jeu au premier plan (Alt+Tab) ;
  - `Renderer state` — Prêt / Visible / Créée (masquée) / Non créée.

## 5. Bouton Test (release 1.39.0, spec §21)

Paramètres > Panneau rapide en jeu > **« Tester le panneau »** : ouvre la vraie
fenêtre même sans jeu — vérifie création, taille, focus, raccourci.

## 6. Validation

- `tsc` ✅, build ✅, 78/78 tests ✅.
- **Verify native** (commande `quick_panel_status` compile Windows + Linux) +
  **Verify ZAILON** via CI.

## 7. Limites / tests restants sur machine réelle (spec §55)

- raccourci → vraie fenêtre pendant le jeu ;
- Alt+Tab → restauration, retour jeu → réapplication ;
- fermeture NTE → panneau fermé, badges disparus, bouton « Jouer » ;
- coût CPU/RAM du panneau (léger par conception : pas de rendu à 144 FPS, pas
  de polling lourd — sondage plein écran toutes les 2 s).
