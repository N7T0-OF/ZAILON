# Support FiveM avancé + Groupes de jeux

## 1. Fondations pures (logique testée, zéro accès disque)

### `src/lib/citizenfx.ts` — éditeur sécurisé de `CitizenFX.ini` (spec §6, §8-9, §20)

Règle absolue : **modification INI ciblée, jamais de réécriture complète**.

- `parseCitizenFx` : lit `[Game] IVPath` / `UpdateChannel` / `SavedBuildNumber`
  (lecture seule — le chemin GTA V n'est **jamais** modifié) et l'ID `ReShade5`
  existant dans `[Addons]`.
- `setReShade5Id` : ajoute/met à jour **uniquement** la ligne
  `ReShade5=ID:<id> acknowledged that ReShade 5.x has a bug that will lead to
  game crashes` — sections, clés et commentaires préservés, **aucun doublon**,
  section `[Addons]` créée en fin de fichier si absente.
- `removeReShade5Id` : retire **uniquement** la ligne gérée par ZAILON (les
  autres clés de `[Addons]` sont conservées) — désinstallation propre §20.

Le fichier réel est lu/écrit par le backend natif ; cette lib ne reçoit que du
texte (testable et déterministe).

### `src/lib/fivemSupport.ts` — détection et classification (spec §1, §4, §26)

- `detectFiveMStructure` : déduit `FiveM.app`, la présence de `CitizenFX.ini`
  et des dossiers `mods`/`citizen`/`plugins` depuis les chemins observés — le
  chemin de `FiveM.app` n'est **jamais codé en dur**.
- `fiveMReShadeCompatibility` : classification conservatrice
  `recommended / compatible / risky / unknown` — **jamais « dernière version =
  meilleure version »** (une 5.x est `compatible` par défaut, une 6.x reste
  `unknown` tant qu'aucun retour ne la classe).
- `classifyFiveMPack` : moteur de correspondance des chemins d'un pack
  graphique — sépare `fivem` / `reshade` / `gtav` / `inconnu` et signale les
  fichiers sensibles (`.exe`/`.dll`/`.asi`) qui ne sont **jamais exécutés
  automatiquement** (sandbox d'analyse).

## 2. Groupes de jeux (spec §1-4, §7, §10)

Purement **organisationnel** — un groupe ne fusionne ni profils, ni fichiers,
ni statistiques par profil.

- `Game.groupId` + `GameGroup { id, name, memberGameIds, createdAt }`.
- Migration **v7** idempotente : `normalizeGameGroups` retire les membres
  inexistants, les groupes vides, et les `groupId` pointant vers un groupe
  absent.
- `proposeGameGroups` : propose un groupe quand **plusieurs jeux partagent le
  même exécutable** (ex. `FiveM.exe`) — **jamais de regroupement automatique**
  (§3), la proposition reste manuelle et réversible.
- `groupTotalPlaytime` : temps total d'un groupe (affiché **séparément** du
  détail par profil — §10).
- UI : sélecteur « Groupe » sur la page du jeu (aucun / rejoindre / + nouveau
  groupe) ; la suppression d'un groupe ne supprime **jamais** les jeux ni leurs
  fichiers.

## 3. Prochaines phases (non livrées ici)

- Backend natif : détection réelle de `FiveM.app`/`CitizenFX.ini`, lecture
  `[Game] IVPath` sur disque, écriture avec **backup** avant modification
  (`citizenfx.ini.zailon-backup`).
- **ReShade FiveM Integration** (installation, ID automatique, presets par
  profil, « dernière configuration fonctionnelle »).
- **Gestionnaire de packs graphiques FiveM** : import `.zip/.rar/.7z`,
  classification interactive, installation par profil avec manifeste
  `zailon-manifest.json` et rollback.
- Assistant d'installation FiveM (détection → création de profil → première
  initialisation).
