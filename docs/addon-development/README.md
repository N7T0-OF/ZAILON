# ZAILON — Développer un add-on

ZAILON est structuré en **Core + Add-ons** : le noyau reste léger, rapide,
offline-first et indépendant ; chaque capacité spécialisée (compatibilité jeu,
framework de modding, outil visuel, provider, thème…) est un **add-on
installable à la demande** (spec §1).

Cette documentation couvre : Getting Started, Manifest, SDK, Permissions,
Game Adapter, Mod Backend, Provider, Theme, UI Extension, Packaging, Testing,
Signing, Publishing, Versioning.

---

## 1. Getting Started

Prérequis : Node.js ≥ 20 (pour la CLI de développement).

```bash
# Depuis la racine du dépôt ZAILON
npm run addon:init my-addon -- --id community.you.myaddon --name "My Addon" --author "You"

cd my-addon
npm run addon:validate .
npm run addon:pack . -o MyAddon.zailon-addon
```

L'archive `.zailon-addon` produite s'installe dans ZAILON via
**Add-ons → Importer** : le manifest est validé, les permissions affichées,
puis l'installation est atomique (vérification, staging, échange, rollback).

Le dossier `addon-template/` à la racine du dépôt est la référence
« Use this template » : copiez-le, adaptez, validez, empaquetez.

## 2. Manifest (`manifest.json`)

Le manifest est **obligatoire à la racine de l'archive**. Structure :

```json
{
  "schema": 1,
  "id": "community.you.myaddon",
  "name": "My Addon",
  "version": "1.0.0",
  "author": "You",
  "description": "Une phrase.",
  "category": "utilities",
  "entrypoint": "module/index.ts",
  "minZailonVersion": "1.71.0",
  "minAddonApiVersion": "1",
  "permissions": ["game.read", "mods.read", "ui.extend"],
  "supportedPlatforms": ["windows", "linux", "macos"],
  "supportedGames": [],
  "dependencies": [],
  "optionalDependencies": [],
  "events": ["OnGameStarted"]
}
```

Champs clés :

| Champ | Rôle |
| --- | --- |
| `id` | **Immuable** — au moins 2 segments, minuscules `a-z0-9` + `-` (ex. `community.author.example`). Le nom peut changer, jamais l'ID (§10). |
| `schema` | Toujours `1`. |
| `category` | `game-support` · `modding` · `visual` · `appearance` · `sources` · `utilities`. |
| `entrypoint` | Chemin relatif du module exportant `AddonModule` (chargé **à la demande**, jamais au boot). |
| `minZailonVersion` / `maxZailonVersion` | Fenêtre de compatibilité (§23, §64). |
| `minAddonApiVersion` | Version de l'API d'extensions, distincte de la version ZAILON (§24). |
| `permissions` | Exhaustives — voir section 4. |
| `supportedGames` | Identifiants de jeux (pour un Game Adapter). |
| `dependencies` / `optionalDependencies` | Autres add-ons requis/optionnels (§31-33). |
| `events` | Événements auxquels l'add-on s'abonne — **lazy uniquement** (§69-71). |

`npm run addon:validate <dir>` vérifie tout cela.

## 3. SDK (`ZailonAddonSDK`)

Les add-ons **n'importent jamais les internes privés de ZAILON** (§25). Au
moment de l'activation, ZAILON fournit une API publique (`ZailonAddonApi`) :

```ts
interface ZailonAddonApi {
  apiVersion: string
  manifest: ZailonAddonManifest
  services: {
    games: GameService      // permission `game.read` / `game.launch` / `game.files.*`
    profiles: ProfileService// `profile.read` / `profile.write`
    mods: ModService        // `mods.read` / `mods.write`
    launch: LaunchService   // `process.launch` / `game.launch`
    settings: SettingsService // `settings`
    provider: ProviderService // `provider`
    ui: { register(slot, render) } // `ui.extend`
  }
  events: AddonEventBus     // abonnement aux événements lazy
  extend: (slot, render) => void
  storage: { get, set, remove } // données utilisateur, conservées après désinstallation
  log: (message) => void
}
```

La **gate de permissions agit au premier appel** : appeler un service sans la
permission déclarée lève une erreur qui nomme la permission manquante (§11).
Un add-on aux permissions minimales peut donc s'activer, tant qu'il n'utilise
pas un service non couvert.

## 4. Permissions

Aucun add-on ne reçoit d'accès implicite (§11). Permissions déclarables :

- `game.read` — lire les jeux configurés
- `game.launch` — lancer des jeux
- `game.files.read` / `game.files.write` — lire / écrire les fichiers des jeux
- `profile.read` / `profile.write` — profils
- `mods.read` / `mods.write` — mods (installation, ordre, activation)
- `network` — accès réseau (téléchargements, mises à jour)
- `process.read` / `process.launch` — observer / lancer des processus
- `ui.extend` — étendre l'interface (emplacements définis uniquement)
- `settings` — accéder aux paramètres ZAILON
- `provider` — agir comme fournisseur Explorer
- `filesystem.external` — accéder au système de fichiers hors des dossiers ZAILON

**Règle d'or : déclarez le minimum.** L'interface d'installation affiche la
liste exacte des permissions avant d'installer.

## 5. Game Adapter (`IGameAdapterAddon`)

Un add-on peut enseigner un jeu à ZAILON sans toucher au Core (§51-53) :

- identifiants de jeu ;
- candidats exécutables et processus ;
- chaîne de lancement (Steam → launcher → UAC → processus final) ;
- chemins de mods et frameworks ;
- diagnostics ;
- magasins supportés.

C'est le mécanisme qui rend « tout jeu compatible » sans ajouter des milliers
d'entrées dans le Core.

## 6. Mod Backend

Un backend de modding (Frosty, RED4ext, Bethesda, UE PAK, REDmod, FiveM…)
déclare comment installer, ordonner, activer et déployer les mods d'un jeu.
Le Core ne conserve qu'un `GenericFolderBackend` minimal (§50) ; les backends
spécialisés sont des add-ons.

## 7. Provider

Un provider alimente l'Explorer (§46-48). Interface `IModProvider` :

```ts
search(query)      // requêtes uniquement quand l'add-on est installé
getDetails(id)
getImages(id)
getFiles(id)
download(file)     // adapte l'UI si l'authentification est requise
resolveUpdates()
```

Un provider déclare ses `capabilities` (Search, Images, Download, Updates) —
ZAILON n'affiche jamais un bouton non fonctionnel. **Aucune requête n'est
faite vers une source dont l'add-on n'est pas installé.**

## 8. Theme

Un add-on de type thème peut modifier : fond, surfaces, rayons, espacement,
typographie, animations et icônes autorisées — **jamais la logique métier**
(§40). Permission requise : `ui.theme` uniquement (un thème ne lance pas
d'EXE, n'accède pas au réseau, ne modifie pas les fichiers des jeux, §42).

## 9. UI Extension (slot system)

Un add-on injecte des composants **uniquement** dans des emplacements définis
(§26-27) : `GameSettings`, `GameActions`, `Explorer`, `QuickPanel`,
`Diagnostics`, `Theme`, `ContextMenu`, `GameConfiguration`, `GameAppearance`,
`GameMods`, `ProfileActions`, `SettingsIntegration`, `ExplorerProvider`.

Les composants utilisent les composants UI officiels de ZAILON (Button,
Toggle, Card, Dialog, Tooltip, Dropdown, Progress, Badge) et héritent
automatiquement de la couleur d'accent, du thème et de l'échelle UI (§28-29).

## 10. Packaging

```bash
npm run addon:pack <dir> -o MyAddon.zailon-addon
```

Le format `.zailon-addon` est une **archive ZIP standard** (méthode store,
entrées triées, horodatage figé) → sortie **déterministe** : le même dossier
produit toujours le même SHA-256 (§14). Structure :

```
MyAddon.zailon-addon
├── manifest.json        (obligatoire, racine)
├── icon.svg
├── module/index.ts      (entrypoint)
├── resources/           (données livrées)
├── locales/             (traductions)
├── LICENSE
└── README.md
```

**Séparation code / données** : les données utilisateur vont dans
`addon-data/<id>/` au runtime (§16) — jamais dans le code. Désinstaller un
add-on ne supprime pas ses données (conservées par défaut, §17).

## 11. Testing

- `npm run addon:validate <dir>` — validation statique du manifest.
- Testez l'archive avec n'importe quel décompresseur (l'installation native
  refuse les chemins relatifs vers l'extérieur et les symlinks).
- En mode développeur de ZAILON (Paramètres → Développeur), activez
  l'inspection : `loaded` vs `dormant`, contribution au démarrage, mémoire.

## 12. Signing

- Le SHA-256 de l'archive est vérifié à l'installation (§14).
- Les add-ons **officiels** doivent aussi fournir une **signature Ed25519**
  du SHA-256 contre leur clé publique (vérifiée par le pipeline natif) ; un
  officiel sans signature est refusé.
- Les add-ons **communautaires** s'installent sans signature : l'interface
  affiche clairement l'origine et la liste exacte des permissions (§59).

## 13. Publishing

- **Officiel** : publié dans le catalogue ZAILON (fichier `catalog.json`
  léger, cache hors ligne, §6, §43). `permissions`, versions de compatibilité
  et hash y sont déclarés.
- **Communautaire** : publiez votre `.zailon-addon` où vous voulez (GitHub,
  site, Discord…). L'utilisateur fait **Importer** et c'est terminé. Pas de
  comptes, pas de marketplace, pas de modération (§7-8).

## 14. Versioning

- `version` de l'add-on : `MAJEUR.MINEUR.CORRECTIF` sémantique.
- `minAddonApiVersion` : version de l'API d'extensions (aujourd'hui `1`) —
  séparée de la version ZAILON pour ne pas casser tous les add-ons à chaque
  mise à jour du lanceur (§24).
- Avant une mise à jour de ZAILON, la compatibilité est vérifiée
  (fenêtre min/max) ; un add-on incompatible n'est **jamais supprimé**, il est
  signalé « non testé » (§23).
- Les mises à jour officielles : download → verify → staging → swap atomique →
  rollback en cas d'échec (§15, §63, §65). Jamais pendant qu'un jeu utilise
  l'add-on.
- Les add-ons communautaires n'ont pas d'auto-update obligatoire (§60).

---

## Règles de conception (§80)

- **Core** : « Je lance et organise mes jeux. »
- **Add-ons** : « J'ajoute uniquement les capacités dont j'ai besoin. »
- **Profile** : « Je définis comment ce jeu doit fonctionner. »
- **Explorer** : « Je trouve du contenu grâce aux providers que j'ai choisis. »

Un add-on ne doit jamais : être chargé au démarrage sans besoin, créer des
services de fond permanents (§20), tourner en polling (§71), ni empêcher
ZAILON de démarrer (crash guard + safe mode, §21-22).

## CLI de développement (§56)

| Commande | Rôle |
| --- | --- |
| `npm run addon:init <dir> [--id x] [--name y] [--author z] [--version v]` | Crée un add-on depuis le template. |
| `npm run addon:validate <dir>` | Valide le manifest. |
| `npm run addon:pack <dir> [-o out.zailon-addon] [--dry-run]` | Empaquette (ZIP déterministe) et affiche le SHA-256. |
