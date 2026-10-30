# Rapport — UI compacte, nettoyage automatique et remapping par jeu

Lot livré dans la release **1.11.0** (commit `b3885d1`), conformément au spec
`docs/ui-cleanup-and-input-remap.md`.

## 1. Sections avant / après

- Onglets d'un jeu : **10 → 8** (Aperçu · Mods · Profils · Configuration · État & Diagnostic ·
  Outils · Téléchargements · Visuels). « Vue ZAILON » et « Conflits » fusionnés dans
  « État & Diagnostic » (sous-sections Résumé / Fichiers / Mods / Frameworks / Conflits /
  Déploiement / Entrées / Performances / Logs).
- Configuration d'un jeu : cartes pliables Lancement (exécutable, dossier Mods, **dossier
  Bypass/Loader**, **chemins additionnels**) / Apparence / Commandes / Sauvegardes / Compatibilité /
  Performances, avec résumé des valeurs effectives en tête.

## 2. Descriptions déplacées vers des bulles

- Composant réutilisable **`InfoBubble`** (ⓘ, ouverture ~180 ms, Échap / clic extérieur,
  accessible clavier) créé et utilisé pour : dossier Bypass/Loader, chemins additionnels,
  « Images Steam » (Paramètres), « Réduire les explications ».
- Préférence **« Réduire les explications »** : masque les descriptions secondaires des
  Paramètres et de Configuration (le détail reste dans les bulles).
- Audit automatique `npm run audit:ui` → `docs/settings-density-audit.md` (16 blocs > 160
  caractères détectés, plan MoveToTooltip / Shorten).

## 3. Liquid Glass

- **Supprimé totalement** : réglage, backend (`src/lib/windowEffects.ts` supprimé, -131 lignes),
  presets, aperçu, diagnostics, texte d'aide, variables CSS (`--liquid-*`), styles
  `data-liquid-glass-active`. Thème sombre conservé. Aucune prétention de transparence derrière la fenêtre.

## 4. Politique de rétention

- Toasts : 2 s (succès/info) · 5 s (avertissement) · 8 s (erreur) · action = persistante,
  minuteur suspendu au survol.
- Activité : max 250 événements par défaut (100/250/500/1000).
- Téléchargements : rétention au démarrage par défaut (1 j / 7 j / jamais), erreurs conservées
  7 jours, « Tout supprimer » jamais sur une tâche active. Voir `docs/history-retention-policy.md`.

## 5. Backend utilisé pour NTE

- **Aucun backend d'application implémenté** (Phase 2) : l'interception réelle des touches
  reste à écrire en Rust et exige des tests sur un vrai jeu. La fondation est en place :
  ordre des backends affiché (bindings natifs → layout → remapping limité à la fenêtre →
  Steam Input → aucune), presets « Déplacement uniquement » / « Clavier complet », hotkeys
  de suspension et kill switch configurables, dialogue « Tester » (aperçu honnête, pas
  d'interception), note **Anti-Cheat Expert** pour Neverness to Everness (aucun hook /
  injection / driver).

## 6. Chemins Bypass ajoutés

- `Game.bypassPath` (dossier Bypass / Loader) et `Game.runtimePaths` (nom + chemin + type :
  Loader / Signature bypass / Plugin folder / Script folder / Custom), éditables dans
  Configuration > Lancement. La détection automatique des outils (WolvenKit, CET…) reste
  un point des phases 3-4.

## 7. Accueil

- Voile de lisibilité réduit (couverture plus visible), badges contextuels (mods actifs,
  disposition clavier, profil visuel) affichés uniquement quand ils sont réellement actifs.

## 8. Tests exécutés

- `npx tsc --noEmit` OK ; `npm run build` OK ; `cargo fmt --check` OK ;
  `npm run release:notes -- --version v1.11.0 --strict` OK (12 nouveautés, 8 améliorations,
  1 suppression). Aucun fichier Rust modifié (les tests Rust s'exécutent sur les runners GitHub).

## 9. Limitations restantes

- Backends d'application du remapping (NTE inclus) : non implémentés, à valider sur la vraie
  version Steam (voir `docs/nte-keyboard-remap-test.md`).
- Timeline par jeu et historique d'installation par profil enrichi : suite Phase 2.
- Raccourcis globaux (suspendre / kill switch) : réglages stockés, enregistrement réel en Phase 2.
