# Suppression de la section Outils — carte de redistribution

Statut : **implémenté et validé** (release 1.38.0)

La section « Outils » (page dédiée + onglet de la page jeu + entrées de navigation)
est supprimée. Chaque fonction a une destination claire — **aucune fonctionnalité
utile n'est perdue** (spec §55).

## Page « Outils » (ToolsView)

| Ancienne fonction | Nouvelle destination |
| --- | --- |
| Détection locale (Steam, Epic, Registre) | **Bibliothèque > ↻ Détecter** (déjà intégré à la vitrine) ; Palette Ctrl+K « Détecter des jeux » → Bibliothèque |
| Ajout manuel d'un exécutable | **Bibliothèque > + Ajouter**, bouton « + » de la Sidebar, Palette Ctrl+K « Ajouter un jeu » |
| Journal de mise à jour | **Paramètres > À propos > « Historique des versions »** (ouvre le journal local) |
| Visual Profiles | **Inchangé** — sa section dédiée reste dans la navigation et la configuration du jeu |

## Onglet « Outils » de la page du jeu

| Ancienne action | Nouvelle destination |
| --- | --- |
| Auditer le déploiement réel | **État & Diagnostic > Déploiement > « Lancer l'audit »** (déjà présent dans le panneau) |
| Réparer l'import MO2 et le déploiement (Cyberpunk) | **État & Diagnostic > Déploiement > « Réparer l'import MO2 et le déploiement »** + carte RED4ext (« Réparer le déploiement (import MO2) ») |
| Analyser le dossier Mods | Bouton ↻ du hero + onglet Mods (déjà présents) |
| Nettoyer les doublons | Onglet Mods (déjà présent) |
| Purger les paquets retirés | Onglet Mods (déjà présent) |
| Ouvrir le dossier Mods | **Configuration > Général > icône dossier** à côté de « Dossier Mods » |
| Importer des dossiers | Onglet Mods (déjà présent) |
| Importer depuis Mod Organizer 2 | **Onglet Profils > « Importer depuis Mod Organizer 2… »** |

## Ajouts liés (spec §43)

- **Configuration > Général** : icônes dossier « Ouvrir dans l'Explorateur » à côté de
  l'**Exécutable** (ouvre le dossier parent via Explorer), du **Dossier Mods** et du
  **Dossier Bypass / Loader**.
- **Palette Ctrl+K** : « Détecter des jeux » pointe vers la Bibliothèque (vitrine) ;
  l'entrée « Ouvrir Outils » est retirée.

## Navigation cible

Accueil · Bibliothèque · Explorer · Téléchargements · Visual Profiles · Paramètres —
plus aucune entrée « Outils ». Les fonctions avancées restent accessibles dans les
sections contextuelles de chaque jeu (Configuration, État & Diagnostic, Mods, Profils).

## Fichiers modifiés

- `src/components/Layout/Sidebar.tsx` — entrée Outils retirée.
- `src/components/Layout/AppWindow.tsx` — `ToolsView` retirée du routage.
- `src/components/Views/ToolsView.tsx` — **supprimé**.
- `src/components/Views/SettingsView.tsx` — « Historique des versions » dans À propos.
- `src/components/Views/GamesView.tsx` — onglet Outils retiré, bouton MO2 dans Profils,
  props diagnostic réparées.
- `src/components/Views/GameDiagnosticPanel.tsx` — `onRepairMo2` remplace `onOpenTools`.
- `src/components/Views/GameConfigurationPanel.tsx` — icônes dossier sur les chemins.
- `src/components/GlobalSearch.tsx` — actions rapides fusionnées dans la recherche unique (spec « Passe de correction » §6).
- `src/types/index.ts` — `'tools'` retiré de `ViewType` et `GameTab`.

## Validation

- `tsc` ✅, build ✅, 72/72 tests ✅, Verify ZAILON ✅ (CI).
