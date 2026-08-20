# Settings Density Audit

Audit développeur automatique des blocs de texte trop longs dans l'interface.
Généré avec : `npm run audit:ui` (script `.github/scripts/ui-density-audit.mjs`, seuil 160 caractères).

## Résumé (état au lot 1.11.0)

- **16 blocs** de texte dépassent 160 caractères.
- **7** à déplacer en bulle ⓘ (détail technique).
- **9** à raccourcir.

Règle appliquée depuis le lot « UI compacte » : un réglage simple = une ligne,
une explication secondaire = ⓘ, une fonctionnalité complexe = une vraie carte.
La préférence « Réduire les explications » (Paramètres > Préférences et lisibilité)
masque les descriptions secondaires et renvoie le détail dans les bulles.

## Détail

| Verdict | Fichier | Ligne | Longueur | Extrait |
|---|---|---|---|---|
| Shorten | `src/components/Views/GameKeyboardPanel.tsx` | 135 | 289 | Ordre de préférence : bindings natifs du jeu → layout reconnu par le jeu → remapping temporaire ZAILON limité … |
| MoveToTooltip | `src/components/Views/GamesView.tsx` | 910 | 254 | Les fichiers restent stockés hors du jeu. Au lancement, TemporaryCopy résout les conflits, sauvegarde les orig… |
| MoveToTooltip | `src/components/Views/GameKeyboardPanel.tsx` | 145 | 226 | : aucun hook, injection ou driver. La disposition ne peut passer que par un remapping externe limité à la fenê… |
| Shorten | `src/components/Views/GamesView.tsx` | 480 | 221 | « Créer vide » produit toujours 0 mod actif, sans ordre, réglage ni overwrite hérité. « Dupliquer » est la seu… |
| MoveToTooltip | `src/components/Views/GamesView.tsx` | 475 | 220 | Le store de paquets est partagé entre les profils. Un retrait simple conserve les fichiers ; « Supprimer défin… |
| MoveToTooltip | `src/components/Views/GameKeyboardPanel.tsx` | 250 | 206 | Appuyez sur une touche de cette fenêtre : ZAILON affiche la traduction prévue. Aperçu uniquement — l’intercept… |
| MoveToTooltip | `src/components/Views/SettingsView.tsx` | 185 | 205 | La clé complète n’est jamais renvoyée à l’interface, ni écrite dans les logs ou les exports. Elle reste dans l… |
| MoveToTooltip | `src/visual-profiles/ui/SafetyPanel.tsx` | 16 | 203 | Rust interdit les outils d’injection graphique comme ReShade. Visual Profiles n’utilise jamais cette méthode. … |
| Shorten | `src/components/Views/SettingsView.tsx` | 185 | 195 | si une clé Nexus personnelle a été collée dans un chat, un ticket ou un dépôt, révoquez-la immédiatement dans … |
| Shorten | `src/components/Views/ToolsView.tsx` | 21 | 187 | Steam, Epic Games et le Registre Windows utilisent déjà le même écran de diagnostic et de sélection. Les proch… |
| Shorten | `src/components/Views/GameDiagnosticPanel.tsx` | 222 | 185 | Pause des téléchargements et des scans pendant le jeu, priorité du processus, réduction de l’activité UI : pré… |
| Shorten | `src/components/Views/GameConfigurationPanel.tsx` | 226 | 182 | Profils de performance par jeu (Équilibré / Performance / Qualité), pause des téléchargements et scans pendant… |
| Shorten | `src/components/Views/SettingsView.tsx` | 158 | 177 | Aucun texte essentiel ne descend sous 14 px. Ce réglage change les variables typographiques centrales, pas un … |
| Shorten | `src/components/Views/SettingsView.tsx` | 164 | 176 | La couleur est appliquée en direct aux actions principales, sélections et anneaux de focus. Le texte de bouton… |
| MoveToTooltip | `src/visual-profiles/ui/VisualGamePanel.tsx` | 75 | 173 | Cette page n’installe rien dans Rust, n’ouvre pas EAC et n’accède pas à la mémoire du jeu. Les profils Rust re… |
| Shorten | `src/components/Views/GameKeyboardPanel.tsx` | 117 | 167 | Traduit les touches uniquement pour ce jeu (ex. AZERTY ↔ QWERTY). Aucune langue Windows n’est ajoutée ni modif… |

## Plan

- **MoveToTooltip** (7) : passer ces paragraphes dans des bulles `InfoBubble` (composant réutilisable
  `src/components/UI/InfoBubble.tsx`) — priorité aux blocs Techniques (GameKeyboardPanel méthode,
  note NTE/ACE, SafetyPanel Rust, VisualGamePanel EAC).
- **Shorten** (9) : raccourcir à une ou deux phrases sous 160 caractères, le détail restant
  disponible via ⓘ ou l'aide intégrée. Déjà partiellement traité : les descriptions des
  Paramètres (lignes 158, 164) sont désormais masquées quand « Réduire les explications » est actif.
- Rejouer `npm run audit:ui` à chaque lot pour mesurer la réduction.
