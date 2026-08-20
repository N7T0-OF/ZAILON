# SDK d'extensions ZAILON

Spécification : Add-ons §19, §24-28, §69-71 — API stable, permissions,
isolation, lazy loading.

## Principes

- **API publique versionnée** : les add-ons passent par des interfaces
  publiques (`Addon API v1`), jamais par les composants internes privés
  (§24-25).
- **Permissions à l'appel** : chaque service est filtré par les permissions du
  manifest — un add-on aux permissions minimales s'active et n'échoue que s'il
  utilise réellement un service non couvert (§11-13).
- **Lazy loading** : un add-on est chargé (loaded) puis activé (active)
  uniquement au premier besoin — jamais au démarrage (§19, §69).
- **Isolation** : un handler d'événement fautif, une activation en erreur ou
  un crash ne bloquent jamais ZAILON — le crash guard désactive le module
  fautif après 2 échecs (§21).

## Interfaces publiques (src/lib/addonSdk.ts)

| Élément | Rôle |
| --- | --- |
| `GameService` / `ProfileService` / `ModService` / `LaunchService` / `SettingsService` / `ProviderService` / `UIExtensionService` | Surfaces minimales exposées (§25) |
| `assertServicePermission` | Gate : service → permission requise (launch → `game.launch`, provider → `provider`, ui → `ui.extend`, storage → `settings`…) |
| `createAddonEventBus` | Bus d'événements isolé — un handler fautif n'arrête jamais les autres |
| `assertLazyEvents` / `isLazyEvent` | `OnZailonStarted` restreint ; les événements à la demande sont la règle (§69) |
| `UiExtensionRegistry` | Slots UI fixes (§26-27), un par add-on, libérés à la désactivation |
| `AddonLifecycle` | idle → loaded → active → error/disabled ; crash guard intégré ; deactivate libère les extensions, données intactes |
| `StartupContributionMonitor` | Rapport core vs add-ons au démarrage (§68) |
| `createAddonApi` | Construction de l'API versionnée avec gate, stockage séparé (données ≠ code, §16) et log |

## Contrat d'un module add-on

```ts
interface AddonModule {
  activate(api: ZailonAddonApi): void | Promise<void>
  deactivate?(): void | Promise<void>
}
```

Le `manifest.entrypoint` pointe vers ce module. La machinerie (gate, bus,
registres, cycle de vie) est pure et testable sans exécuter de code add-on —
l'exécution réelle des modules depuis le disque arrivera avec le chargeur natif
(sandbox).

## État actuel / limites

- Contrats, gate, bus, slots, cycle de vie et monitoring sont en place et
  testés (8 tests).
- Le chargement réel des modules depuis `addons/installed/<id>` (évaluation en
  sandbox, hot reload en Dev Mode §57-58) et l'injection des services Core
  arrivent dans une prochaine mise à jour.
