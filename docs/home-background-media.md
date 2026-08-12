# Accueil multimédia — fonds vidéo locaux + YouTube sans clé

> ZAILON — spec « Accueil multimédia » (fond vidéo local + YouTube + audio discret).
> Livré en **1.64.0**.

## Types de fonds acceptés

| Type | Configuration | Lecture |
| --- | --- | --- |
| Image | Hero / Cover / artwork existant | Toujours, instantanée |
| Vidéo locale | `resources.videoPath` ou `backgroundMedia.localPath` | `<video>` natif, boucle |
| YouTube | Lien collé dans Configuration > Apparence | Lecteur intégré `youtube-nocookie.com` |
| Fallback généré | Aucune image ni vidéo | Artwork dégradé |

## YouTube — aucun téléchargement, aucune clé

- **Pas de Data API** : seul un lien fourni par l’utilisateur est nécessaire (spec §4).
- `parseYouTubeUrl` (src/lib/youtubeUrl.ts) valide le **domaine** (whitelist stricte :
  youtube.com, youtu.be, shorts, embed, live) et extrait l’**identifiant**.
- **Seul l’identifiant extrait entre dans l’URL du lecteur** — jamais l’URL brute
  utilisateur (spec §2, §71-72). Refus des domaines arbitraires (Vimeo, TikTok…).
- **La vidéo n’est jamais téléchargée, mise en cache ou extraite** (spec §3) : ZAILON
  stocke uniquement `videoId`, l’URL originale, `startSeconds`, et les préférences
  audio. Aucun fichier vidéo complet en cache.

## Autoplay silencieux (spec §5, §44)

- Le lecteur démarre **toujours muet** (politique d’autoplay des WebViews).
- Clic sur 🔇 → 🔊 : son activé à ~7 % (ambiance discrète, jamais 100 %).
- « Toujours démarrer muet » ON par défaut : chaque lancement recommence 🔇,
  indépendamment du dernier état de la session (le dé-mute n’est jamais persisté).
- Volume global persisté (survit au redémarrage) ; clic droit sur 🔊 → volume 0-20 %.

## Performances (spec §15-18, §63-66)

- **Lecture uniquement si l’Accueil est affiché** (HomeView monté conditionnellement).
- **Pause hors focus / minimisé** : blur ou `visibilitychange` → le lecteur est
  détruit (plus aucun décodage en arrière-plan). Aucun polling permanent.
- **Duck avant le lancement** : le clic sur Jouer met le fond en pause immédiatement,
  avant même la préparation — rien ne continue derrière le jeu.
- Reprise après jeu : muette, seulement quand ZAILON redevient au premier plan.
- **MediaPlaybackArbiter** : un seul lecteur de fond actif ; l’aperçu (Configuration)
  met le Hero en pause ; les lecteurs relâchent la main à la destruction.

## Sécurité (spec §71-73)

- Whitelist stricte de domaines ; l’URL d’iframe est construite uniquement depuis le
  `videoId` validé.
- Les messages de l’API YouTube sont vérifiés par origine (`event.source`), jamais une
  source arbitraire.
- Le contenu distant n’a **aucun privilège natif** ZAILON (iframe isolée, aucune
  commande Tauri exposée).

## Fallback (spec §30-32)

Ordre : Vidéo locale configurée → YouTube → Hero → Cover → Artwork généré.
YouTube indisponible / hors connexion → fallback image silencieux, jamais de spinner
ni d’écran noir bloquant.

## Configuration

- **Par jeu** : Bibliothèque > Jeu > Configuration > Apparence > Fond de l’Accueil
  (type + lien YouTube + aperçu muet).
- **Global** : Paramètres > Apparence > Fonds multimédia (fond vidéo, audio, toujours
  muet, pause hors premier plan, volume 7 %).

## Validation

- `tsc` ✅, build ✅, 22 tests dédiés (11 `youtubeUrl` + 11 `backgroundMedia`),
  suite complète ✅, Verify native + Verify ZAILON ✅.

## Correctifs 1.80.0 (spec correctifs §1-55)

Trois bugs corrigés, cause racine commune `BackgroundMediaController + audio + YouTube` :

1. **YouTube jamais rendu** — `videoReady` n'était jamais passé à `true` (seul le ref
   était rempli sur `onReady`) → `showVideo` restait faux. Corrigé : `onReady` →
   `videoReady = true` → iframe visible après fondu ; erreur (non embeddable /
   supprimée) → état `Error` + fallback image + badge « Vidéo indisponible ⚠ ».
2. **Alt+Tab perd le son** — la suspension était confondue avec l'intention
   utilisateur. Corrigé : perte de focus → suspension temporaire (jamais
   `userMuted`), retour → restauration de l'intention (muet si muet, volume sinon) ;
   `effectiveVolume = 0` pendant toute suspension. Séparé : suspension
   « non focalisé » vs « jeu en cours » (politique Performance).
3. **Barre de son qui reste ouverte** — état attaché à l'icône seule + timer 2,6 s.
   Corrigé : zone hover commune (icône + slider + capsule), repli **400 ms** après
   sortie de toute la zone, repli immédiat si la fenêtre perd le focus, capsule
   `absolute` flottante (Favoris immobile).

Machine à états (`src/lib/backgroundMedia.ts`, 9 tests) :
`Inactive / Loading / PlayingMuted / PlayingAudible / SuspendedUnfocused /
SuspendedGameRunning / Error` — plus aucune combinaison de booléens incohérente.

Pont player (`src/lib/backgroundMediaPlayer.ts`) : un seul player actif, le contrôle
du Hero pilote le player du layer via ce pont — jamais de player créé dans un render.

UI : `HeroAudioControl` refondu (icônes `VolumeX/Volume1/Volume2` selon le niveau) ;
bloc « Fond actuel : YouTube ✓ » + « Retirer la vidéo » dans Personnaliser l'Accueil.

## Correctifs 1.81.0 (spec §51-53)

- **Deadlock YouTube résiduel corrigé** : l'iframe n'était montée que si
  `videoReady === true`, or `videoReady` ne devenait `true` que via `onReady`
  de l'iframe montée — cercle mort, la vidéo n'était toujours jamais rendue.
  La source est désormais montée **avant** `onReady` ; la visibilité suit
  `videoReady` (fondu 300 ms). C'est la vraie fin du bug « lien reconnu mais
  jamais appliqué ».
- **Alt+Tab sans reload (§51)** : le player reste monté et reçoit
  `pauseVideo`/`playVideo` — reprise au même point, jamais de rechargement
  YouTube à chaque focus. Démontage uniquement sur dispose.
- **Politique de jeu (§53)** : `mediaDisposePolicy` — Équilibré/Qualité/Auto/
  Custom → pause ; Performance/Max → dispose (démontage, remonté à la fin du
  jeu, reprise approximative depuis `startSeconds`).
- **Longue inactivité (§52)** : > 3 minutes en arrière-plan → dispose du player
  YouTube ; recréation au retour.
- **Indicateur « son coupé pour cette session »** : point ambre sur l'icône
  volume quand l'intention persistée est non muette mais que la politique §44
  a redémarré muet.
