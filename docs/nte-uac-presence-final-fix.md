# Correctif final NTE après UAC — suivi de présence (spec §1-18)

## Cause du blocage

Scénario réel : ZAILON lance NTE via Steam → `ntegloballauncher.exe` apparaît →
Windows demande l'élévation UAC → l'utilisateur clique Oui → le launcher élevé
prend la suite → le vrai jeu démarre sous
`Client\WindowsNoEditor\HT\Binaries\Win64\` → Steam affiche « En cours » →
**ZAILON restait sur « Autorisation requise… »**.

Deux causes combinées :

1. **Aucune récupération immédiate** : la preuve Steam (registre RunningAppID)
   était lue toutes les 3 s mais ne déclenchait pas de scan immédiat — la
   présence n'était rescannée que sur le tick périodique.
2. **Score insuffisant pour un processus élevé** : le processus final, lancé
   élevé, peut refuser de révéler son chemin → il perd le +40 « installation ».
   Avec seulement nom(+25) + contexte(+20) = 45, il restait sous le seuil
   d'auto-attachement (80) et ZAILON restait en attente.

## Ancienne machine d'états (incorrecte)

```
UAC détecté → WaitingForElevation → attendre une « confirmation utilisateur »
→ confirmation jamais reçue (un processus non élevé ne reçoit pas d'événement
fiable d'acceptation UAC) → bloqué
```

## Nouvelle transition (correcte)

```
Élévation suspectée → sous-état informatif → continuer à surveiller
→ dès qu'une preuve apparaît (processus final, fenêtre, Steam Running) :
   session automatiquement reconnue → En cours
```

ZAILON n'a **jamais** besoin de savoir si l'utilisateur a cliqué Oui ou Non : il
constate que la chaîne de lancement a continué. Aucun bouton, aucune
confirmation supplémentaire.

## Réconciliation Steam (§5, §16)

- `steamRunningState` (registre RunningAppID) lu toutes les 3 s.
- Dès qu'un AppID d'une session en attente passe « En cours » →
  `recoverWaitingSessions()` : scan immédiat (processus + fenêtres) de ces
  seules sessions, sans attendre le tick.
- `sessionWatchdog` prolonge déjà l'attente (+45 s) tant que Steam indique le
  jeu actif — l'expiration n'est jamais déclenchée pendant que Steam tourne.

## Scoring natif renforcé (§6, §8)

| Preuve | Points |
|---|---|
| Processus sous l'installation | +40 |
| **Emplacement profond connu** (NTE `Client\WindowsNoEditor\HT\Binaries\Win64`) | **+50** — le nom de l'EXE n'est plus obligatoire |
| Nom correspondant à un exécutable final connu | +25 |
| Contexte de rattachement (launcher vient de céder la main) | +20 |
| **Steam Running** (indépendant du chemin) | **+20** |
| Signature apprise (nom + chemin relatif) | +25 / +15 |
| Processus **hors** installation, chemin accessible | −50 |
| Processus élevé, chemin **inaccessible** | aucune conclusion négative |

Cas débloqués :
- chemin inaccessible + nom + contexte + Steam = **65 ≥ 60** (seuil Steam-backé) ;
- nom inconnu (mise à jour du jeu) + motif profond + Steam = **100 ≥ 80**.

## Seuil Steam-backé (frontend)

`STEAM_BACKED_ATTACH_THRESHOLD = 60` : quand l'AppID Steam du jeu est confirmé
« En cours », le rattachement devient plus permissif (nom + contexte + Steam
suffisent). Sinon le seuil reste 80.

## Interface (§12)

- Bouton : « Lancement… » puis « Recherche du jeu… » — fini
  « Autorisation requise… ».
- Bandeau informatif : « Élévation Windows en cours » — ZAILON continue de
  surveiller la chaîne ; aucune confirmation n'est nécessaire.
- `ntegloballauncher.exe` reste un stage valide : la session continue sans
  attendre qu'il reste vivant (il peut démarrer, s'élever, se fermer, être
  remplacé).

## Tests

Natif (`process_scanner.rs`) :
- `steam_backed_reattach_detects_final_process_without_accessible_path` :
  chemin vide + nom + contexte + Steam = 65 (détecté ≥ 50, rattaché côté
  frontend au seuil Steam-backé 60).
- `deep_path_pattern_detects_final_process_without_name_match` : nom inconnu +
  motif profond + Steam = 100 ≥ 80 (auto-attaché sans connaître le nom).
- `unrelated_process_never_reaches_detection` / `name_alone_never_matches` :
  hors installation → 0 après le −50.

Frontend (`test-game-presence.ts`) :
- la requête embarque `steamRunning` et le motif profond NTE ;
- `STEAM_BACKED_ATTACH_THRESHOLD = 60 < 80`.

## À valider sur machine réelle (non couvert par la CI)

Scénario complet spec §18 : ZAILON non admin → Steam ouvert → NTE fermé →
Jouer → launcher → UAC → Oui → nouveau stage → jeu → Steam Running →
ZAILON « En cours » → QWERTY/Visual Profile/timer/Quick Panel actifs. Et le cas
« UAC refusé » : Steam cesse la session, aucun processus final → ZAILON revient
à « Jouer » avec « Le lancement a été annulé ».
