# Accueil modulaire — système de widgets

Spec « Accueil modulaire » §1-28, §73-90, §104-112. Livré en **1.88.0**.

## Principe

L'Accueil est composé de **widgets configurables** (même principe que les
widgets d'écran verrouillé Apple/Samsung) :

| Widget | Id | Tailles | Variantes |
|---|---|---|---|
| Favoris | `favorites` | `wide` | `cards` (couvertures) / `compact` (liste) |
| Vos statistiques | `statistics` | `medium` | `summary` (2 stats) / `minimal` (temps seul) |
| Activité des profils | `activity` | `medium` | `recent` (sessions lisibles) / `profiles` (répartition) |

Chaque widget a `{ id, enabled, order, variant, size }`, persisté dans le store
(`homeWidgets`). L'utilisateur choisit **activé/masqué + ordre + variante** ;
ZAILON réorganise la grille automatiquement — aucune case vide (§4).

## Règles d'exécution

- **Widget OFF = zéro coût** (§7) : aucun rendu, aucun calcul, aucun sondage —
  pas un simple `display:none`. Vérifié par `orderHomeWidgets` / `enabledWidgetIds`
  (testé dans `.github/scripts/test-home-widgets.ts`).
- **Disposition** (§85-87) : grille 6 colonnes — `wide` = ligne entière,
  `medium` = deux par ligne. Un widget qui ne rentre pas passe à la ligne
  suivante, jamais de chevauchement.
- **Normalisation** (§84) : un widget inconnu (add-on désinstallé) est ignoré ;
  les widgets manquants sont ré-ajoutés dans l'ordre de référence. Aucun layout
  cassé.
- **Presets** (§111-112) : Minimal (Favoris seul), Standard (Favoris + Stats),
  Complet (tout), Personnalisé. Toute modification manuelle bascule en
  « Personnalisé » ; « Réinitialiser l'Accueil » restaure les défauts sans
  toucher aux jeux/favoris (§110).

## UI

- Bouton `Personnaliser l'Accueil` (icône sliders) dans le header du Hero →
  micro-fenêtre : presets, toggles, flèches haut/bas (ordre), variantes,
  Réinitialiser.
- En mode personnalisation, les widgets reçoivent un contour discret (§80).
- Le mode Personnalisation est **opt-in** : hors de la micro-fenêtre, aucun
  contrôle supplémentaire sur les widgets.

## Changements de contenu

- **Favoris** : plus jamais « 0 actif(s) » — couverture, nom, temps de jeu,
  état « En cours » (§10-11). Clic = ouvre le jeu dans Bibliothèque (§12).
- **Vos statistiques** : données GLOBALES (tous jeux), pas de « 0/0 mods » ni
  pourcentage vide (§26-27). Footer « Voir toutes les statistiques » ouvre la
  page Statistiques (§28-29).
- **Activité des profils** : variante `recent` = sessions récentes lisibles
  (nom, durée, « il y a X ») au lieu d'une grille de points vide (§74).
  Variante `profiles` = répartition par profil conservée.

## Hero (correctifs associés)

- « Jeu favori » remplacé par une **étoile** — remplie si favori, outline sinon
  (§13).
- Choix rapide du profil (§16-19) : le **nom** ouvre la liste complète
  (ProfileSwitcherPopover), la **flèche** passe au profil suivant en boucle.
  Refus honnête pendant une session active (« Disponible après fermeture du
  jeu »).
- Bloc Hero descendu (`mt-[clamp(3.6rem,12vh,9rem)]`), relatif au Hero, jamais
  en position fixe (§14-15, §108).
- `Lancer sans mods` supprimé du menu contextuel Accueil (§20) ; il reste
  uniquement dans État & Diagnostic (Bibliothèque) si le backend le permet
  (§21).

## Notifications

`notificationCenterEnabled` (§22-24, §103) : OFF coupe le bouton, le badge et
le rendu du centre partout. Les erreurs critiques (corruption, sécurité, perte
de données, action obligatoire) restent en dialogue/toast.

## Tests

`test-home-widgets.ts` : ordre, OFF sans case vide, réordonnancement, presets,
normalisation (ids inconnus), grille responsive, états corrompus.
