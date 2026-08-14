# Statistiques — page et moteur

Spec « Accueil modulaire » §25-52, §90-91, §96-100. Phase 1 livrée en
**1.88.0**, phase 2 (historique persistant + agrégats) en **1.89.0**.

## Page Statistiques

Ouverte depuis le widget « Vos statistiques » de l'Accueil (`Voir toutes les
statistiques`, §28). **Pas d'entrée permanente dans la Sidebar** (§29). Vue
`statistics`, rendue par `StatisticsView.tsx`.

- **Totaux** (§30) : temps total suivi (sessions archivées + session en cours),
  nombre de sessions (avec compteur des récupérées), jeu le plus joué, cette
  semaine.
- **7 derniers jours** (§47) : barres SVG/CSS légères (`dailyBreakdown`) —
  Aujourd'hui, Hier, puis `jj/mm`. Aucune bibliothèque graphique (§47).
- **Par jeu** (§31) : temps, nombre de sessions, dernière session, badge
  « ● En cours » pour une session live, bouton vers la page jeu.
- **Par profil** (§32, §49) : barre de répartition `Default / Photo /
  Performance…` avec durée. L'UI résout les noms actuels ; un profil supprimé
  apparaît sous son nom sauvegardé (snapshot, §99-100).
- **Apps** (§33) : les applications ajoutées à la Bibliothèque (`software`)
  sont suivies comme les jeux, y compris lancées hors ZAILON (§35-36).
- **Exporter** (§50) : CSV (tableur) ou JSON (sauvegarde), local.
- **Réinitialiser** (§52) : par jeu ou tout, avec confirmation forte.

## Moteur — `lib/sessionStats.ts` (pur, testé)

Sources : **`sessionHistory` persistée** (`TrackedSession[]`, source de
vérité), complétée par la session en cours (`activeTrackedSession`) et les
sessions live de l'exécution.

- `summarizeSessions` : total (minutes), compteurs, dernière, récupérées.
- `minutesWithin(history, now, days)` : fenêtres 7/30 jours (§46).
- `dailyBreakdown` : tableaux alignés date→minutes sur N jours.
- `perGame` / `perProfile` : agrégats triés avec sessions live.
- `checkpointDue` : cadence des checkpoints (§44, ~5 min).

## Cycle de vie d'une session (§44-45)

1. `beginSession` / `attachDetectedGame` / `attachGameSession` /
   `prepareAndWait` → `activeTrackedSession` posée (début).
2. `tick` (chaque seconde) → checkpoint persisté toutes les ~5 min.
3. `stopPlaying` (fin réelle) → `TrackedSession` archivée, `durationMin`
   réel, source héritée de la session native.
4. Crash de ZAILON → au prochain boot `recoverInterruptedSession` archive la
   session restée ouverte avec son dernier checkpoint (`recovered: true`) ;
   si le jeu tourne encore, le watcher rétablit une session live — plages
   disjointes, jamais de double comptage.

## Confidentialité et temps tiers

- **Confidentialité** (§51) : données 100 % locales, aucun serveur, aucun
  compte, aucune télémétrie. Réglage `trackPlaytime` OFF = aucun suivi (§114).
- **Temps tiers** (§96) : jamais fusionné silencieusement — un add-on Steam
  afficherait « Suivi ZAILON : 128 h / Steam : 342 h » séparément.

## Limites actuelles (phase 2)

- Pas encore : heatmap (§48), stats applications par type (vue Jeux / Apps /
  Tout, §97), recherche/tri avancés (§98), toast « Suivi par ZAILON » en mode
  background (§120), agent natif sans WebView (§41, phase 3).
