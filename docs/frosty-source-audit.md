# Frosty Editor — Audit de la source locale

> Source analysée : `G:\2_Logiciel\CLAUDE CODE\EXEMPLE\Frosty Editor`
> Rédigé à partir de l'audit réel du dépôt (branche 1.0.6 historique, CadeEvs/FrostyToolsuite).

## Ce que contient le dossier local

| Dossier     | Nature                                             |
| ----------- | -------------------------------------------------- |
| `github/`   | **Source complète** (445 fichiers `.cs`, solution, 8 projets core, 28 dossiers de plugins) |
| `final/`    | Build de Frosty **Editor** (exe + DLL + Plugins + Profiles + Mods + Shaders) |
| `modmaager/`| Build de Frosty **Mod Manager** (exe + DLL + Plugins + Profiles + crashlog) |

## Projets core (solution `FrostyEditor/FrostyEditor.sln`)

| Projet             | Rôle |
| ------------------ | ---- |
| `FrostySdk`        | Formats Frostbite : EBX, RES, chunks, bundles, cas/cat, `EbxReader`/`EbxWriter`, `DbReader`/`DbWriter`, `BitReader`/`BinarySbReader`, `CasReader`/`CatReader`, `NativeReader`/`NativeWriter`, `Sha1`, `TypeLibrary`, `Profile`/`ProfileVersion`/`ProfilesLibrary` |
| `FrostySdk/Managers` | `AssetManager`, `KeyManager` (clés de chiffrement par jeu), `ResourceManager`, loaders |
| `FrostySdk/Ebx`    | Types EBX : `AssetClassGuid`, `BoxedValueRef`, `CString`, `FileRef`, `PointerRef`, `ResourceRef`, `TypeRef` |
| `FrostySdk/Profiles`| **25 profils SDK** (DLL par jeu) — voir `docs/frosty-source-map.md` |
| `FrostyEditor`     | UI WPF : `MainWindow`, `AboutWindow`, `KeyPromptWindow`, `ModSettingsWindow`, `PatchSummaryWindow`, `PrelaunchWindow2`, `SplashWindow`, `DiscordRPC.cs`, `FileUnblocker.cs`, thèmes, commandes, extensions |
| `FrostyModManager` | Gestionnaire de mods : activation, ordre, ModData, lancement |
| `FrostyModSupport` | `FrostyModExecutor`, `FrostyLegacy` (mods legacy) — cœur de l'application des mods |
| `FrostyPlugin`     | **FrostyCore** — architecture de plugins (`IPlugin`, host) |
| `FrostyControls`   | Contrôles WPF partagés |
| `FrostyHash`       | Hachage Frostbite (Fnv) |
| `FrostyCmd`        | CLI historique (rewrite moderne = FrostyCmd .NET 8) |

## Formats et capacités présents (corroborés par les releases 1.0.6.x)

- Édition **EBX** avec **PointerRef** (filtrage, recherche de références) ;
- **Textures** : preview, export/import DDS, mipmaps, formats Frostbite ;
- **Meshes** : MeshSet, rigid/skinned, **composite meshes**, export de parts, corrections de tangentes ;
- **Audio** : **EALayer3** import/export, preview ;
- **Bundles** : add/remove, whitelist, inspection ;
- **Localisation** : `BWLocalizationPlugin`, `FsLocalizationPlugin` ;
- **Duplication** d'assets ;
- **ModData** géré par Mod Manager ;
- Corrections historiques : `EbxWriter` (perfs), cache écrit deux fois, mémoire, écriture `.cat`.

## Conclusions pour ZAILON

1. **Ne pas réimplémenter le format Frostbite** : `FrostySdk` contient les parsers/writers éprouvés.
2. **Ne pas embarquer l'UI WPF** : séparer backend (Frosty SDK) / UI ZAILON (§7).
3. **Ne pas copier le code** : licence CC BY-NC-ND 4.0 → voir `docs/frosty-license-audit.md`.
4. La réécriture officielle .NET 8 (Avalonia) est CLI-only et précoce → conceptuelle seulement.

## Voir aussi

- `docs/frosty-source-map.md` — carte complète du dépôt
- `docs/frosty-plugin-inventory.md` — inventaire des 29 plugins
- `docs/frosty-old-vs-new-architecture.md` — comparaison historique / réécriture
- `docs/frosty-editor-addon-architecture.md` — architecture de l'add-on ZAILON
