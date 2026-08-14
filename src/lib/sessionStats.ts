/**
 * Statistiques de sessions — agrégats PURS (spec « Accueil modulaire »
 * §30-32, §46-49, §90). Aucun accès DOM ni store : testable sous node --test.
 * La source de vérité est l'historique PERSISTÉ des sessions terminées
 * (`TrackedSession`) ; l'exécution courante n'ajoute que les sessions en
 * cours/terminées non encore archivées.
 */

import type { TrackedSession } from '../types'

export interface SessionSummary {
  /** Temps total comptabilisé, en MINUTES. */
  totalMinutes: number
  /** Nombre de sessions archivées. */
  sessionCount: number
  /** Sessions de l'exécution courante (non encore archivées). */
  liveSessionCount: number
  /** Dernière session terminée (endedAt le plus récent). */
  lastSession?: TrackedSession
  /** Nombre de sessions récupérées après interruption (§45). */
  recoveredCount: number
}

/** Agrégats globaux sur un historique de sessions. */
export function summarizeSessions(history: TrackedSession[], liveCount = 0): SessionSummary {
  const sessions = [...history].sort((a, b) => b.endedAt - a.endedAt)
  return {
    totalMinutes: history.reduce((sum, session) => sum + (session.durationMin || 0), 0),
    sessionCount: history.length,
    liveSessionCount: liveCount,
    lastSession: sessions[0],
    recoveredCount: history.filter(session => session.recovered).length,
  }
}

/** Durée totale comptabilisée dans les N derniers jours (endedAt dans la fenêtre). */
export function minutesWithin(history: TrackedSession[], nowMs: number, days: number): number {
  const cutoff = nowMs - days * 24 * 60 * 60 * 1000
  return history
    .filter(session => session.endedAt >= cutoff)
    .reduce((sum, session) => sum + (session.durationMin || 0), 0)
}

/** Répartition par jour sur les N derniers jours — tableaux alignés date→minutes. */
export function dailyBreakdown(history: TrackedSession[], nowMs: number, days: number): Array<{ date: string; label: string; minutes: number }> {
  const byDay = new Map<string, number>()
  for (const session of history) {
    if (!session.durationMin) continue
    const day = startOfDay(session.endedAt)
    byDay.set(day, (byDay.get(day) ?? 0) + session.durationMin)
  }
  const out: Array<{ date: string; label: string; minutes: number }> = []
  for (let index = days - 1; index >= 0; index--) {
    const date = startOfDay(nowMs - index * 24 * 60 * 60 * 1000)
    out.push({ date, label: dayLabel(date, index), minutes: byDay.get(date) ?? 0 })
  }
  return out
}

/** Agrégats PAR JEU (spec §31) : temps, sessions, dernière session. */
export function perGame(history: TrackedSession[], liveSessions: Array<{ gameId: string; startedAt: number }> = []): Array<{
  gameId: string
  gameName: string
  minutes: number
  sessions: number
  live: boolean
  lastEndedAt?: number
}> {
  const map = new Map<string, { gameId: string; gameName: string; minutes: number; sessions: number; live: boolean; lastEndedAt?: number }>()
  for (const session of history) {
    const entry = map.get(session.gameId) ?? { gameId: session.gameId, gameName: session.gameName, minutes: 0, sessions: 0, live: false }
    entry.minutes += session.durationMin || 0
    entry.sessions += 1
    if (!entry.lastEndedAt || session.endedAt > entry.lastEndedAt) entry.lastEndedAt = session.endedAt
    map.set(session.gameId, entry)
  }
  for (const live of liveSessions) {
    const entry = map.get(live.gameId) ?? { gameId: live.gameId, gameName: live.gameId, minutes: 0, sessions: 0, live: false }
    entry.live = true
    map.set(live.gameId, entry)
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes || (b.lastEndedAt ?? 0) - (a.lastEndedAt ?? 0))
}

/** Répartition PAR PROFIL pour un jeu (spec §32, §49). */
export function perProfile(history: TrackedSession[], gameId: string): Array<{ profileId: string; profileName: string; minutes: number; sessions: number }> {
  const map = new Map<string, { profileId: string; profileName: string; minutes: number; sessions: number }>()
  for (const session of history) {
    if (session.gameId !== gameId) continue
    const entry = map.get(session.profileId) ?? { profileId: session.profileId, profileName: session.profileName, minutes: 0, sessions: 0 }
    entry.minutes += session.durationMin || 0
    entry.sessions += 1
    map.set(session.profileId, entry)
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes)
}

/** Cellule de la heatmap (spec §48) : un jour, sa durée en minutes et son
 * niveau 0-4 (teinte de la cellule — jamais de librairie graphique). */
export interface HeatmapCell {
  /** Date locale YYYY-MM-DD. */
  date: string
  minutes: number
  level: number
}

function heatmapLevel(minutes: number): number {
  if (minutes <= 0) return 0
  if (minutes < 30) return 1
  if (minutes < 120) return 2
  if (minutes < 300) return 3
  return 4
}

/** Heatmap de contribution (spec §48) : N semaines, colonnes = semaines
 * (lundi en premier), lignes = lundi→dimanche, les jours futurs sont omis.
 * Logique pure — la teinte est calculée ici, le rendu reste léger (div). */
export function heatmapCells(history: TrackedSession[], nowMs: number, weeks = 12): HeatmapCell[] {
  const byDay = new Map<string, number>()
  for (const session of history) {
    if (!session.durationMin) continue
    const day = startOfDay(session.endedAt)
    byDay.set(day, (byDay.get(day) ?? 0) + session.durationMin)
  }
  // Lundi de la semaine courante (ancrage local, cohérent avec startOfDay).
  const monday = new Date(nowMs)
  monday.setHours(0, 0, 0, 0)
  const dow = (monday.getDay() + 6) % 7 // 0 = lundi
  monday.setDate(monday.getDate() - dow)
  const cells: HeatmapCell[] = []
  for (let week = weeks - 1; week >= 0; week--) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const day = new Date(monday)
      day.setDate(monday.getDate() - week * 7 + dayIndex)
      if (day.getTime() > nowMs) continue
      const date = startOfDay(day.getTime())
      const minutes = byDay.get(date) ?? 0
      cells.push({ date, minutes, level: heatmapLevel(minutes) })
    }
  }
  return cells
}

/** Checkpoint dû ? (spec §44 : toutes les ~5 minutes). */
export function checkpointDue(lastCheckpointAt: number | undefined, nowMs: number, intervalMs = 5 * 60 * 1000): boolean {
  if (lastCheckpointAt === undefined) return false
  return nowMs - lastCheckpointAt >= intervalMs
}

function startOfDay(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dayLabel(date: string, daysAgo: number): string {
  if (daysAgo === 0) return 'Aujourd’hui'
  if (daysAgo === 1) return 'Hier'
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}
