# Persistance, Theme Bootstrap et DesignTokenService (release 1.62.0)

Spec : « Persistance globale des actions + Accent Color universel » (§1-14,
§66-71).

## Cause racine du bug d'accent (spec §6)

La couleur d'accent choisie dans Paramètres > Apparence était appliquée en
session (via `bg-gold` → `var(--zailon-accent)`) mais **jamais persistée** :
`accentColor` était absent de `partialize` (zustand persist). Au redémarrage,
la migration retombait sur la valeur par défaut `#f3faf8` (blanc).

Correctif :

- `accentColor` ajouté à `partialize` → écrit à chaque changement (debouncé
  250 ms pour le color picker, flush sur `beforeunload` **et** `pagehide`) ;
- `ThemeBootstrapService` (`bootstrapTheme`) : lecture du réglage persisté et
  injection des tokens AVANT le premier rendu — aucun flash du thème par
  défaut (spec §7).

## DesignTokenService (spec §8-14)

`src/lib/designTokens.ts` — la SEULE source des couleurs d'action :

| Token | Usage |
| --- | --- |
| `--zailon-accent` | fond d'action (Jouer, Installer, sidebar actif, switch ON…) |
| `--zailon-accent-hover` / `-active` | états survol / enfoncé |
| `--zailon-accent-muted` / `-border` | fonds légers, bordures d'accent |
| `--zailon-accent-text` / `-contrast` | texte lisible sur l'accent (contraste auto) |
| `--zailon-focus-ring` | anneau de focus |
| `--zailon-danger` / `-hover` / `-muted` | actions destructives (Désinstaller, Supprimer) — **jamais remplacé par l'accent** (spec §70) |

Règle (spec §9) : aucun composant principal ne choisit sa propre couleur
d'action — il demande ses couleurs au DesignTokenService.

## Migration (spec §9-13)

44 occurrences migrées : bouton **Jouer** (Accueil + Bibliothèque), **Ajouter**,
**Installer**, **Détails**, **sidebar actif**, boutons de validation/fermeture,
Quick Panel. `bg-[#dbe8e5]` → `var(--zailon-accent)`, `text-[#101313]` →
`var(--zailon-accent-text)`, hover → `var(--zailon-accent-hover)`.

## Audit (spec §68)

`.github/scripts/audit-accent-tokens.ts` (test CI) : échoue si un composant
hardcode un fond d'accent prédéfini ou un texte de contraste sombre. Les
surfaces sombres (`bg-[#101313]`) restent autorisées — seules les couleurs
d'ACTION sont interdites en dur.

## Test de persistance (spec §67)

Scénario manuel : choisir un accent → fermer → relancer → la couleur est
identique, appliquée dès le premier frame (bootstrap). L'accent audit CI
garantit qu'aucun composant ne retombe sur une couleur hardcodée.

## Suite (blocs suivants)

- État installé/désinstallé synchronisé dans Explorer (spec §15-23) ;
- partage de profils `.zailonprofile` / manifeste léger (spec §24-92).
