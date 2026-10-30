# État Installer / Désinstaller synchronisé (Explorer)

> ZAILON — spec « Persistance globale + Accent + Partage », §15-23.
> Livré en **1.63.0**.

## Problème corrigé

Un mod installé correctement (ex. GameBanana) laissait le bouton Explorer sur
« Installer » : l'UI devinait l'état depuis la carte locale et ne savait pas que
le package installé provenait de ce mod distant. Après refresh ou redémarrage,
l'état redevenait incohérent.

## Règle d'architecture

Explorer **ne devine pas** l'état d'installation : il le **dérive** de la vérité
canonique (les packages locaux installés + la référence distante attachée).

```
download → install → create package → attach externalReference
→ commit → emit RemoteModInstalled → toutes les vues se mettent à jour
```

## Source canonique

`src/lib/remoteInstallState.ts` (logique pure, testée) :

- **Identité distante** : `(provider, remoteModId, fileId?)` — l'identifiant
  stable d'un mod chez son fournisseur.
- **`remoteInstallState(localPackages, remoteRef)`** : dérive l'état parmi
  `install` / `installed` / `update-available` / `installing` / `removing` /
  `error`. Un mod est « Installé » si un package local porte sa référence
  distante et que ses fichiers existent.
- **`remoteIdentityFromCatalog`** : normalise les identifiants selon le
  provider (Nexus `mod_id`, GameBanana `item_id`…).

## Flux

- `installMod` (store) : installe le package **et attache la référence distante**
  (`externalReference`) — l'état survit au redémarrage et au changement de profil.
- `uninstallRemoteMod(provider, remoteModId, fileId, mode)` :
  - `mode = 'current'` : détache/supprime du profil actif uniquement ;
  - `mode = 'all'` : supprime physiquement de tous les profils ;
  - émet la synchronisation, le bouton redevient « Installer ».
- Pendant l'opération : clés transitoires `installingRemote` / `removingRemote`
  (bouton désactivé + « Installation… », pas de double clic).

## UI

- Bouton **Installer** : fond accent.
- Bouton **Désinstaller** : fond `--zailon-danger` (rouge).
- Mod utilisé par plusieurs profils : dialogue avec
  « Retirer du profil actuel » / « Désinstaller complètement » / « Annuler ».
- Aucun refresh manuel nécessaire (spec §18).

## Providers couverts

Nexus Mods, GameBanana, CurseForge (spec §23) — même logique partout,
pas de recodage par page.

## Validation

- `tsc` ✅, build ✅, 5 tests dédiés (`test-remote-install-state.ts`),
  suite complète ✅, Verify native + Verify ZAILON ✅.
