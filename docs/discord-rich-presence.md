# Discord Rich Presence — ZAILON (release 1.56.0)

Spécification : bloc « Discord Rich Presence complète » — Application ID
`1509971526987022497`.

## Principe

La présence Discord de ZAILON est une **preuve de session**, pas un effet de
lancement : elle n'est publiée que quand une session atteint le vrai
`GameRunning` (jamais au launcher, à l'UAC ou au bootstrap — spec §9, critère
bloquant §63).

**Source de vérité** : `GameSessionRegistry` + `prioritySessionId`
(`pickPrioritySession` : pin > premier plan > plus récente). Une seule activité
ZAILON à la fois (spec §2).

## Application ID

- Centralisé dans `src/lib/discordPresence.ts` : `DISCORD_APPLICATION_ID`.
- Prérempli dans Paramètres > Discord ; l'utilisateur normal n'a rien à saisir.
- **Public Key** (`e0dce045…`) : non utilisée — ce n'est pas un secret et rien
  ne l'exige pour une présence locale.
- Aucun OAuth, bot, join/party — spec §6, §27.

## Construction de la présence

`buildDiscordActivity` (`src/lib/discordPresence.ts`, logique pure) :

- `details` = nom du jeu / de l'application.
- `state` = variantes (spec §25) :
  - jeu + mods : `Profil X · N mod(s) actif(s)` ;
  - jeu sans mods : `Profil X` ;
  - app non-jeu (itemKind `software`) : `Session créative` ;
  - mode minimal (Paramètres) : `Via ZAILON`.
- **Anti-« 0 mods »** (spec §23, §60) : si `referencedModCount > 0` mais
  `enabledModCount == 0` (incohérence en attente de recovery), le compteur est
  omis — jamais de faux « 0 mod(s) actif(s) ».
- Assets : clé spécifique → fallback `zailon` (spec §50). `smallImage = zailon`,
  `smallImageText = Via ZAILON`.
- L'horodatage est posé par le natif au moment de l'appel — et l'appel n'a lieu
  qu'au vrai `GameRunning` (spec §12 : le timer NTE commence au vrai jeu, pas au
  clic Jouer).

Le state pré-construit est transmis au natif via `stateOverride`
(`DiscordPresenceConfig` Rust) — le template natif n'est qu'un repli.

## Anti-flap Alt+Tab (spec §15)

`shouldDelayPrioritySwitch` + un timer de 3,5 s dans le store
(`DISCORD_PRIORITY_DEBOUNCE_MS`) :

- session publiée **terminée** → bascule immédiate (spec §13, aucune présence
  zombie) ;
- session publiée **encore active** (Alt+Tab) → bascule différée ; si la
  priorité revient avant l'échéance, le timer est annulé et rien ne change.

## Cycle de vie

- **Démarrage / recovery** : `applyInputArbiter` → `syncDiscordPresence` à
  chaque transition de session (y compris une session récupérée après
  redémarrage de ZAILON — spec §14, §95).
- **Fermeture de jeu** : plus de session prioritaire → `clearDiscordActivity`
  (spec §13) ; si une autre session tourne, sa présence est publiée.
- **Discord absent / fermé** : échec silencieux non bloquant (spec §31-33) —
  ZAILON continue ; au redémarrage de Discord, la prochaine synchronisation
  republie.
- **Fermeture de ZAILON** : `clearDiscordActivity` (spec §51) ; en cas de crash,
  Discord nettoie à la disparition de la connexion IPC.

## Paramètres

- **Présence Discord** (défaut ON pour les nouvelles installations).
- Afficher le profil / les mods / le temps écoulé.
- **Mode minimal** : jeu + « Via ZAILON » (spec §36).
- **Tester avec Discord lancé** : `test_discord_connection` (spec §4).
- Aucun champ secret, aucun bot token (spec §42-43).

## Validation

- `src/lib/discordPresence.ts` — logique pure, **15 tests** ;
  `src/lib/discordAssets.ts` — **5 tests**.
- `tsc` ✅, build ✅, **167/167 tests**.
- **Verify native ✅ + Verify ZAILON ✅** (release 1.57.0).
- Cas couverts par les tests : ID centralisé, variantes de state, anti-0-mods,
  0 mods réel, app non-jeu, mode minimal, fallback asset, asset spécifique,
  décision anti-flap (première publication, même session, session terminée,
  Alt+Tab).

## Assets par jeu (release 1.57.0, spec §17-21, §49-50)

`src/lib/discordAssets.ts` : mapping static (`DISCORD_ASSETS` : Cyberpunk →
`cyberpunk2077`, NTE → `nte`, Photoshop, Blender) + chaîne de résolution
`resolveDiscordAsset` :

1. asset Discord spécifique au jeu (mapping) ;
2. clé globale configurée par l'utilisateur ;
3. asset générique du type (`generic-game` / `generic-app`) ;
4. logo ZAILON (fallback absolu de `buildDiscordActivity`).

Jamais d'upload automatique d'images locales vers Discord (spec §18) : les clés
sont des identifiants d'assets déjà présents dans le Developer Portal de
l'application ZAILON.

## Timestamp préservé après recovery (release 1.57.0, spec §14, §95)

`startTimestampOverride` (natif `DiscordPresenceConfig`) : le frontend passe
`session.startedAt / 1000` — après un redémarrage de ZAILON pendant un jeu, le
timer Discord part du **vrai début de session**, pas de la republication.

## Diagnostic Discord (release 1.57.0, spec §40)

Bloc compact dans Paramètres > Discord : Application ID, Discord détecté, RPC
connecté, session publiée, asset utilisé, dernière mise à jour — alimenté par
la trace `lastDiscordPublished` du store (remise à zéro au clear).

## Limites / prochaines étapes

- **Boutons Discord** (spec §26) : URL publique ZAILON — facultatif, non activé.
- **Quick Panel** : toggle « Présence Discord » (spec §38).
- Artwork externe (spec §17.2) : non utilisé tant que le SDK Discord choisi ne
  l'expose pas de façon fiable.
