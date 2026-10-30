# Migration réelle vers l'architecture Add-ons (1.72.0)

## Principe (spec Add-ons §10, §74)

Règle absolue : **si un add-on n'est pas installé (ou est désactivé), sa
fonctionnalité n'existe pas** — pas d'interface, pas de service, pas de requête
distante, pas de code chargé inutilement.

L'architecture ne s'arrête plus à la page « Add-ons » : le Core gâte
réellement ses propres sections derrière un **registre de capacités** unique.

## `src/lib/addonGating.ts` — source de vérité

```ts
addonCapabilities(addons)  // Set<ZailonCapability> dérivé des add-ons installés ET activés
hasCapability(caps, 'discord.presence')
PROVIDER_ADDON  // provider Explorer → capacité
CAPABILITY_ADDON  // capacité → id d'add-on
```

Un composant ne teste jamais `if (addonInstalled('official.zailon.frosty'))` :
il demande `hasCapability(caps, 'frosty.backend')`. Le mapping reste centralisé.

## Ce qui est gaté (1.72.0)

| Fonctionnalité               | Capacité            | Add-on                    |
| ---------------------------- | ------------------- | ------------------------- |
| Paramètres > Discord         | `discord.presence`  | official.zailon.discord   |
| Configuration > Frosty       | `frosty.backend`    | official.zailon.frosty    |
| Configuration > ReShade      | `reshade.manager`   | official.zailon.reshade   |
| Explorer > Nexus             | `provider.nexus`    | official.zailon.provider.nexus |
| Explorer > GameBanana        | `provider.gamebanana` | official.zailon.provider.gamebanana |
| Explorer > CurseForge        | `provider.curseforge` | official.zailon.provider.curseforge |
| Paramètres > Fournisseurs    | providers           | (n'importe lequel)        |
| Paramètres > Illustrations   | `artwork.plus`      | official.zailon.artwork   |
| Paramètres > Liens NXM       | `provider.nexus`    | official.zailon.provider.nexus |

Comportement sans add-on :

- **Explorer** : état « Aucune source installée » — zéro requête distante,
  boutons d'ajout vers la page Add-ons (§22-23).
- **Configuration jeu** : Frosty/ReShade éligibles affichent une carte
  « Module disponible » avec « Ajouter à ZAILON » (§36, §38).
- **Paramètres** : les sections Discord/providers/illustrations/NXM
  n'apparaissent pas. Les clés stockées ne sont pas supprimées : elles
  réapparaissent quand l'add-on est réinstallé (§36).

## Accueil multimédia (§1-9)

- Le bloc « Fonds multimédia de l'Accueil » a été **retiré de Paramètres >
  Apparence** (réglages globaux supprimés).
- Le **contrôle audio du Hero** (🔇/🔊 + slider, persistance `mutedOverride` /
  `volumeOverride` par jeu) vit sur l'Accueil, coin inférieur droit, slider
  rétracté après quelques secondes (§3-5).
- Le bouton « Modifier l'apparence » du Hero ouvre l'Apparence du jeu, qui
  contient maintenant le bloc **« Fond de l'Accueil »** : type de fond par jeu
  (Image / Vidéo locale / YouTube) + **lien YouTube collable directement**
  (watch, youtu.be, shorts) avec miniature, sans clé API (§6-7).
- Tout est persisté par jeu dans `GameBackgroundMedia` (survit au redémarrage).

## Paramètres compacts (§46-50)

- Accordéons repliés par défaut au démarrage ; la dernière section ouverte est
  mémorisée **par session** (sessionStorage) et ne survit pas au redémarrage.
- Les deep links continuent d'ouvrir la section pertinente.
- « Réduire les explications » reste activé par défaut.

## Cartes Add-ons (§37-41, §51-53)

- Description de page courte : « Ajoutez uniquement les fonctions dont vous
  avez besoin. » + bulle ⓘ.
- Le texte « installation atomique… » répété sur chaque carte est supprimé
  (détails dans ⓘ Sécurité et `docs/addon-install-pipeline.md`).
- Permissions : badge 🔐 avec popover au clic.
- Documentation : icône 📄 avec infobulle vers `docs/addon-development`.

## Tests

- `test-addon-gating.ts` (9 tests) : aucune capacité sans add-on, add-on
  désactivé → capacité absente, mapping providers, liste des manquantes.

## Reste à faire (Phase 2)

- Gating natif (Rust) : ne pas démarrer les services Discord/providers quand
  l'add-on est absent (le front ne les affiche plus ; le natif les exécute
  encore au lancement de session).
- Extraction complète : Cyberpunk Advanced, NTE Support, FiveM, importers,
  Theme Packs, Performance+, UE Modding comme vrais add-ons livrés.
- Vérification de signature des add-ons (au-delà du SHA-256).

## Phase 2 — Gating natif (1.73.0)

Le gate n'est plus seulement visuel : le **Core Rust** refuse de démarrer un
service sans son add-on.

- `AddonGate` (état Tauri géré) : liste des add-ons activés, poussée par le
  frontend (`native.setEnabledAddons`) au démarrage et à chaque changement de
  `store.addons` (App.tsx).
- Commandes natives gardées : Discord (`set_discord_activity_for`,
  `test_discord_connection`), providers (`provider_connection_statuses` filtre
  par add-ons installés, `test_provider_connection`), lectures Nexus
  (`nexus_catalog_games/mods`, `nexus_mod_gallery`), artwork
  (`search_game_artwork`, `test_artwork_provider`).
- Sans l'add-on, la commande renvoie une erreur explicite — jamais de
  présence Discord publiée, jamais de requête Nexus, jamais d'appel
  SteamGridDB/IGDB, même si le réglage est resté activé dans le store.
- L'UI Apparence du jeu masque aussi la recherche d'illustrations sans
  Artwork+ (artwork minimal local/Steam).

### Reste à faire (Phase 3)

- Gate des commandes Nexus restantes (collections, installations) — déjà
  inaccessibles via l'UI gatée, à verrouiller côté natif.
- Extraction complète : Cyberpunk Advanced, NTE Support, FiveM, importers,
  Theme Packs, Performance+, UE Modding comme vrais add-ons livrés.
- Vérification de signature des add-ons (au-delà du SHA-256).

## Phase 3 — Signature Ed25519 (1.74.0)

Le SHA-256 garantit l'intégrité ; la signature garantit l'origine (spec §14, §52).

- `addon_verify_signature` (Rust, ed25519-dalek 2 + base64 0.22) : vérifie la
  signature Ed25519 (base64) du SHA-256 du fichier contre la clé publique
  (base64, 32 octets) déclarée par le catalogue. La clé publique n'est jamais
  un secret.
- Le catalogue peut déclarer `signature` + `signaturePublicKey` (les deux ou
  rien — le parseur rejette un champ isolé).
- Politique : officiel + SHA-256 réel sans signature → **installation refusée** ;
  signature déclarée → vérifiée avant extraction ; communautaire → facultative
  (permissions affichées, §59).
- Le dialogue d'installation affiche l'état de la signature (vérifiée ✓ /
  refusée / facultative).

Quand le repository officiel publiera de vrais packages, chaque entrée portera
sa signature — le pipeline la refusera en cas de divergence ou d'absence.

### Reste à faire (Phase 4)

- Gate des commandes Nexus restantes (collections, installations) côté natif.
- Extraction de Cyberpunk Advanced / NTE Support / FiveM / Theme Packs /
  Performance+ en vrais add-ons livrés.
- Template GitHub `zailon-addon-template` + docs `addon-development/`.
