# Multi-installation par profil (spec §6-16, §60-64)

## Principe — générique, pas FiveM

Un jeu = **une seule carte Bibliothèque**. Un jeu peut avoir **plusieurs
installations physiques** (copies FiveM Default/Drift/Roleplay, version Steam vs
standalone, édition moddée, beta…) et **chaque profil pointe vers l'installation
qu'il utilise**. Le changement de profil bascule automatiquement l'exécutable, la
racine, le dossier mods et la cible de tracking (§10).

C'est une fonctionnalité CORE : elle sert FiveM, Minecraft (instances), les jeux
copiés/moddés, les éditions stable/beta. L'add-on FiveM n'aura qu'à mieux
détecter/configurer ses installations, pas à réimplémenter le modèle.

## Modèle de données

```ts
GameInstallation {
  id, gameId, name,          // « Principal », « Drift », « Beta »… (§61)
  executablePath?, rootPath?,
  modsPath?, bypassPath?,
  platform?, launchArgs?
}

Game.installations?: GameInstallation[]
Profile.installationId?: string   // absent → « Principal » / première
```

Les champs legacy `Game.execPath` / `installDirectory` restent la racine pour les
jeux sans installations (fallback — aucun jeu ne casse).

## Résolution (§8-10)

`resolveGameInstallation(game, profile)` (`src/lib/installations.ts`, pur) :

1. `profile.installationId` trouvé dans `game.installations` ;
2. sinon installation « Principal » (id stable `principal`) ;
3. sinon première installation ;
4. sinon fallback legacy `execPath`/`installDirectory`.

## Sessions & statistiques (§16, §64)

- `GameSession`, `ActiveTrackedSession` et `TrackedSession` portent
  `installationId` + `installationName` (snapshots) — les stats distinguent
  « FiveM — Drift » de « FiveM — Default » sans jamais fusionner les durées.
- La détection externe (jeu lancé hors ZAILON) retombe sur l'installation
  « Principal » (le processus observé ne révèle pas la variante).
- `perInstallation(history, gameId)` (`src/lib/sessionStats.ts`) regroupe par
  installation ; les sessions legacy sans `installationId` restent visibles sous
  le nom du profil (aucune perte de stats après migration).

## UI

- **Configuration → Installations** : liste (renommage, chemins exécutable/racine
  modifiables), « Ajouter une installation » (choix d'exécutable → nom dérivé du
  dossier), suppression (les profils ciblés retombent sur Principal).
- **Onglet Profils** : sélecteur « Installation utilisée » par profil quand
  plusieurs installations existent.
- **Page jeu** : badge d'installation active (titre avec chemin en tooltip) quand
  il y a plus d'une installation.
- **Accueil** : le sélecteur rapide de profil bascule aussi l'installation —
  transparent, aucune action supplémentaire.

## Migration v6

Au premier chargement avec `version: 6` (et à chaque chargement en
normalisation), chaque jeu avec `execPath` reçoit son installation « Principal »
(`ensurePrincipalInstallation`, idempotent). Les profils sans `installationId`
résolvent vers elle.

## Tests

`.github/scripts/test-installations.ts` (8 tests) : création/idempotence,
priorité profil, fallbacks, nom lisible, groupement stats par installation.
