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

## 3. Backend natif (livré en 1.104.0)

Commandes Rust exposées via `native.ts` :

- `readCitizenFx(path)` → `{ path, exists, text }` — lecture du fichier, jamais
  d'écriture.
- `writeCitizenFx(path, text)` → `{ path, backupPath, bytes }` — écriture
  **atomique** APRÈS backup (`citizenfx.ini.zailon-backup-<timestamp>`).
- `detectFiveMEnvironment(installDirectory)` → `{ root, appData, hasCitizenFxIni,
  folders, gtaVPath }` — détection disque de `FiveM.app` (remonte les ancêtres),
  dossiers `mods`/`citizen`/`plugins` et chemin GTA V (`[Game] IVPath`, lecture
  seule). Le chemin de `FiveM.app` n'est jamais codé en dur.

## 4. UI ReShade FiveM (livrée en 1.105.0)

Bouton « **ReShade FiveM** » dans l'onglet Mods d'un jeu FiveM client (gated
par `fivem.profiles` — feature removal §57). Le dialogue :

1. **Diagnostic compact** (§12) : FiveM.app, CitizenFX.ini, dossiers
   mods/citizen/plugins, GTA V (`IVPath`) et ID ReShade5 — ✓/⚠/✕ ;
2. **Assistant ID** (§7-9) : saisie de l'ID, **aperçu avant/après** du
   fichier via `setReShade5Id` (lib pure — aucune écriture sans validation) ;
3. **Enregistrer** → `writeCitizenFx` (backup horodaté automatique) ;
   **Retirer** → `removeReShade5Id` (désinstallation propre §20).

## 5. Packs graphiques FiveM — analyse + plan (livrée en 1.106.0)

Bouton « **Packs graphiques** » (onglet Mods, gated `fivem.profiles`) →
`FiveMPackDialog` :

- **`fivemPack.ts`** : moteur de correspondance des chemins (pure, testé) —
  `stripCommonRoot` (racine commune détectée automatiquement),
  `mapPackEntry` (mods/citizen/plugins/reshade-shaders/presets/citizenfx,
  exclusion GTA V), `planFiveMPack` (résumé + exclusions + fichiers sensibles),
  `packManifest` / `rollbackPlanFromManifest` / `packManifestJson` ;
- aperçu du plan **sans rien installer** : compteurs par famille, exclusion
  GTA V, fichiers sensibles (`.exe`/`.dll`/`.asi`) signalés.

## 6. Packs graphiques — application réelle + rollback (livrée en 1.109.0)

**Invention native de l'archive** : `fivemPackScan(path)` liste les entrées
réelles d'un `.zip` (normalisées `/`, symlinks et traversée rejetés) — les
packs `.zip` sont désormais analysés **par leur contenu**, pas par leur nom.
`.rar`/`.7z` → message explicite (décompressez ou utilisez un `.zip`) ; un
dossier décompressé reste supporté via le scan existant.

**Application + désinstallation propres** (spec « Désinstallation propre ») :

- `fivemPackApply(archivePath, targetDir, manifestJson)` : extrait **uniquement**
  les entrées du plan vers `targetDir` (chemins relatifs validés), sauvegarde
  tout fichier existant (`<name>.zailon-pack-backup-<ts>`), puis écrit
  `zailon-manifest.json` (`installedAt` + backups).
- `fivemPackRemove(targetDir)` : restaure les fichiers sauvegardés et supprime
  **uniquement** les fichiers possédés par le manifeste — jamais un fichier
  utilisateur — puis retire le manifeste.
- `fivemPackManifest(targetDir)` : état « pack installé » pour l'UI.

La cible est l'environnement FiveM détecté (`FiveM.app`, jamais codé en dur) ;
les fichiers GTA V restent exclus. Le dialogue affiche le pack installé avec un
bouton **Désinstaller** (rollback), et l'installation est non destructive
(backup systématique avant remplacement).

## 7. Prochaines phases (non livrées ici)

- Assistant d'installation FiveM (détection → création de profil → première
  initialisation de l'environnement).
