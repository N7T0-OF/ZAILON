# Architecture Add-ons

Spécification : « ZAILON — Nouvelle architecture Add-ons » (§1-83).

## Principe

ZAILON CORE reste **petit, rapide, offline-first et indépendant** : Accueil,
Bibliothèque, Profils, Lancement, Détection processus, Mod Store/VFS générique,
Explorer essentiel, Paramètres, Update, Add-on Manager.

Les fonctionnalités spécialisées deviennent des **Add-ons** installables à la
demande — jamais bundlés dans l'installeur (§1). Une installation neuve ne
télécharge aucun add-on.

## Règles fondamentales

- **IDs immuables** : le nom peut changer, l'ID jamais (§10).
- **Permissions explicites** : un add-on n'accède jamais à tout le PC ; les
  add-ons officiels passent par le même système (§11-13).
- **Pas de marketplace** : aucun compte, commentaires, likes, modération ou
  serveur communautaire — les add-ons communautaires s'importent localement
  (§7-8).
- **Lazy loading** : aucun add-on chargé au démarrage simplement parce qu'il
  est installé ; chargé uniquement à l'ouverture du jeu concerné, à l'import
  d'un fichier lié ou au lancement (§19, §69).
- **Crash isolation** : un add-on qui crash est désactivé automatiquement
  (2 crashs) ; plusieurs crashs au boot → Safe Mode (§21-22).
- **Installation atomique** : download → temp → verify → staging → swap →
  health check → cleanup, avec rollback (§15, §65).
- **Désinstallation sûre** : jamais de suppression silencieuse si des add-ons
  dépendent ; les données utilisateur (addon-data) sont conservées par défaut
  (§17, §33).

## Fichiers / architecture

| Fichier | Rôle |
| --- | --- |
| `src/lib/addons.ts` | Manifest, IDs, permissions, compatibilité, catalogue validé + seed officiel, hash, dépendances/cycles, crash guard, safe mode, événements lazy, plan d'installation, tailles — **logique pure, 17 tests** |
| `src/components/Views/AddonsView.tsx` | Vue Add-ons : recherche, filtres, grille, dialogue d'installation (permissions/dépendances/compatibilité), désinstallation sûre, import communautaire |
| `src/store/useStore.ts` | Slice `addons` persisté + actions `installAddon` / `uninstallAddon` / `setAddonEnabled` / `importAddonManifest` |

## Catalogue officiel

`OFFICIAL_ADDON_CATALOG` (15 entrées, Phase 1-3 du §79) sert de **cache hors
ligne** (§6) : Frosty Support, ReShade Manager, Discord Presence, Nexus /
GameBanana / CurseForge Providers, Cyberpunk Advanced, NTE Support, FiveM
Profiles, MO2 / Vortex / Frosty Importers, Steam Advanced, Artwork+, Theme
Packs, Performance+. En production, `catalog.json` sera téléchargé depuis le
repository officiel — jamais les add-ons eux-mêmes, et **jamais de
téléchargement automatique** (§76).

## État actuel / limites

- La vue Add-ons, les contrats (manifest, permissions, compatibilité,
  dépendances, crash guard, plan atomique) et l'import communautaire local
  sont en place.
- Le téléchargement réel depuis le catalogue (avec vérification SHA-256 et
  signature), le SDK d'extensions (interfaces publiques Game/Profile/Mod/
  Launch/UIExtension, §25-28), le chargement réel des modules, le
  `zailon-addon-template` GitHub et la documentation `docs/addon-development/`
  arrivent dans les prochaines mises à jour.
- Frosty et ReShade restent dans le Core cette version ; leur migration en
  add-ons officiels (`official.zailon.frosty`, `official.zailon.reshade`) est
  planifiée.
