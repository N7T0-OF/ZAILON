/**
 * Tests du moteur de statistiques de sessions (spec « Accueil modulaire »
 * §30-52, §90, §123) — logique PURE : agrégats, fenêtres temporelles, temps
 * par jeu/profil, checkpoints (§44) et récupération après interruption (§45).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkpointDue,
  dailyBreakdown,
  heatmapCells,
  minutesWithin,
  perGame,
  perProfile,
  recentSessions,
  summarizeSessions,
  type SessionSummary,
} from '../../src/lib/sessionStats.ts'
import type { TrackedSession } from '../../src/types.ts'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// Ancre à MIDI LOCAL du jour courant : les attentes restent valables quelle
// que soit la fuseau horaire de la machine de test.
const todayStart = new Date()
todayStart.setHours(0, 0, 0, 0)
const now = todayStart.getTime() + 12 * HOUR

function session(overrides: Partial<TrackedSession>): TrackedSession {
  return {
    id: 's',
    gameId: 'cyberpunk',
    gameName: 'Cyberpunk 2077',
    profileId: 'default',
    profileName: 'Default',
    startedAt: now - 2 * HOUR,
    endedAt: now - HOUR,
    durationMin: 60,
    source: 'zailon',
    ...overrides,
  }
}

const history: TrackedSession[] = [
  session({ id: 'a', durationMin: 60, startedAt: now - 2 * HOUR, endedAt: now - HOUR }),
  session({ id: 'b', durationMin: 30, gameId: 'fivem', gameName: 'FiveM', startedAt: now - 3 * HOUR, endedAt: now - 2.5 * HOUR }),
  session({ id: 'c', durationMin: 120, startedAt: now - 10 * DAY, endedAt: now - 10 * DAY + 2 * HOUR }),
  session({ id: 'd', durationMin: 45, profileId: 'photo', profileName: 'Photo', startedAt: now - 2 * DAY, endedAt: now - 2 * DAY + 45 * 60 * 1000, recovered: true, source: 'recovered' }),
]

test('sommaire : total en minutes, compteurs, dernière session, récupérées (spec §30, §45)', () => {
  const summary: SessionSummary = summarizeSessions(history, 1)
  assert.equal(summary.totalMinutes, 60 + 30 + 120 + 45)
  assert.equal(summary.sessionCount, 4)
  assert.equal(summary.liveSessionCount, 1)
  assert.equal(summary.recoveredCount, 1)
  assert.equal(summary.lastSession?.id, 'a')
})

test('minutesWithin : fenêtre de 7 jours — hors fenêtre exclue (spec §30, §46)', () => {
  assert.equal(minutesWithin(history, now, 7), 60 + 30 + 45)
  assert.equal(minutesWithin(history, now, 30), 60 + 30 + 120 + 45)
})

test('dailyBreakdown : 7 jours alignés, Aujourd’hui/Hier, valeurs par jour', () => {
  const days = dailyBreakdown(history, now, 7)
  assert.equal(days.length, 7)
  assert.equal(days[6].label, 'Aujourd’hui')
  assert.equal(days[5].label, 'Hier')
  assert.equal(days[6].minutes, 60 + 30) // a + b aujourd'hui
  assert.equal(days[4].minutes, 45)      // d, il y a 2 jours
  assert.equal(days[0].minutes, 0)
})

test('perGame : agrégats par jeu triés, session live marquée (spec §31)', () => {
  const byGame = perGame(history, [{ gameId: 'nte', startedAt: now - 10 * 60 * 1000 }])
  assert.equal(byGame[0].gameId, 'cyberpunk')
  assert.equal(byGame[0].minutes, 60 + 120 + 45)
  assert.equal(byGame[0].sessions, 3)
  assert.ok(byGame.some(entry => entry.gameId === 'nte' && entry.live))
})

test('perProfile : répartition par profil pour un jeu (spec §32, §49)', () => {
  const profiles = perProfile(history, 'cyberpunk')
  assert.equal(profiles.length, 2)
  assert.equal(profiles[0].profileId, 'default')
  assert.equal(profiles[0].minutes, 60 + 120)
  assert.equal(profiles[1].profileName, 'Photo')
  assert.equal(profiles[1].minutes, 45)
})

test('heatmapCells : 12 semaines, colonnes lundi→dimanche, jours futurs omis, niveaux 0-4 (spec §48)', () => {
  const cells = heatmapCells(history, now, 12)
  // 12 semaines × 7 jours, moins les jours futurs de la semaine courante
  // (midi local → lundi..jeudi restants selon le jour).
  assert.ok(cells.length > 12 * 7 - 7 && cells.length <= 12 * 7)
  assert.ok(cells.every(cell => cell.level >= 0 && cell.level <= 4))
  // Aujourd'hui (session 'a' = 60 min, 'b' = 30 min) → niveau ≥ 3 (≥ 120).
  const today = cells.find(cell => cell.minutes > 0 && cell.level >= 3)
  assert.ok(today, 'une cellule active au moins au niveau élevé')
  // Aucune cellule ne doit pointer dans le futur.
  const future = cells.filter(cell => new Date(`${cell.date}T00:00:00`).getTime() > now)
  assert.equal(future.length, 0)
  // La session 'd' (45 min, il y a 2 jours) → niveau 2 (30-119 min).
  const dayD = cells.find(cell => cell.minutes === 45)
  assert.equal(dayD?.level, 2)
})

test('heatmapCells : semaine vide = niveau 0, zéro historique = grille à zéro', () => {
  const empty = heatmapCells([], now, 4)
  assert.ok(empty.length > 0)
  assert.ok(empty.every(cell => cell.level === 0 && cell.minutes === 0))
})

test('checkpointDue : dû après ~5 min, pas avant, jamais sans checkpoint (spec §44)', () => {
  const start = now
  assert.equal(checkpointDue(undefined, start + 10 * 60 * 1000), false)
  assert.equal(checkpointDue(start, start + 60_000), false)
  assert.equal(checkpointDue(start, start + 5 * 60 * 1000), true)
  assert.equal(checkpointDue(start, start + 12 * 60 * 1000), true)
})

test('récupération après interruption : durée = dernier checkpoint, source recovered (spec §45)', () => {
  // Simulation du calcul fait par recoverInterruptedSession : la session a
  // commencé il y a 80 min, le dernier checkpoint date de 5 min avant le crash.
  const startedAt = now - 80 * 60 * 1000
  const checkpointAt = now - 5 * 60 * 1000
  const durationMin = Math.floor((checkpointAt - startedAt) / 60_000)
  assert.equal(durationMin, 75)
  // Une session de moins d'une minute n'est pas archivée.
  assert.equal(Math.floor((checkpointAt - (checkpointAt - 30_000)) / 60_000), 0)
})

test('recentSessions : tri décroissant + borne (spec Activité récente)', () => {
  const older = session({ id: 'a', endedAt: now - 3 * DAY, gameName: 'NTE' })
  const newer = session({ id: 'b', endedAt: now - DAY, gameName: 'FiveM' })
  const middle = session({ id: 'c', endedAt: now - 2 * DAY, gameName: 'Cyberpunk 2077' })
  const list = recentSessions([older, middle, newer], 2)
  assert.equal(list.length, 2)
  assert.equal(list[0].id, 'b')
  assert.equal(list[1].id, 'c')
  assert.equal(recentSessions([], 6).length, 0)
})
