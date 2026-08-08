# Fix du bug de durée « 29770249211h 15m »

> Spec : « Correctif urgent lancement NTE + simplification totale du bouton
> Jouer » §12-15. Livré dans la **1.21.1**.

## 1. Cause exacte

`formatTime(minutes)` attend une durée en **minutes**. Plusieurs appels lui
passaient un **timestamp epoch en millisecondes** (ex. `testedAt`,
`startedAt`, `step.at`).

`29770249211h 15m` = un timestamp ~1,78×10¹² ms passé comme « minutes » :
`Math.floor(1_786_214_924_117 / 60) = 29 770 249 235` heures. C'est exactement
la valeur observée.

## 2. Correction

Trois fonctions distinctes avec des unités typées (`src/utils/index.ts`) :

| Fonction | Entrée | Sortie |
|---|---|---|
| `formatTime(minutes)` | minutes (playtime réel) | `2h 14m` |
| `formatClock(ms)` | timestamp epoch **ms** | `14:05` (heure d'horloge) |
| `formatElapsedDuration(startMs, nowMs)` | deux horodatages ms | `2h 14m` / `1j 3h` |

Garde-fous (spec §13) :

- `formatTime` : NaN / Infinity / négatif / > 1 an → `''` (rien d'affiché) ;
- `formatClock` : valeur invalide → `'—'` ;
- `formatElapsedDuration` : durée négative (futur), NaN, Infinity, > 1 an →
  `''` + `console.error` (diagnostic développeur uniquement, jamais à l'UI).

Appels corrigés (timestamp → `formatClock`) :

- `GameConfigurationPanel.tsx` — « vérifié à ${testedAt} » (le message exact du
  bug rapporté) ;
- `GameDiagnosticPanel.tsx` — 5 affichages (`startedAt`, `step.at`, `run.at`,
  `item.at`, `item.startedAt`).

## 3. Tests (`test-duration-format.ts`, 4 tests)

- plages : 0 ms, 500 ms, 10 s, 59 s, 60 s, 2 min, 59 min, 1 h, 23 h, 24 h,
  2 jours, `1h 14min` ;
- invalides : futur, NaN, Infinity, > 1 an → `''` ;
- régression bloquante : `formatElapsedDuration(0, 1_786_214_924_117)` ne peut
  plus jamais produire `29770249211h 15m` ;
- `formatClock` : `14:05`, invalides → `'—'`.

## 4. Leçon

Un formateur de durée ne reçoit **jamais** un timestamp absolu. Le typage est
dans le nom de la fonction : `Time`/`Elapsed` pour les timestamps, `minutes`
pour les minutes — et les garde-fous neutralisent toute régression silencieuse.
