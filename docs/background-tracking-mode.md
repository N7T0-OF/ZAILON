# Suivi en arrière-plan — sessions persistées & démarrage discret

Spec « Accueil modulaire » §34-52, §90-91, §114-118. Livré en **1.89.0**.

## 1. Source de vérité : `sessionHistory` persistée

Le moteur de statistiques ne calcule plus rien depuis les seules sessions de
l'exécution courante. La source de vérité est **l'historique PERSISTÉ des
sessions terminées** (`TrackedSession[]`, store → disque via la migration v5) :

```ts
interface TrackedSession {
  id, gameId, gameName, profileId, profileName  // noms en SNAPSHOT (§99-100)
  startedAt, endedAt, durationMin
  source        // 'zailon' | 'external' | 'recovered' (§36)
  recovered?    // session interrompue récupérée au boot (§45)
}
```

- **Commit définitif** à la fin de chaque session (`stopPlaying`) : durée réelle
  en minutes, source héritée de la session native (externe = lancée hors
  ZAILON). Les playtimes par jeu/profil (`totalPlaytime`, `profile.playtime`)
  sont conservés et cohérents.
- **Checkpoints** (§44) : toutes les ~5 min (`tick`), `activeTrackedSession`
  est persistée avec son `checkpointAt`.
- **Récupération** (§45) : au démarrage, `recoverInterruptedSession()` archive
  une session restée « ouverte » après un crash de ZAILON — durée =
  `checkpointAt - startedAt`, marquée `recovered`. Si le jeu tourne encore, le
  watcher rétablit une nouvelle session live : les plages temporelles ne se
  chevauchent jamais (pas de double comptage).

## 2. Réglages de suivi (Paramètres → Suivi & démarrage discret, §114-117)

| Réglage | Effet |
| --- | --- |
| `trackPlaytime` | Suivre le temps d'utilisation. OFF = aucune session archivée. |
| `trackExternalApps` | Scanner les jeux lancés hors ZAILON (Steam, launcher…). OFF = le scan externe du watcher est coupé (`App.tsx`), les sessions ZAILON restent suivies. |
| `startWithSystem` | Démarrage avec le système (registre `HKCU\...\Run` sous Windows, LaunchAgent macOS, `~/.config/autostart` Linux). |
| `startDiscreet` | Lancement avec `--background` : fenêtre principale cachée, seul le tracking tourne. Implique `startWithSystem`. |

**Cohérence** : `setTrackingSettings` propage la logique (discret ⇒ démarrage
système ; retirer le démarrage système désactive le discret) et appelle le
natif `set_autostart` immédiatement — sans redémarrage.

## 3. Démarrage discret (`--background`)

- **Rust** : `BACKGROUND_MODE` lu dans les arguments ; en setup, la fenêtre
  `main` est cachée (`window.hide()`). Le webview continue de tourner : le
  process watcher, le session tracker et les add-ons runtime restent actifs
  sans UI visible (§41).
- **Rouvrir ZAILON** (§42) : un second lancement **sans** `--background`
  (double-clic icône, exécution normale) ramène la fenêtre au premier plan
  (single-instance → `show` + `unminimize` + `set_focus`).
- `background_mode()` : l'UI peut interroger le mode (usage futur : sauter les
  initialisations lourdes en phase 2).

## 4. Page Statistiques (phase 2)

- Totaux depuis `summarizeSessions` (total, sessions, dernière, récupérées).
- **7 derniers jours** : barres `dailyBreakdown` (Aujourd'hui / Hier / dates).
- Par jeu (`perGame`, session live marquée « ● En cours ») et par profil
  (`perProfile`) — agrégats purs dans `lib/sessionStats.ts`, testés sous
  `node --test` (`test-session-stats.ts`).
- **Exporter** (§50) : CSV (tableur) ou JSON (sauvegarde), téléchargement
  local, sans compte.
- **Réinitialiser** (§52) : par jeu ou tout l'historique, confirmation forte.

## 5. Limites / phase suivante

- Le mode `--background` cache la fenêtre mais garde la WebView (RAM modeste).
  « Sans WebView » (agent natif pur) reste une optimisation future.
- Pas encore : heatmap (§48), temps importés Steam dans la page (§96), toast
  « Suivi par ZAILON » en mode background (§120), hotkey Quick Panel en
  background (§121).
