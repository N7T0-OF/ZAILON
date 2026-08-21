# Frosty — Carte de la source (source-map)

> Carte réelle du dépôt `github/` (branche 1.0.6). 445 fichiers `.cs`, 8 projets core, 28 dossiers de plugins.

## Arborescence

```
github/
├── README.md                 (FrostyToolsuite — setup VS2019, x64, DeveloperDebug)
├── FrostyCmd/                CLI historique
├── FrostyControls/           Contrôles WPF partagés
├── FrostyEditor/
│   ├── FrostyEditor.sln
│   ├── App.xaml / App.xaml.cs
│   ├── Commands/             Actions éditables (menu/ruban)
│   ├── Extensions/           Extensions utilitaires
│   ├── Windows/              MainWindow, About, KeyPrompt, ModSettings,
│   │                         PatchSummary, PrelaunchWindow2, Splash
│   ├── Themes/ ThirdParty/ Images/ Resources/ Shaders/
│   ├── DiscordRPC.cs         Présence Discord (historique)
│   ├── FileUnblocker.cs
│   └── Credits.txt           Attributions (Json.NET, SharpDX…)
├── FrostyHash/               Hachage Fnv Frostbite
├── FrostyModManager/         Gestionnaire de mods (activation, ModData)
├── FrostyModSupport/
│   ├── Actions/              Actions d'application de mods
│   ├── FrostyLegacy.cs       Mods legacy (format ancien)
│   └── FrostyModExecutor.cs  Exécution/application des mods
├── FrostyPlugin/             FrostyCore — interface de plugins, host
├── FrostySdk/
│   ├── Profiles.bin + Profiles/   25 profils SDK (DLL par jeu)
│   ├── BaseProfile/  Converters/  Deobfuscators/
│   ├── Ebx/  (AssetClassGuid, PointerRef, ResourceRef, TypeRef…)
│   ├── IO/   (EbxReader/EbxWriter, DbReader/DbWriter, BitReader,
│   │          BinarySbReader, CasReader, CatReader, NativeReader/Writer)
│   ├── Managers/ (AssetManager, KeyManager, ResourceManager, Loaders)
│   ├── Resources/ (Resource.cs)
│   ├── Profile.cs  ProfileVersion.cs  ProfilesLibrary.cs  TypeLibrary.cs
│   ├── DbObject.cs  FileSystem.cs  FileSystemSource.cs  Sha1.cs  Utils.cs
├── Plugins/                  28 dossiers — voir frosty-plugin-inventory.md
└── Shaders/                  Shaders de preview
```

## Profils SDK (25) — jeu → DLL

`AnthemSDK`, `BF1SDK`, `BF4SDK`, `BFHSDK`, `BFVSDK`, `DragonAgeSDK`, `FIFA19SDK`, `FIFA20SDK`, `Fifa17SDK`, `Fifa18SDK`, `MADDEN19SDK`, `MADDEN20SDK`, `MassEffectSDK`, `MirrorsEdgeSDK`, **`NFS14SDK`**, **`NFS16SDK`**, `NFS17SDK`, `NFSEDGESDK`, `NFSHEATSDK`, `PVZ1SDK`, `PVZ2SDK`, `PVZ3SDK`, `SWSSDK`, `StarWarsIISDK`, `StarWarsSDK`.

**NFS 2015** = `NFS16SDK` (exe `nfs16.exe`) → cible de validation e2e (§58).

## Dépendances externes remarquées

- Json.NET (MIT, crédité), SharpDX (MIT, crédité) ;
- Cibles : .NET Framework / WPF (Windows-only) ;
- La réécriture .NET 8 vise Avalonia + MVVM Community Toolkit (cross-platform, précoce).

## Ce que ZAILON réutilise (conceptuellement)

`AssetManager`, parsers EBX/RES/chunks/bundles, `EbxWriter` (perfs), `KeyManager`, `ProfilesLibrary`, `FrostyModExecutor`/`FrostyLegacy`, plugin host. Aucun code copié (§87-89).
