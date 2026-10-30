# Frosty — Ancienne vs nouvelle architecture

> Spec §8. Comparaison réelle entre la branche historique locale (1.0.6, WPF) et la
> réécriture officielle .NET 8 / Avalonia (précoce).

## Ancienne branche (locale, 1.0.6)

| Aspect | Valeur |
| ------ | ------ |
| Runtime | .NET Framework (WPF) |
| UI | WPF/XAML, `MainWindow`, `Windows/`, `Themes/` |
| Architecture | Monolithique par projets ; SDK/Editor/ModManager/ModSupport séparés mais liés |
| Plugins | `FrostyPlugin` (FrostyCore) + 29 plugins dans `Plugins/` |
| Profils | 25 profils SDK (DLL par jeu) dans `FrostySdk/Profiles` |
| Plateformes | Windows uniquement |
| État | **Fonctionnel** (base éprouvée pour l'édition réelle) |

## Réécriture moderne (FrostyToolsuite/FrostyToolsuite)

| Aspect | Valeur |
| ------ | ------ |
| Runtime | .NET 8 |
| UI | Avalonia + MVVM Community Toolkit |
| Architecture | Séparation core/UI, services, modèles — plus propre, cross-platform visé |
| CLI | `FrostyCmd` (réécrite) |
| État | **Développement précoce** — CLI only, pas d'UI fonctionnelle complète |
| Licence | GPL-3.0 |

## Ce que ZAILON reprend conceptuellement

- **Séparation core/UI** : le Worker isole SDK/plugins des parsers lourds de l'UI ZAILON ;
- **Services** : `ZailonFrostyEditorBridge` = couche d'API stable (openProject,
  searchAssets, buildMod…) — exactement l'esprit de la réécriture moderne ;
- **Abstractions cross-platform** : le bridge est agnostique, seul le backend réel
  (runtime Frosty Windows) fixe les plateformes supportées (§85-86).

## Ce que ZAILON ne fait pas

- Ne pas basculer sur la réécriture (précoce, non fonctionnelle) ;
- Ne pas réimplémenter les formats à partir de suppositions (§6) ;
- Ne pas copier l'UI WPF ni le code (licence, voir frosty-license-audit.md).

## Stratégie

**Backend éprouvé (1.0.6) piloté via runtime externe + architecture moderne inspirée de
la réécriture** : le meilleur des deux, sans la dette WPF ni la précoce.
