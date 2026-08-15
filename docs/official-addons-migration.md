# Finalisation des add-ons officiels (spec §25-59, §65)

## Statut dérivé du catalogue — jamais écrit à la main (§47-49)

La disponibilité d'une carte vient UNIQUEMENT du catalogue
(`zailon-addons/catalog.json`) :

| Catalogue | Carte |
|---|---|
| `package` réel + SHA-256 (officiel) | **Disponible** · [Installer] |
| `package: null` | **En développement** · bouton désactivé |
| `package` déclaré mais irrésoluble / hash manquant | **Erreur** (catalogue incohérent) |

Quand un package est généré, `scripts/build-official-addons.ts` met
automatiquement `package`, `version`, `sha256` et `downloadSize` dans le
catalogue → la carte devient installable à la synchronisation suivante.

## Packages réellement construits aujourd'hui

| Add-on | Statut |
|---|---|
| `official.zailon.frosty` | Disponible (package + SHA-256) |
| `official.zailon.frosty-editor` | Disponible (package + SHA-256) |
| `official.zailon.visual-profiles` | Disponible (package + SHA-256) |
| `official.zailon.discord` | Disponible (package + SHA-256) — première migration réelle hors Core |
| `official.zailon.provider.gamebanana` | Disponible (package + SHA-256) |
| `official.zailon.provider.nexus` | Disponible (package + SHA-256) |
| `official.zailon.provider.curseforge` | Disponible (package + SHA-256) |
| `official.zailon.game.cyberpunk` | Disponible (package + SHA-256) — outils avancés gated |
| les 10 autres officiels | En développement — aucun package tant que la fonctionnalité n'est pas migrée hors Core |

### Cyberpunk Advanced — migration réelle (feature removal §57)

Première migration « jeu » : les outils de réparation Cyberpunk étaient
branchés sur le SEUL nom du jeu (aucune gate d'add-on). La migration a
ajouté :

- le package `official.zailon.game.cyberpunk` (capacité
  `cyberpunk.frameworks`, permissions `game.read`/`game.files.write`/
  `mods.read`/`mods.write`/`process.read`, slots `Game.Tools` +
  `Game.Diagnostic` + `Diagnostic.Frameworks`) — **Disponible** avec SHA-256
  réel ;
- **gate pur et testé** `cyberpunkToolsAllowed(capabilities, isCyberpunkGame)`
  : les outils n'existent que pour un jeu Cyberpunk ET avec l'add-on
  installé + activé ;
- **gating UI** : bouton « Réparer les racines Cyberpunk » (onglet Mods),
  `onRepairMo2` (réparation du déploiement MO2) et carte « Réparer RED4ext »
  (Diagnostic → Frameworks) sont tous conditionnés par la gate — plus jamais
  par le seul nom du jeu ;
- la détection de frameworks (RED4ext, redscript, TweakXL, ArchiveXL…) et le
  backend virtuel de lancement restent dans le Core (adaptateur jeu, spec
  « Séparation des responsabilités » §113) : un jeu Cyberpunk se lance et se
  scanne normalement, seuls les OUTILS de réparation disparaissent sans
  l'add-on ;
- test dédié `test-cyberpunk-addon.ts` (gate ×4, catalogue/SHA, garde-fou
  source sur GamesView/GameDiagnosticPanel, manifest) — 507 tests au total.

### CurseForge Provider — migration réelle (feature removal §57)

Dernier du trio des providers : le gating Explorer + la ligne de clé
Paramètres existaient déjà ; la migration a ajouté :

- le package `official.zailon.provider.curseforge` (capacité
  `provider.curseforge`, permissions `network`/`game.read`/`mods.write`/
  `settings`, slots `Explorer.Provider` + `Settings.Provider.CurseForge`) —
  **Disponible** avec SHA-256 réel ;
- test dédié `test-curseforge-provider.ts` (absence → rien nulle part, package
  réel, manifest correct) — ferme le trio providers GameBanana / Nexus /
  CurseForge.

### Nexus Provider — migration réelle (feature removal §57)

Comme GameBanana, le gating existait (Explorer filtré par capacité, section
Paramètres gated) ; la migration a ajouté :

- le package `official.zailon.provider.nexus` (capacité `provider.nexus`,
  permissions `network`/`game.read`/`mods.write`/`settings`, slots
  `Explorer.Provider` + `Settings.Provider.Nexus`) — **Disponible** avec
  SHA-256 réel ;
- **ligne de fournisseur individuelle** : la saisie de clé Nexus ne s'affiche
  plus dans « Fournisseurs de mods » sans l'add-on Nexus (avant, toute
  capacité provider montrait les lignes Nexus + CurseForge) — idem CurseForge
  quand il sera migré ;
- test dédié `test-nexus-provider.ts` (absence → rien nulle part, package
  réel, manifest correct).

### GameBanana Provider — migration réelle (feature removal §57)

Le gating Explorer existait déjà (spec §21-24 : seuls les providers dont
l'add-on est installé ET activé existent — liste des sources filtrée, effets
coupés, zéro requête distante). La migration a donc consisté à :

- créer le package `official.zailon.provider.gamebanana` (capacité
  `provider.gamebanana`, permissions `network`/`game.read`/`mods.write`, slot
  `Explorer.Provider`) — **Disponible** avec SHA-256 réel ;
- vérifier qu'aucun appel au client GameBanana n'existe hors de l'UI gated
  (recherche/refresh/téléchargement ne sont atteignables que via Explorer) ;
- test dédié `test-gamebanana-provider.ts` (absence → pas de source, package
  réel, manifest correct).

Le client GameBanana reste dans le Core mais n'est appelé QUE par l'UI gated —
même modèle que Visual Profiles et Discord Presence.

### Discord Presence — migration réelle (feature removal §57)

Premier add-on migré hors du Core avec gate de fonctionnalité complète :

- **Capacité** `discord.presence` → `official.zailon.discord` (`addonGating.ts`) ;
- section Paramètres Discord déjà gated (`hasCap('discord.presence')`) ;
- panneau rapide : état Discord **non émis** sans l'add-on, actions
  `set-discord` / `open-discord-settings` **ignorées** ;
- store : `syncDiscordPresence` refuse de publier sans la capacité (même si le
  réglage est resté activé) et **nettoie** la présence à la désinstallation /
  désactivation en pleine session (`discordPresenceAllowed`, pur et testé) ;
- test dédié `test-discord-feature-removal.ts`.

Le pont natif RPC reste dans le Core mais n'est plus jamais appelé sans
l'add-on (même modèle que Visual Profiles).

**Règle §55** : un package ne devient pas « Disponible » uniquement pour
supprimer le texte « En développement » — il doit contenir un manifeste, un
entrypoint et une vraie implémentation minimale.

## Corrections apportées

1. **Plus jamais de badge « Local » sur un officiel** (§42) : le catalogue
   embarqué est normalisé via `parseAddonCatalog` (official: true, SHA validé) —
   il se comporte exactement comme le catalogue distant.
2. **Dépendances lisibles** (§52-53) : chip « Nécessite Frosty Support ⓘ » sur
   la carte (nom humain, ids dans le tooltip) ; le dialogue d'installation
   propose toujours « Installer aussi : … ».
3. **Filtres de statut** (§65) : Tous / Installés / Disponibles / Mises à jour /
   En développement.
4. **Permissions** (§50) : icône 🔐 + nombre avec popover des libellés.

## Prochaines migrations prioritaires (§56)

Le code de Discord Presence, Nexus/GameBanana providers, Visual Profiles,
Cyberpunk Advanced, NTE Support et Performance+ existe déjà dans le Core :
la priorité est de le déplacer dans des packages, puis de vérifier le
« feature removal test » (§57) — désinstaller l'add-on fait disparaître la
fonctionnalité réelle (réglages, panneaux, chargements).
