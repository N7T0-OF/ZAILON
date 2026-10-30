# Simplification du bouton Jouer (Smart Play Cleanup)

> Spec : « Correctif urgent lancement NTE + simplification totale du bouton Jouer ».
> Livré dans la **1.21.1**.

## Objectif

Un seul bouton. ZAILON gère toute la chaîne en arrière-plan (Steam, launcher,
UAC, processus final) sans décision utilisateur.

## Bouton secondaire supprimé

L'ancien menu déroulant `[▼]` à côté de Jouer proposait :

- **Préparer et attendre le jeu** — supprimé de l'UI standard (reste dans
  **Diagnostic > Lancement** pour le dépannage avancé) ;
- **Lancer sans mods** — supprimé de l'UI standard (reste accessible via le
  menu contextuel / diagnostic, désactivé tant que le moteur ne peut pas
  restaurer sans risque) ;
- **Jouer** (dupliqué) — supprimé, le bouton principal fait déjà ça.

## États du bouton unique

| État | Affichage |
|---|---|
| Jeu fermé | `[Jouer]` |
| Préparation des mods | `[Préparation…]` (+ % et barre) |
| Launcher / Steam ouvert | `[Lancement…]` |
| En attente du processus final | `[Recherche du jeu…]` |
| Jeu détecté | `[● En cours]` (pastille verte, clic → confirmation de sortie) |
| Échec (toutes preuves épuisées) | `[Réessayer]` |

Aucun changement brutal de largeur : le texte change dans un emplacement fixe.

## Messages simplifiés

- Pendant la recherche : « Le launcher a pris le relais (Steam / launcher
  officiel). Le déploiement et le remapping restent prêts. » — pas de diagnostic
  technique.
- Après épuisement des preuves : « Le jeu n'a pas démarré. ZAILON a suivi
  automatiquement Steam, le launcher et l'élévation… [Réessayer] » — jamais
  « Attacher » / « Continuer à attendre » / « Terminer la session ».
- Le détail technique (Steam actif, launcher détecté, scores) vit dans
  **Diagnostic > Lancement** et **Configuration > Lancement**, pas sur la page
  principale.

## Règles préservées

- Cliquer sur « En cours » n'ouvre jamais une seconde instance : confirmation de
  sortie → fermeture normale → forcer seulement si le jeu ne répond pas.
- Les mods pré-lancement restent déployés pendant toutes les transitions de
  launcher (le déploiement n'est démonté qu'à `GameSessionEnded`).
- La détection externe (jeu lancé depuis Steam hors ZAILON) reste automatique,
  sans bouton.

## Reste

Le Quick Game Panel cible déjà la session prioritaire ; l'arbitrage multi-apps
(X de session, priorité, plusieurs apps actives) est un lot séparé
(`docs/multi-session-priority.md` à venir).
