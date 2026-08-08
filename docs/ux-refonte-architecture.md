# ZAILON — Refonte d'architecture UX, fusion de sections et nouvelles fonctions système

> **Statut** : roadmap approuvée. Cette feuille de route est permanente et s'applique à
> toutes les sessions d'IA (voir `AGENTS.md`). Chaque étape implémentée doit mettre à
> jour `CHANGELOG.md` > `[Unreleased]` et respecter `docs/RELEASE_POLICY.md`.
>
> **Phases (x/6)** :
> - Phase 1 ✅ Fondations refonte UX (clavier par jeu, Configuration, santé+diagnostic, barre profil, Ctrl+K) — 1.10.0
> - Phase 2 ✅ UI compacte + remapping (Liquid Glass supprimé, toasts, rétention, État & Diagnostic, Bypass, bulles ⓘ, presets NTE) — 1.11.0
> - Phase 3 ✅ Performances (GameWorkspaceCache, badges, lazy loading Mods) — 1.13.0
> - Phase 4 ✅ Densité & suivi (explications, Stockage, session en jeu, notifications, audit UI, rapports) — 1.12.0
> - Phase 5 ✅ Expérience avancée (modes Simple/Avancé, recherche de réglages, presets de jeu, environnement de test) — 1.14.0
> - Phase 6 🔄 Backends d'application du remapping + lancement multi-étapes : fondation
>   TS livrée (registre des backends, plan par jeu, sonde ACE, UI Commandes +
>   diagnostic) ; système `GameSession` livré (la session survit au launcher, fenêtre
>   de rattachement, attachement manuel, « Préparer et attendre le jeu », Diagnostic >
>   Lancement) — spec complet dans `docs/multi-stage-launch-system.md` ; module Rust
>   `input_backends` posé et **validé** (PR #1, Windows + Linux, 5 tests) ;
>   `GamePresenceScanner` (`process_scanner`) posé et **validé** (PR #1, Windows +
>   Linux, 6 tests de scoring, énumération Windows via `windows-sys`) — livrés dans
>   les 1.16.0/1.17.0. La compilation Rust reste impossible sur la machine de dev
>   (linker MSVC absent) : validation via la PR #1 (`verify-native.yml`). Reste :
>   watcher de fenêtres, rattachement auto branché sur les événements natifs, puis
>   tests sur un vrai jeu (NTE Steam, protocole `docs/nte-keyboard-remap-test.md`).
> - Phase 6 🔄 GameSessionV2 + GamePresenceEngine (1.18.0) : SmartPlayButton (un seul
>   CTA, actions manuelles Attacher/Continuer/Terminer supprimées de l'UI standard,
>   modal Quitter), détection de présence indépendante du lancement (rattachement
>   auto d'un jeu lancé hors ZAILON, source `external`), preuve Steam native
>   (`steam_presence.rs`, registre RunningAppID, AppID NTE 4508340, watch dog à
>   attente prolongée). Docs : `game-session-v2.md`, `smart-play-button.md`,
>   `game-presence-engine.md`, `quick-game-panel.md`, `nte-steam-presence-fix.md`.
>   Reste : Quick Game Panel (fenêtre native), watcher de fenêtres, puis tests réels
>   NTE Steam (protocole `docs/nte-keyboard-remap-test.md`).
>
> **Progression** :
> - Phase 1 · Clavier par jeu — fondation implémentée (données, presets, éditeur,
>   onglet « Commandes »). Backends d'application (Phase 2) non encore implémentés.
> - Phase 1 · Fusion « Configuration » — implémentée : onglet Configuration unique
>   avec cartes pliables Lancement / Apparence / Commandes / Sauvegardes /
>   Compatibilité / Performances, résumé des valeurs effectives, état mémorisé.
> - Phase 1 · Centre de santé + Diagnostic fusionné — implémentés : barre « Santé »
>   en tête de jeu et onglet Diagnostic (Résumé / Mods / Frameworks / Déploiement /
>   Entrées / Performances / Logs) avec audit de déploiement réel intégré.
> - Phase 1 · Barre de profil + sélecteur rapide — implémentés : profil actif
>   toujours visible (badges Stable / mods / mises à jour) et popover de
>   changement / création / gestion de profils.
> - Phase 1 · Recherche globale Ctrl+K — implémentée (jeux, profils, mods, actions).
> - Phase 2 · Points de restauration + snapshots — implémentés (logiques) :
>   chronologie par jeu, restauration/comparaison/suppression, auto avant lancement.
>   Les snapshots physiques natifs restent à venir.
> - Phase 2 · Fusion Téléchargements/Activité — partiellement implémentée : centre
>   Tâches et Activité avec onglets par état ; timeline par jeu et historique
>   d’installation par profil restent à faire.
> - Lot « UI compacte + remapping » (voir `docs/ui-cleanup-and-input-remap.md`) :
>   Liquid Glass supprimé, toasts courts, nettoyage Téléchargements/Activité avec
>   rétention, fusion « État & Diagnostic » (Fichiers + Conflits intégrés), dossier
>   Bypass/Loader + chemins additionnels, bulles ⓘ, presets Déplacement/Complet,
>   hotkeys de suspension/kill switch, test de remapping, Accueil gradient + badges.
>   Suite : préférence « Réduire les explications », audit `npm run audit:ui`,
>   rapports `docs/ui-cleanup-and-input-remap-report.md`, `docs/history-retention-policy.md`,
>   `docs/settings-density-audit.md`, `docs/nte-keyboard-remap-test.md`.
> - Phase 5 · Expérience avancée — livrée (1.14.0) : préférence « Mode avancé »,
>   réglages techniques repliés dans « Avancé » (dossier Bypass/Loader, chemins
>   additionnels), recherche de réglages dans Paramètres (index global + navigation
>   vers le jeu), presets de jeu (profil + clavier + visuel,
>   appliquer/dupliquer/supprimer), environnement de test par jeu (audit en lecture
>   seule + intégrité + prérequis + historique 10 tests + effacer l’historique).
> - Phase 3 · GameWorkspaceCache — fondation implémentée (compteurs de profils +
>   santé par jeu en cache local, rafraîchi en arrière-plan, rendu instantané du
>   sélecteur de profils). Lazy loading des sections lourdes — livré ; modes
>   Simple/Avancé, presets, environnement de test — livrés en Phase 5 (1.14.0).
> - Backends clavier (bindings du jeu puis traduction runtime, incl. NTE/ACE) :
>   non implémentés, nécessitent des tests sur un vrai jeu avant publication.

## Objectif général

Simplifier ZAILON sans retirer de fonctions avancées.

La version actuelle commence à accumuler beaucoup de pages et de sous-menus :
Bibliothèque, Profils, Apparence, Sauvegardes, Paramètres du jeu, Visual Profiles,
Commandes, Déploiement, Diagnostics, etc.

La prochaine mise à jour doit :

- fusionner les sections qui font doublon ;
- réduire le nombre de clics ;
- rendre les réglages propres à chaque jeu beaucoup plus accessibles ;
- séparer clairement les réglages globaux de ZAILON des réglages propres au jeu ;
- améliorer les performances ;
- faciliter la compréhension pour un nouvel utilisateur ;
- conserver les outils avancés accessibles sans encombrer l'interface.

---

## 1. Nouvelle organisation générale

Navigation principale recommandée :

```
Accueil
Bibliothèque
Explorer
Téléchargements
Activité
```

Puis en bas :

```
Outils
Paramètres
```

Les profils ne doivent plus obligatoirement être une grosse page principale séparée.
Ils deviennent principalement une partie du jeu sélectionné. Exemple :

```
Bibliothèque
> Cyberpunk 2077
    > Vue d'ensemble
    > Mods
    > Profils
    > Configuration
    > Outils
    > Diagnostic
```

Cela réduit les allers-retours entre plusieurs sections.

## 2. Refonte de Bibliothèque

Lorsqu'on ouvre un jeu dans Bibliothèque, afficher une vraie page centrale :

```
[Couverture]

Cyberpunk 2077
Steam

Profil : Principal ▼
142 mods actifs · 12 mises à jour · État : Prêt

[Jouer]
```

Sous-navigation : Vue d'ensemble · Mods · Profils · Configuration · Outils ·
Diagnostic. La majorité des fonctions propres au jeu doivent vivre ici.

## 3. Fusion « Sauvegardes » et « Apparence »

Regrouper dans `Bibliothèque > Jeu > Configuration` des cartes :

- **Apparence** : couverture, bannière, logo, icône, recherche automatique,
  apparence automatique, Visual Profile, couleur d'accent spécifique au jeu.
- **Sauvegardes** : sauvegardes détectées, snapshots de profil, sauvegarde avant mise
  à jour, restauration, dossier de sauvegarde, sauvegarde automatique.
- **Commandes** : disposition clavier, touches, raccourcis, manette, profils d'entrée.
- **Lancement** : exécutable, arguments, backend mods, mode jeu, Discord Rich
  Presence, priorité processus.
- **Compatibilité** : frameworks, overlays, autre gestionnaire détecté, configuration
  particulière.

## 4. Nouveau système de touches par jeu

Ajouter une vraie gestion des touches propre au jeu (ex. passer AZERTY ↔ QWERTY) sans
ajouter de langue de clavier à Windows entier. **Ne jamais modifier définitivement les
langues Windows.**

## 5. Deux méthodes de remapping

1. **GameBindingBackend** (méthode prioritaire) : modifie les fichiers ou paramètres
   de commandes propres au jeu quand le jeu le permet (ex. Cyberpunk WASD → ZQSD).
   Idéale car elle ne change rien à Windows.
2. **RuntimeKeyTranslationBackend** (fallback) : traduit les touches uniquement
   pendant que la fenêtre du jeu ciblé est active (touche physique Z → envoyée W au
   jeu, Q → A, et inversement), uniquement pour le processus ciblé, au premier plan,
   quand le profil est actif.

## 6. Ne pas ajouter une langue Windows

Le système ne doit pas ajouter Anglais US / Français, ni modifier les langues du
compte, les paramètres régionaux, le clavier du bureau, de Discord ou de ZAILON.
Affichage : « Disposition virtuelle du jeu » — QWERTY · AZERTY · QWERTZ · Personnalisée.

## 7. Profils clavier

```
GameInputProfile {
  id, gameId, profileId?, name, mapping, enabled,
  activationMode, restoreOnExit
}
```

Presets : AZERTY → QWERTY, QWERTY → AZERTY, AZERTY natif, QWERTY natif, Personnalisé.

## 8. Éditeur visuel de touches

Interface ressemblant à un clavier : cliquer sur `Z` puis sélectionner `W`. Affichage
`Z → W`, `Q → A`, `W → Z`, `A → Q`. Boutons : Réinitialiser, Importer, Exporter,
Dupliquer. Éviter de demander de modifier du JSON à la main.

## 9. Profils de touches par profil de mods

Ex. Cyberpunk/Profil Principal → QWERTY ; Cyberpunk/Profil Photo → AZERTY ;
FiveM/Profil Roads → QWERTY. Association possible : jeu, installation, profil de mods.
Priorité : **Profil mods > Installation > Jeu > Défaut**.

## 10. Activation automatique

Au lancement : détecter le jeu → charger le profil → charger le mapping → appliquer les
bindings ou la traduction → lancer → surveiller la fenêtre → désactiver le mapping à la
perte de focus si nécessaire → restaurer à la fermeture. **Ne jamais conserver le
mapping actif sur le bureau.**

## 11. Mode apprentissage des touches

« Détecter automatiquement mes touches » : l'utilisateur appuie sur une touche, ZAILON
affiche Touche physique / Action du jeu attendue / Binding actuel / Suggestion
(`Z → W`). Ne pas enregistrer de touches hors de la fenêtre de configuration.

## 12. Détection automatique AZERTY/QWERTY

Analyser layout physique déclaré, bindings du jeu, langue du jeu, configuration
précédente puis proposer « Votre clavier semble être QWERTY mais Cyberpunk utilise des
commandes AZERTY. [Adapter automatiquement] [Ignorer] ». Ne jamais appliquer sans
confirmation lors de la première détection.

## 13. Fusion « Apparence + Visual Profiles »

Dans `Bibliothèque > Jeu > Configuration > Apparence` : Illustrations du jeu
(couverture, logo, bannière), Profil visuel (Aucun / Neutre / Cinématique / Couleurs
propres / personnalisé), bouton « Modifier le profil visuel ». Le moteur Visual
Profiles reste indépendant techniquement, l'expérience utilisateur est fusionnée.

## 14. Fusion « Sauvegardes + Snapshots »

Page « Protection et restauration » : Sauvegardes du jeu (sauvegardes, copies,
restauration), Snapshots ZAILON (profil, mods, versions, priorités, règles), Points de
restauration en chronologie (Aujourd'hui 14:22 « Avant mise à jour de redscript »,
Hier 21:04 « Profil stable », 05/08 « Avant import MO2 ») avec actions Restaurer /
Comparer / Supprimer.

## 15. Bouton « Créer un point de restauration »

Sauvegarde : profil, ordre, mods, versions, configurations, touches, apparence,
Visual Profile, fichiers générés nécessaires. Ne pas dupliquer inutilement les paquets
immuables.

## 16. Sauvegarde automatique intelligente

Avant : mise à jour de mod, mise à jour de framework, import massif, import MO2,
installation de Collection, changement de backend, réparation. Recommandé : tout activé.

## 17. Nouveau « Centre de santé »

Dans chaque jeu, en haut : Santé : Bonne · Frameworks 7/7 · 142 mods actifs · 0 erreur ·
2 avertissements · Dernier lancement réussi · bouton « Vérifier ».

## 18. Diagnostic fusionné

Fusionner dépendances, intégrité, runtime, déploiement, frameworks, profils cassés
dans `Bibliothèque > Jeu > Diagnostic` : Résumé, Mods, Frameworks, Déploiement,
Entrées, Performances, Logs.

## 19. Quick Actions

Menu « Actions rapides » depuis la page du jeu : Jouer, Lancer sans mods, Changer de
profil, Vérifier, Créer un snapshot, Importer des mods, Ouvrir le dossier du jeu,
Ouvrir le dossier du profil, Ouvrir Overwrite, Réparer. Raccourci **Ctrl + K** puis
recherche d'action.

## 20. Barre de profil toujours visible

Quand un jeu est ouvert, garder en haut « Profil actif : Principal ▼ » avec ● Stable,
142 mods, 3 mises à jour, bouton « Changer ».

## 21. Sélecteur de profil rapide

Popover sur le profil : liste des profils (nom, nombre de mods, badge), actions
+ Nouveau profil, Comparer, Gérer.

## 22. Favoris dans Bibliothèque

Marquer les jeux favoris, affichés en premier. Filtres Favoris / Récents / Tous. Pas de
section séparée inutile.

## 23. Jeu épinglé

« Épingler dans Accueil » : l'Accueil montre 3-6 jeux favoris, dernière session, profil
actif, Jouer, mises à jour.

## 24. Bibliothèque plus compacte

Carte : [Cover], nom, profil actif, nb de mods, ● Prêt. Au survol : Jouer / Profils /
Options. Le reste dans la page détaillée.

## 25. Recherche globale

Une recherche unique « Jeux, mods, profils… » : dans Bibliothèque → jeux ; dans un jeu →
mods et profils ; avec Ctrl + K → recherche globale.

## 26. Menu « Outils du jeu »

Fusionner les outils spécifiques dans `Bibliothèque > Jeu > Outils`. Ex. Cyberpunk :
WolvenKit, REDmod, CET, ArchiveXL tools, script compiler, dossier logs. FiveM : cache,
plugins, ReShade (si autorisé), Application Data, ressources locales.

## 27. Détection automatique des outils

Scanner uniquement dossiers connus, outils explicitement ajoutés, installations liées
au jeu. Afficher « Outils détectés » + « Ajouter manuellement ». Ne jamais lancer un
exécutable inconnu automatiquement.

## 28. Barre d'état utile

En bas : `Cyberpunk 2077 · Principal · 142 mods · Déploiement actif`, puis à droite
`2 tâches · Nexus connecté · Mode jeu`. Pas de données techniques inutiles.

## 29. Réduction des pages Paramètres globales

Application (langue, démarrage, mises à jour, comportement), Apparence ZAILON (thème,
Liquid Glass, accent, densité, taille texte), Téléchargements (dossiers, concurrence,
cache), Intégrations (Nexus, GameBanana, Discord, GitHub), Performances (économie,
threads, cache, mode jeu), Confidentialité (télémétrie, diagnostics), À propos (version,
changelog, Support Me). Tout ce qui appartient à un jeu sort des Paramètres globaux.

## 30. Migrations automatiques

Ex. `settings.visualProfiles.cyberpunk` → `games.cyberpunk.configuration.visualProfile` ;
`settings.gameKeyboard.cyberpunk` → `games.cyberpunk.configuration.input`. Ne pas perdre
les anciennes configurations.

## 31. Réglages hérités

Afficher « Valeur effective » et « Source » (Profil Principal / Paramètres globaux).

## 32. Héritage configurable

Pour chaque configuration : « Utiliser le réglage global » ou « Personnaliser pour ce
jeu » (couleur d'accent, Visual Profile, clavier, etc.).

## 33. Actions réversibles

Pour déplacement/transfert/suppression de mods, changement de profil, modifications de
touches et de configuration : « Modification appliquée [Annuler] ». L'undo n'apparaît
que si un vrai rollback existe.

## 34. Recherche de paramètres

Dans Paramètres : « Rechercher un réglage » avec liens directs vers le réglage même s'il
vit dans la page du jeu (ex. « clavier » → Cyberpunk > Configuration > Commandes >
Disposition).

## 35. Suggestions contextuelles

Petites suggestions non agressives : « Vous utilisez QWERTY dans Windows mais Cyberpunk
semble configuré en AZERTY. [Adapter] », « Ce profil n'a aucun point de restauration
depuis 17 jours. [Créer] », « 7 mods utilisent RED4ext 1.22 mais une nouvelle version
est installée. [Vérifier] ».

## 36. Profil « automatique »

Profil spécial facultatif « Auto » appliquant profil de mods, clavier, Visual Profile,
paramètres et arguments selon le jeu choisi. Ne jamais modifier la configuration sans
montrer ce qu'il applique.

## 37. Presets complets de jeu

`GamePreset` (ex. Cyberpunk — Cinématique / Performance) : référence profil mods,
Visual Profile, clavier, arguments, affichage, sauvegarde, outils optionnels. Un preset
ne duplique pas forcément les mods : il référence des profils et réglages.

## 38. Bouton « Dupliquer cette configuration »

Crée nouveau profil, mêmes mods, réglages, touches, visuels, nouvel Overwrite, nouveau
snapshot — modifiable indépendamment ensuite.

## 39. Mode invité / test

« Créer un environnement de test » : essayer un mod, une Collection, un framework, un
mapping de touches. Environnement temporaire ; en fin de session : Conserver /
Supprimer / Fusionner dans un profil.

## 40. Nettoyage automatique des tests

Profils temporaires non conservés supprimés après 1 jour / 7 jours / Jamais, après
confirmation initiale.

## 41. Profils de performance par jeu

Configuration > Performances : Équilibré / Performance / Qualité / Personnalisé.
Contrôle autour du jeu : pause téléchargements, pause scans, priorité CPU ZAILON,
activité UI, animations, fréquence des diagnostics. Ne pas modifier les graphismes du
jeu sans adaptateur explicite.

## 42. Optimisation automatique pendant le jeu

Quand le jeu est au premier plan : suspendre galeries, pause providers, limiter les
animations, suspendre la recherche distante et l'indexation lourde, réduire Liquid
Glass, vider certaines images en mémoire, garder uniquement lancement/restauration. Au
retour : reprise progressive.

## 43. Chargement intelligent des sections

Mods, Profils, Outils, Diagnostic chargés seulement quand ouverts (lazy loading). La
page principale ne charge pas 500 mods + galeries + Nexus + historique + snapshots +
logs simultanément.

## 44. Cache par jeu

`GameWorkspaceCache` : dernier profil, résumé santé, compteur mods, couverture, dernier
lancement, états rapides → ouverture de Bibliothèque immédiate.

## 45. Navigation ultra rapide

Changement de jeu : ne pas reconstruire tout ZAILON ; charger le shell, afficher le
cache, actualiser ensuite. Stores indépendants conservés.

## 46. Fusion des notifications et téléchargements

Téléchargements = centre des tâches réseau et imports. Activité = historique, erreurs,
installations, changements, snapshots. Ne pas avoir Téléchargements / Tâches /
Historique / Notifications comme quatre pages différentes.

## 47. Téléchargements

Onglets En cours / En attente / Terminés / Erreurs. Types : Nexus, GameBanana,
Collections, imports, images, mises à jour.

## 48. Activité

Onglets Tout / Jeu / Mods / Profils / Système. Contenu : mod installé, mod supprimé,
snapshot, conflit, mise à jour, erreur, réparation.

## 49. Timeline par jeu

Dans la page principale, « Activité récente » (max 5 éléments, horodatés) + lien « Voir
toute l'activité ».

## 50. Accueil léger

Continuer (jeu, profil, mods, Jouer), Récents, Activité récente. Pas une copie de la
Bibliothèque.

## 51. Onboarding des fonctions avancées

Mini tutoriel de 2-3 phrases à la découverte de Profils, Snapshots, VFS, Collections
([Compris] [En savoir plus]). Ne pas afficher à chaque fois.

## 52. Explorer

Conserver Nexus, GameBanana, Collections, recherche, grille/liste, pagination, galerie.
Ajouter « Installer dans… » qui demande Jeu + Profil au lieu d'installer dans le profil
actif.

## 53. Historique des installations par profil

Dans Profils : « Better Vehicle Handling — Ajouté le 08/08 », « ArchiveXL — Mis à jour
le 07/08 »…

## 54. Import de dossier intelligent

Scanner → détecter les mods → afficher immédiatement les premiers résultats → continuer
en arrière-plan → navigation possible → progression discrète → proposer les racines →
installer ensuite.

## 55. Regroupement automatique

Après import massif (ex. 250 mods) : « Organiser automatiquement » par type, framework,
catégorie, fournisseur, dépendance. Prévisualiser avant application.

## 56. Détection de profil vide réelle

« Profil vide » = 0 mod, 0 framework profil, Overwrite vide, aucune règle héritée,
aucune configuration mod héritée. Les réglages généraux du jeu peuvent être hérités
séparément.

## 57. Clonage efficace

Dupliquer un profil sans dupliquer physiquement les fichiers : références, store
content-addressed, copy-on-write. Afficher « Taille logique : 32 Go · Espace réellement
ajouté : 84 Mo ».

## 58. Estimation d'espace avant action

Avant import/clone/Collection/snapshot complet : espace requis, disponible, temporaire,
réellement ajouté.

## 59. Suggestions d'optimisation

Paramètres > Stockage : supprimer caches expirés, miniatures inutilisées, versions non
référencées, imports temporaires ; compacter la base. Toujours montrer ce qui sera
supprimé.

## 60. Indicateur de backend

Dans la page du jeu : Déploiement — USVFS / Liens / Copie temporaire avec statut Actif /
Prêt / Erreur. Cliquer ouvre les détails.

## 61. Mode compatibilité automatique

Si un backend échoue (ex. « USVFS impossible ») : proposer « Essayer le backend Liens ».
Ne jamais changer automatiquement un profil stable.

## 62. Détection des réglages cassés

`ConfigurationIntegrityCheck` : clavier, Visual Profile, chemins, exécutable,
sauvegardes, backend, profils, ressources. Afficher « 2 réglages à corriger ».

## 63. Assistant de réparation par section

Dans Configuration : Réparer Commandes / Apparence / Sauvegardes / Lancement (pas
seulement un gros bouton global).

## 64. Sections pliables

Cartes pliables dans Configuration (Apparence, Commandes, Sauvegardes, Lancement,
Compatibilité, Performances) ; une ou deux ouvertes par défaut ; mémoriser l'état.

## 65. Résumé de configuration

En haut de Configuration : Clavier : QWERTY · Visual Profile : Cinématique · Sauvegardes :
Auto · Backend : USVFS · Mode jeu : Activé.

## 66. Critères d'acceptation

Terminé uniquement si :
- les réglages propres au jeu sont retirés des paramètres globaux ;
- Sauvegardes et Apparence sont regroupés dans Configuration ;
- Visual Profiles est accessible depuis le jeu ;
- le clavier est configurable par jeu ;
- AZERTY/QWERTY n'ajoute aucune langue Windows ;
- le bureau retrouve ses touches normales ;
- les profils peuvent avoir leurs propres mappings ;
- moins de pages redondantes ;
- Téléchargements et Activité remplacent les anciens centres dispersés ;
- le jeu et le profil actifs restent visibles ;
- les fonctions avancées restent accessibles ;
- les migrations conservent les réglages existants ;
- navigation fluide avec de grandes bibliothèques.

## 67. Priorités

- **Phase 1** : refonte Bibliothèque ; fusion Configuration ; clavier par jeu ;
  migration réglages.
- **Phase 2** : fusion Téléchargements/Tâches ; Activité ; snapshots ; points de
  restauration.
- **Phase 3** : optimisations cache/lazy loading ; modes Simple/Avancé ; recherche de
  paramètres.
- **Phase 4** : presets complets de jeu ; environnement de test ; outils avancés.

Ne pas commencer par les éléments décoratifs.

---

## Conception retenue : clavier AZERTY ↔ QWERTY

Deux approches complémentaires, sans installer de langue Windows :

1. **GameBindingBackend** — modifier les bindings propres au jeu quand c'est possible
   (ex. fichiers de commandes du jeu). Ne change rien à Windows.
2. **RuntimeKeyTranslationBackend** — fallback : traduction temporaire des touches
   limitée à la fenêtre du jeu ciblée (processus ciblé + premier plan + profil actif),
   jamais active sur le bureau, restaurée à la fermeture.

### État de l'implémentation

- **Implémenté (Phase 1, fondation)** : modèle `GameInputProfile`, dispositions
  QWERTY/AZERTY/QWERTZ/Personnalisée, presets AZERTY↔QWERTY, association par profil de
  mods (priorité profil mods > jeu > défaut), éditeur visuel de traductions, import /
  export / duplication, onglet « Commandes » par jeu. Aucune langue Windows n'est
  ajoutée ni modifiée.
- **À venir (Phase 2)** : application au lancement (GameBindingBackend par jeu supporté,
  puis RuntimeKeyTranslationBackend avec hook de clavier Windows limité à la fenêtre du
  jeu), mode apprentissage, détection automatique AZERTY/QWERTY, restaurations à la
  fermeture.
