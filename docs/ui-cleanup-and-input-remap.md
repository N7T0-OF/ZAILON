# ZAILON — Nettoyage automatique, UI compacte, remapping par jeu réellement fonctionnel

> **Progression** :
> - Lot en cours (1.11.0) : Liquid Glass supprimé, toasts courts + rétention, nettoyage Téléchargements,
>   fusion État & Diagnostic, dossier Bypass/Loader + chemins additionnels, bulles ⓘ, fondation
>   backends clavier (méthode, presets Déplacement/Complet, note NTE/ACE, hotkeys, test), Accueil
>   gradient + badges. Backends d'application (interception réelle limitée à la fenêtre) : Phase 2,
>   nécessitent des tests sur un vrai jeu — non implémentés tant que non vérifiés.

Ce document est la référence permanente du nettoyage d'interface et du remapping par jeu.
Il s'applique à toutes les sessions (Codex, DeepSeek, Claude, etc.) conformément à `AGENTS.md`.

## PRIORITÉS

1. Corriger définitivement la disposition virtuelle AZERTY/QWERTY par jeu.
2. Ajouter un backend spécifique aux jeux qui lisent les touches physiques.
3. Simplifier les notifications, Téléchargements et Activité.
4. Supprimer totalement Liquid Glass.
5. Fusionner Vue ZAILON et Diagnostic.
6. Transformer les longs textes explicatifs en bulles d'aide.
7. Simplifier Configuration > Illustrations.
8. Ajouter le dossier Bypass dans la configuration de chaque jeu.
9. Améliorer visuellement Accueil.
10. Réduire globalement le nombre de blocs, textes et pages inutiles.

## Notifications (toasts) très courtes

- Succès simple : 1,5 à 2 s — Information : 2 s — Avertissement : 4 à 6 s — Erreur : 6 à 10 s.
- Action nécessaire : reste visible dans Activité.
- Si la souris est sur le toast : suspendre le minuteur.
- Séparer **Toast** (temporaire) et **ActivityEvent** (historique) : un petit toast
  (« 109 mods analysés ») n'est pas forcément un événement permanent ; un échec de déploiement,
  une suppression, une migration le sont.

## Nettoyage automatique

- **Téléchargements** : les tâches En cours / En attente ne sont jamais supprimées.
  Terminés : nettoyés selon le réglage — À chaque démarrage (défaut) / Après 1 jour / Après 7 jours / Jamais.
  Ne supprime que les métadonnées temporaires, jamais les fichiers encore utilisés.
- **Activité** : journal léger, 100/250/500/1000 événements max (défaut 250). Toujours préserver :
  rollbacks disponibles, snapshots, erreurs non résolues, migrations, opérations interrompues, événements épinglés.
- **Au lancement** (`BackgroundCleanupService`) : nettoyer en arrière-plan anciennes tâches terminées,
  toasts persistés par erreur, miniatures expirées, galeries LRU, temporaires, logs anciens, caches.
  Ne pas bloquer le démarrage. N'afficher un message que s'il y a un problème.
- **Boutons** : « Tout supprimer » (Terminés + Erreurs, jamais une tâche active) dans Téléchargements
  et Activité ; « Nettoyer » intelligent (affiche l'espace récupérable) lorsque les tailles réelles existent.
- Ne jamais supprimer un fichier dont une Collection hors ligne, un rollback ou un profil dépend.

## Remapping clavier par jeu — architecture à backends

Le réglage « disposition virtuelle » seul ne suffit pas pour les jeux qui lisent les touches
physiques (scancodes, Raw Input, bindings internes) — cas documenté de **Neverness to Everness (NTE)**.

### Backends (`GameInputBackend`), ordre de préférence

1. `NativeGameBindingBackend` — modifier les bindings propres au jeu quand il le permet.
2. `WindowKeyboardLayoutBackend` — changement de layout logique reconnu par le jeu.
3. `ScopedKeyRemapBackend` — remapping temporaire externe, **uniquement** quand la fenêtre du jeu
   ciblé est au premier plan. Aucune DLL, aucun fichier du jeu modifié, aucune écriture mémoire,
   aucun driver, aucune langue Windows ajoutée.
4. `SteamInputBackend` — uniquement si réellement compatible ; ne jamais toucher à une config manette existante.
5. `UnsupportedInputBackend` — aucune méthode.

### NTE (Neverness to Everness)

- NTE utilise **Anti-Cheat Expert** (SteamDB) : tout backend nécessitant injection, driver ou
  manipulation du processus est **désactivé** pour ce jeu. Remapping externe limité à la fenêtre uniquement.
- `NTEInputCompatibilityProbe` : détecter processus + fenêtre + layout, appliquer temporairement QWERTY,
  vérifier si le jeu observe le changement, sinon basculer sur `ScopedKeyRemapBackend`, restaurer après le test.
- Ne jamais déclarer la disposition NTE fonctionnelle avec un simple test dans Notepad : tester sur la
  vraie version Steam (Alt+Tab, Discord, chat, chiffres, crash, kill switch, ACE actif, absence d'injection).

### Mappings

- Preset « **Déplacement uniquement** » (recommandé pour les jeux) : Z→W, Q→A, W→Z, A→Q.
- Preset « **Clavier complet** » : mapping complet AZERTY/QWERTY (M, ponctuation, chiffres, symboles
  uniquement si l'utilisateur le choisit).
- **Mode texte** : si un champ texte du jeu est actif (ou via hotkey de suspension configurable,
  ex. Ctrl+Alt+K), suspendre le mapping pour ne pas casser chat / noms / mots de passe.

### Règles d'activation

- Mapping actif **uniquement** si `foregroundProcess == configuredGameProcess`.
- Kill switch configurable (défaut Ctrl+Alt+Backspace) : désactive immédiatement tout remapping.
- À chaque perte de focus / Alt+Tab / changement de profil / désactivation / fermeture / crash :
  réinitialiser les états internes — aucune touche virtuelle ne doit rester pressée
  (corrige aussi les anciens problèmes Cyberpunk de touches bloquées).
- État visible dans Configuration > Commandes : clavier physique, disposition souhaitée, méthode,
  état (actif uniquement dans le jeu), mappings, boutons Modifier / Test / Désactiver.

## UI compacte

- **Règle générale** : un réglage simple = une ligne ; une explication secondaire = ⓘ ;
  une fonctionnalité complexe = une vraie carte.
- **Bulles ⓘ** : cercle 14-18 px, faible contraste, ouverture au survol 150-300 ms, fermeture 100-200 ms
  (Échap, clic extérieur, sortie souris), accessible (focus clavier, Entrée/Espace, lecteur d'écran).
  Max 5-7 lignes, « En savoir plus » vers l'aide intégrée. Bulles possibles : état actuel, limitation, lien.
- **Liquid Glass** : totalement supprimé (réglage, backend, presets, aperçu, diagnostics, variables,
  textes, dépendances dédiées). Thème sombre propre + éventuelle transparence interne ; ne plus
  afficher « Liquid Glass » comme fonctionnalité.
- **Illustrations automatiques** : un seul contrôle compact « Images Steam [ON] ⓘ » ; masquer les
  sources non configurées (SteamGridDB absent = pas de gros bloc).
- **Fusion Vue ZAILON + Diagnostic** → « État & Diagnostic » : sous-sections Résumé / Fichiers /
  Frameworks / Conflits / Entrées / Logs. « Fichiers » = l'ancienne Vue ZAILON (ce que le jeu voit).
- **Sections globales** : viser Bibliothèque > Jeu = Aperçu / Mods / Profils / Configuration /
  État & Diagnostic / Outils (+ Téléchargements, Visuels si nécessaires). Configuration en cartes
  pliables : Général / Apparence / Commandes / Sauvegardes / Lancement / Compatibilité.
- **Dossier Bypass/Loader** (Configuration > Général) + « Chemins additionnels » (nom, chemin, type :
  Loader / Bypass / Plugins / Scripts / Custom) — évite de recoder ZAILON pour chaque structure.
- **Accueil** : réduire le gradient (gauche transparent → ~0.55, bas → ~0.45), l'illustration reste
  visible ; badges contextuels discrets sous le profil (« QWERTY ✓ », « Visuel ✓ ») affichés
  uniquement s'ils sont réellement actifs, max 2-3.
- **Réglages** : « Réduire les explications » (défaut activé après onboarding) → bulles ⓘ ;
  section « Avancé » repliée par défaut ; actions dangereuses regroupées en bas (zone Danger/Maintenance).
- **Audit** : `SettingsDensityAudit` détecte blocs > 160 caractères, descriptions > 2 lignes,
  duplications → produit `docs/settings-density-audit.md` (Keep / Shorten / MoveToTooltip / MoveToHelp / Remove).

## Critères d'acceptation (extraits)

- Toasts simples < ~2 s ; tâches anciennes nettoyées ; Tout supprimer présent ; aucun mod effacé par le nettoyage.
- NTE Steam fonctionne réellement en QWERTY avec un clavier AZERTY ; mapping limité à NTE ;
  Alt+Tab restaure immédiatement le clavier normal ; aucune langue Windows ajoutée ;
  aucun driver ni injection pour NTE ; ACE respecté.
- Liquid Glass totalement supprimé ; Vue ZAILON + Diagnostic fusionnés ; textes techniques → bulles ;
  dossier Bypass/Loader configurable ; chemins additionnels ajoutables ;
  gradient Accueil laisse mieux voir la couverture ; badges uniquement quand actifs ;
  moins de grandes cartes ; avancé accessible.

## Rapports attendus (après implémentation)

- `docs/ui-cleanup-and-input-remap-report.md`
- `docs/nte-keyboard-remap-test.md`
- `docs/history-retention-policy.md`
- `docs/settings-density-audit.md`

Ne jamais écrire seulement « UI optimisée ».
