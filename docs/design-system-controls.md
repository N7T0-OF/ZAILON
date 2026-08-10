# Design system — contrôles, accent et parallaxe (release 1.59.0)

Spec : « Refonte globale des toggles, sections repliables et parallaxe des cartes ».
Cette release couvre les composants de contrôle, l'accent et le parallaxe carte
entière (les accordions Paramètres viendront dans une release suivante).

## Règle du design system

> Une **préférence binaire** = un switch. Une **sélection d'éléments** = une
> checkbox. Une **action** = un bouton.

## ZailonSwitch

Composant unique : `src/components/UI/ZailonSwitch.tsx`.

- `checked`, `onChange(checked)`, `disabled`, `loading`, `size` (`normal` 42×22,
  `compact` 34×18 pour Quick Panel et lignes denses), `className`, `aria-label`.
- ON = rond à droite + piste **`--zailon-accent`** (la couleur choisie dans
  Apparence) — jamais de bleu/vert/violet hardcodé.
- OFF = piste neutre sombre, rond à gauche (lisible même sans couleur, §58).
- Animation 140 ms (thumb + piste uniquement), annulée sous
  `prefers-reduced-motion`.
- `role="switch"` + `aria-checked`, focus clavier visible (`--zailon-focus-ring`).

## ZailonSelectionCheckbox

`src/components/UI/ZailonSelectionCheckbox.tsx` — checkbox native de sélection
(sélection de mods, dossiers d'import, profils à recréer), accent via
`accent-color: var(--zailon-accent)`. Le « Tout visible » de la liste de mods
reste natif (état intermédiaire via ref).

## Migration (spec §61 : les VALEURS ne changent pas)

- Paramètres : 24 préférences migrées (lisibilité, tâches, illustrations,
  Discord, mode jeu, panneau rapide, NSFW, mises à jour, à propos).
- Update Provider : « Ne plus afficher automatiquement les nouveautés ».
- Import intelligent : « Activer pour le prochain lancement ».
- Ancien `Toggle` (bg-gold hardcodé) **supprimé** — remplacé dans ModCard,
  GameConfigurationPanel, GameDiagnosticPanel, GameKeyboardPanel.
- Quick Panel : lignes Clavier et Discord → `ZailonSwitch size="compact"`.

## Accent (spec §47-48)

`src/lib/designSystem.ts` : `parseHexColor`, `relativeLuminance`,
`accentContrastText(hex)` → texte sombre sur accent clair, texte clair sur
accent sombre. Utilisé par App pour `--zailon-accent-text` (dédupliqué) et
testé (7 cas). Le switch utilise les variables CSS — aucun re-render requis.

## Accordions Paramètres (spec §31-36, §50-54, release 1.60.0)

`src/components/UI/AccordionSection.tsx` + 15 sections de SettingsView :

- en-tête compact : icône + titre + sous-titre très court + chevron (§35) ;
- **repliées par défaut** (§31) — « Réduire le scroll » (§52) ;
- état mémorisé (`localStorage zailon.settingsOpenSection`) et restauré au
  prochain lancement (§33) ;
- la recherche Paramètres et les liens internes (`open-settings-section`, ex.
  Quick Panel → Configurer) **déploient automatiquement** la section cible avant
  de défiler (spec §53-54, map `SETTINGS_SECTION_BY_LABEL`) ;
- point ambre sur « Application updates » quand une mise à jour est prête ou une
  erreur présente — jamais d'information critique totalement cachée (§39) ;
- animation 180 ms (fade + glissement léger), instantanée sous
  `prefers-reduced-motion` (§36).

La même logique pourra s'appliquer aux sections de Configuration par jeu
(§50-51) dans une release suivante.

## Parallaxe carte entière (spec §16-28)

`src/components/UI/ParallaxCover.tsx` + `GameLibraryCard` (GamesView) :

- La CARTE ENTIÈRE s'incline (conteneur + couverture + titre + badges + favori)
  comme une seule jaquette physique — le cas « image seule » n'existe plus.
- rotateX/rotateY max 4° (position du pointeur relative à la carte entière),
  scale max 1.012 — pas un zoom.
- Seule la carte survolée est animée (`will-change` pendant le survol), aucune
  boucle globale, retour au neutre 220 ms.
- Clic droit : carte au neutre AVANT l'ouverture du menu contextuel (§65).
- Les boutons (favori, menu, ouvrir) restent cliquables (§21).
- Désactivé : toggle Apparence OFF, animations réduites, tactile, pendant un
  jeu avec profil Performance (politique d'animations).

## Validation

- `tsc` ✅, build ✅, **178/178 tests** (7 nouveaux : design system).
- Verify native + Verify ZAILON ✅ (release 1.60.0).
