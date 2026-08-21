# Audit du débordement des modales ZAILON

> Livré avec la 1.20.1 (correctif de la fenêtre Nouveautés). But : vérifier que
> **aucune** micro-fenêtre de ZAILON ne peut pousser son bouton de fermeture hors
> de l'écran.

## Critère

Une modale est **conforme** si elle utilise le pattern 3 zones :

```
max-h-[…vh] overflow-hidden  +  flex-col
  ├─ header flex-none          (toujours visible)
  ├─ body min-h-0 flex-1 overflow-y-auto   (seul bloc scrollable)
  └─ footer flex-none          (toujours visible)
```

ou si son contenu est **court et fixe** (pas de risque de débordement).

## Résultats

| Modale | Fichier | Statut | Détail |
|---|---|---|---|
| **Nouveautés de la mise à jour** | `UpdateProvider.tsx` | ✅ **Corrigée** (1.20.1) | Était `max-w-md` sans scroll → remplacée par `ScrollableModal` (3 zones, max-h `min(760px, calc(100vh-64px))`, Échap/×/backdrop, failsafe, résumé + Voir tout) |
| Ressources du jeu | `GameResourcesDialog.tsx` | ✅ Conforme | `max-h-[92vh]` + `flex-col` + `min-h-0 flex-1 overflow-y-auto` |
| Détection Steam | `SteamDetectionDialog.tsx` | ✅ Conforme | Idem `max-h-[92vh]` + body scrollable |
| Révision Nexus | `ExploreView.tsx` (l.722) | ✅ Conforme | `max-h-[94vh]` + body `overflow-y-auto` |
| Confirmation Quitter le jeu | `HomeView.tsx` (quit modal) | ✅ Conforme | Petit contenu fixe, centré, `p-4` |
| Recherche globale (palette unique) | `GlobalSearch.tsx` | ✅ Conforme | `max-h-[54vh] overflow-y-auto` |
| Historique des tâches | `StatusBar.tsx` | ✅ Conforme | `max-h-[60vh] overflow-y-auto` |
| Panneau rapide en jeu | `QuickPanel.tsx` | ✅ Conforme | Hauteur fixe 460px, body scrollable |
| **Support / Me soutenir** | `SupportModal.tsx` | ⚠️ À surveiller | `max-w-md` **sans max-height ni scroll**, mais contenu court et fixe (3 liens) — pas de risque aujourd'hui. Migrer vers `ScrollableModal` si le contenu grandit. |
| Menu contextuel jeu | `GameContextMenu.tsx` | ✅ Conforme | Menu court, positionné |

## Conclusion

- **1 modale corrigée** (Nouveautés) — c'était la seule avec un contenu
  **variable et potentiellement très long** sans structure scrollable.
- **8 conformes** avec le bon pattern 3 zones ou un contenu court.
- **1 à surveiller** (Support) — contenu fixe court, aucun débordement possible
  en l'état.

## Rejouer l'audit

```bash
# Trouver les modales candidates au débordement (fixed inset-0 sans max-h):
grep -rln "fixed inset-0" src/components --include="*.tsx"
# Vérifier qu'aucune n'a un contenu long sans "overflow-y-auto":
grep -n "max-h\|overflow-y-auto" <fichier>
```
