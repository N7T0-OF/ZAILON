# Protocole de test — Remapping clavier NTE (Neverness to Everness)

Ce protocole est **obligatoire** avant de déclarer la disposition NTE fonctionnelle.
Il s'applique au futur `ScopedKeyRemapBackend` (Phase 2). Tant que ces tests n'ont pas été
exécutés sur la vraie version Steam, la disposition NTE est marquée « non vérifiée » dans l'UI.

## Contraintes absolues (Anti-Cheat Expert)

NTE utilise **Anti-Cheat Expert** (SteamDB). Tout backend pour ce jeu doit rester un
**remapping externe limité à la fenêtre du jeu** et ne doit JAMAIS :

- injecter une DLL ou écrire dans la mémoire du processus NTE ;
- modifier un fichier de NTE ;
- installer un driver ;
- ajouter ou modifier une langue Windows ;
- contourner ACE.

## Scénario (version Steam réelle, clavier physique AZERTY, preset QWERTY)

1. NTE fermé.
2. NTE démarré via Steam.
3. ZAILON détecte le processus NTE.
4. Mapping actif uniquement quand la fenêtre NTE est au premier plan.
5. Appui `Z` → déplacement avant (W).
6. Appui `Q` → déplacement gauche (A).
7. Touches `W` et `A` → inversées correctement (Z / Q).
8. Chiffres et touches de fonction : non remappées (preset « Déplacement uniquement »).
9. Chat : saisie texte fonctionne sans casse (mapping suspendu en zone de texte ou via hotkey).
10. `Alt+Tab` vers Discord → le clavier redevient immédiatement normal.
11. Retour sur NTE → mapping réactivé.
12. Fermeture de NTE → aucun mapping restant.
13. Bureau : aucun remapping actif hors du jeu.
14. Crash de NTE → aucun état bloqué, aucune touche virtuelle restée pressée.
15. Crash de ZAILON → le mapping est désactivé au redémarrage (aucune persistance).
16. Kill switch (Ctrl+Alt+Backspace) → tout remapping désactivé immédiatement, message affiché.
17. ACE actif pendant toute la session : aucune alerte, aucun bannissement.
18. Preuve d'absence d'injection : vérifier qu'aucun handle d'écriture mémoire n'est ouvert
    sur le processus NTE.
19. Aucun fichier NTE modifié (contrôle des dates/hashs avant/après).
20. Aucun driver ZAILON présent dans le système.

## Ce qui ne compte PAS comme validation

- Un test dans Notepad ou une app quelconque : NTE lit des touches physiques / scancodes
  pour certaines commandes ; seul le scénario ci-dessus, sur la vraie version Steam,
  valide la disposition.
- Un simple changement de layout logique Windows (HKL) sans vérifier que le jeu l'observe :
  la sonde `NTEInputCompatibilityProbe` doit confirmer l'effet réel avant de déclarer la méthode retenue.

## Compte-rendu attendu

Après exécution : remplir ce fichier avec la date, la version de ZAILON, la méthode retenue
(native / layout / remapping), les résultats des 20 étapes et les limitations restantes.
