# Frosty — Inventaire des plugins (29)

> 28 dossiers dans `Plugins/` + `ChunkResExplorerPlugin` contient deux projets
> (`ChunkResExplorerPlugin` + `ChunkResEditorPlugin`). L'inventaire ci-dessous est
> reproduit dans `src/lib/frostyEditor.ts` (`FROSTY_PLUGIN_INVENTORY`).

| Plugin | Catégorie | Edit | Import | Export | Note |
| ------ | --------- | :--: | :----: | :----: | ---- |
| `TexturePlugin` | texture | ✓ | ✓ | ✓ | Preview, DDS, mipmaps (§24-27) |
| `AtlasTexturePlugin` | texture | – | – | – | Textures atlas |
| `MeshSetPlugin` | mesh | ✓ | ✓ | ✓ | MeshSet, parts, tangentes, composite (§28) |
| `RefreshMeshVariationsPlugin` | mesh | ✓ | – | – | Variations de meshes |
| `ObjectVariationPlugin` | mesh | ✓ | – | – | Variations d'objets |
| `SoundEditorPlugin` | audio | ✓ | ✓ | ✓ | EALayer3, preview (§31-33) |
| `BundleEditorPlugin` | bundle | ✓ | – | – | Add/remove/whitelist (§34-35) |
| `DelayLoadBundlePlugin` | bundle | ✓ | – | – | Delay-load |
| `BiowareLocalizationPlugin` | localization | ✓ | – | ✓ | Localisation Bioware (§37-38) |
| `FsLocalizationPlugin` | localization | ✓ | ✓ | ✓ | String database Frosty |
| `LocalizedStringPlugin` | localization | ✓ | – | – | Chaînes localisées |
| `ReferencesPlugin` | reference | – | – | – | Graph de références (§99-100) |
| `RootInstanceEntriesPlugin` | reference | – | – | – | Entrées racine |
| `DuplicationPlugin` | utility | ✓ | – | – | Dupliquer un asset (§36) |
| `EbxToXmlPlugin` | utility | – | – | ✓ | Export EBX → XML |
| `ChunkResExplorerPlugin` | utility | – | – | – | Explorateur chunks/RES |
| `ChunkResEditorPlugin` | utility | ✓ | – | – | Édition chunks/RES |
| `TypeExplorerPlugin` | utility | – | – | – | Explorateur de types |
| `LuaPlugin` | utility | – | – | – | Scripting Lua |
| `VersionDataPlugin` | utility | – | – | – | Données de version |
| `SvgImagePlugin` | utility | – | – | – | Images SVG |
| `ConnectionPlugin` | utility | – | – | – | Connexions |
| `ConversationPlugin` | utility | ✓ | – | – | Conversations |
| `DifficultyWeaponTableDataPlugin` | utility | ✓ | – | – | Tables armes/difficulté |
| `IesResourcePlugin` | utility | ✓ | – | – | Ressources IES |
| `LaunchPlatformPlugin` | launch | – | – | – | Lancement Steam/EA/Origin |
| `BlankPlugin` | legacy | – | – | – | Exemple |
| `TestPlugin` | legacy | – | – | – | Tests |
| `Fifa` | legacy | – | – | – | Spécifique FIFA |

## Conséquences pour l'add-on ZAILON

- **Un seul add-on ZAILON** `official.zailon.frosty-editor` ; les plugins Frosty sont
  gérés par **son propre Plugin Manager interne** (§40-43), jamais dans la page Add-ons.
- Chargement **à la demande** par type d'asset (§43) : TexturePlugin seulement quand un
  asset texture est ouvert.
- Les plugins tournent dans le **Worker isolé** (§82-83) — un crash de plugin ne ferme
  jamais ZAILON.
- Les plugins `legacy` (Blank/Test/Fifa) sont exclus du chargement par défaut.
