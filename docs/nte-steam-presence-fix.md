# Correctif de présence NTE / Steam — état et tests restants

## Ce qui est livré (release 1.18.0)

- **SmartPlayButton** : un seul CTA (Jouer → Préparation… → Lancement… →
  Recherche du jeu… → En cours → Réessayer) ; les trois actions manuelles
  (Attacher / Continuer à attendre / Terminer la session) sont supprimées de
  l'UI standard ; cliquer sur « En cours » ouvre la confirmation de sortie
  (Retour au jeu / Quitter le jeu), jamais une seconde instance.
- **GamePresenceEngine** : détection indépendante du lancement — un NTE lancé
  depuis Steam (ou relancé par son launcher) est rattaché automatiquement,
  avec preuve Steam + matching par installation/processus (score ≥ 80).
- **Provider Steam natif** (`steam_presence.rs`) : lecture du registre
  `HKCU\Software\Valve\Steam\RunningAppID` et des drapeaux `Apps\<appid>\Running`
  — AppID NTE **4508340**. Si Steam dit que le jeu tourne alors que ZAILON a
  perdu le processus, ZAILON cherche le processus final au lieu de terminer
  (watchdog avec attente prolongée).
- **Session V2** : `source: 'external'`, `deploymentActive: false` honnête
  (mods pré-lancement non appliqués pour un jeu lancé hors ZAILON), fonctions
  runtime attachables activées après détection.

## Chaîne de lancement attendue (à confirmer sur la machine réelle)

```text
ZAILON → Steam (AppID 4508340) → NTELauncher.exe → UAC (élévation) →
launcher élevé → Client\WindowsNoEditor\HT\Binaries\Win64\<jeu final>
```

L'adaptateur NTE (`launchAdapters.ts`) définit les candidats
`HT-Win64-Shipping.exe` / `NTE-Win64-Shipping.exe` / `NevernessToEverness.exe`
et les zones de chemin de l'installation (NTEGlobal, Client\WindowsNoEditor\HT\
Binaries\Win64). Ces signatures doivent être **confirmées par observation** sur
la vraie installation (jamais devinées).

## Tests réels restants (bloquants pour déclarer « corrigé »)

1. Lancer NTE depuis ZAILON → Steam affiche « En cours » → launcher officiel →
   UAC acceptée → ancien processus fermé → **ZAILON détecte le processus final
   et affiche « En cours »** (aucun bouton Attacher/Continuer/Terminer) ;
2. QWERTY et Visual Profile s'activent après rattachement, se désactivent à
   l'Alt+Tab, se réactivent au retour ;
3. mods pré-lancement toujours présents après les transitions de launcher ;
4. compteur de session continu (lancement → fermeture réelle) ;
5. lancement manuel depuis Steam alors que ZAILON est ouvert → rattachement
   automatique + « Mods runtime préparés : non » affiché honnêtement ;
6. redémarrage de ZAILON pendant NTE → session récupérée automatiquement ;
7. fermeture réelle du jeu → bouton redevient « Jouer », déploiement nettoyé ;
8. aucun contournement UAC, aucune injection, aucun contournement ACE.

## Enregistrement de la chaîne réelle

Au premier lancement de test, journaliser (Diagnostic > Lancement > timeline) :
nom processus, chemin, parent, heure, fenêtre, élévation, relation temporelle —
puis mettre à jour `docs/nte-real-process-chain.md` avec la chaîne observée et
remplacer les candidats par défaut par les signatures apprises.
