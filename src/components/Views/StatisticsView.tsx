import { ArrowLeft, BarChart3, Clock3, Download, Gamepad2, History, Timer, Trash2, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { formatElapsedDuration, formatTime, timeAgo } from '../../utils'
import { dailyBreakdown, minutesWithin, perGame, perProfile, summarizeSessions } from '../../lib/sessionStats'

/**
 * Page Statistiques (spec §29-52) — ouverte depuis le widget « Vos statistiques »
 * de l'Accueil, sans entrée permanente dans la Sidebar (§29). Données locales
 * uniquement (§51) : la source de vérité est l'historique PERSISTÉ des sessions
 * terminées (`sessionHistory`, checkpoints inclus §44-45) — les sessions en
 * cours de l'exécution courante s'ajoutent en direct. Aucun serveur, aucun compte.
 */
export function StatisticsView() {
  const sessionHistory = useStore(state => state.sessionHistory)
  const activeTrackedSession = useStore(state => state.activeTrackedSession)
  const gameSessions = useStore(state => state.gameSessions)
  const games = useStore(state => state.games)
  const setView = useStore(state => state.setView)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const resetSessionHistory = useStore(state => state.resetSessionHistory)
  const [exported, setExported] = useState<'csv' | 'json' | undefined>(undefined)
  const [exportOpen, setExportOpen] = useState(false)

  const now = Date.now()
  const liveSessions = gameSessions
    .filter(session => session.state === 'GameRunning')
    .map(session => ({ gameId: session.gameId, startedAt: session.startedAt }))

  const summary = useMemo(() => summarizeSessions(sessionHistory, liveSessions.length), [sessionHistory, liveSessions.length])
  const weekMinutes = useMemo(() => minutesWithin(sessionHistory, now, 7), [sessionHistory, now])
  const weekSessionCount = useMemo(() => sessionHistory.filter(session => session.endedAt >= now - 7 * 24 * 60 * 60 * 1000).length, [sessionHistory, now])
  const days = useMemo(() => dailyBreakdown(sessionHistory, now, 7), [sessionHistory, now])
  const byGame = useMemo(() => perGame(sessionHistory, liveSessions), [sessionHistory, liveSessions])
  const mostPlayed = byGame[0]
  // Durée live (session en cours, non encore archivée) pour le total.
  const liveMinutes = useMemo(() => {
    if (!activeTrackedSession) return 0
    return Math.floor((now - activeTrackedSession.startedAt) / 60_000)
  }, [activeTrackedSession, now])
  const totalMinutes = summary.totalMinutes + (activeTrackedSession ? liveMinutes : 0)
  const maxDay = Math.max(1, ...days.map(day => day.minutes))

  const exportData = (format: 'csv' | 'json') => {
    const rows = sessionHistory
      .map(session => ({ ...session }))
      .sort((a, b) => a.startedAt - b.startedAt)
    const content = format === 'csv'
      ? ['date,jeu,profil,minutes,source,récupérée',
          ...rows.map(session => [
            new Date(session.startedAt).toISOString(),
            `"${session.gameName.replace(/"/g, '""')}"`,
            `"${session.profileName.replace(/"/g, '""')}"`,
            session.durationMin,
            session.source,
            session.recovered ? 'oui' : '',
          ].join(',')),
        ].join('\n')
      : JSON.stringify(rows, null, 2)
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `zailon-statistiques-${new Date().toISOString().slice(0, 10)}.${format}`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setExported(format)
    window.setTimeout(() => setExported(undefined), 2500)
  }

  return <div className="flex h-full min-h-0 flex-col bg-[#0a0c0c]">
    <header className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-4">
      <button type="button" onClick={() => setView('home')} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] bg-black/25 text-white/50 hover:bg-white/[0.07] hover:text-white" title="Retour à l’Accueil" aria-label="Retour à l’Accueil"><ArrowLeft size={13} /></button>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/30">Statistiques</p>
        <h1 className="mt-0.5 font-display text-lg font-bold text-white/90">Temps de jeu &amp; sessions</h1>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <button type="button" onClick={() => setExportOpen(open => !open)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-1.5 text-[11px] font-semibold text-white/60 hover:border-gold/25 hover:text-gold" title="Exporter l’historique"><Download size={12} />{exported ? (exported === 'csv' ? 'CSV exporté ✓' : 'JSON exporté ✓') : 'Exporter'}</button>
          {exportOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-white/[0.08] bg-[#101414] shadow-xl">
              <button type="button" onClick={() => { exportData('csv'); setExportOpen(false) }} className="block w-full px-3 py-2 text-left text-[11px] text-white/70 hover:bg-white/[0.06]">CSV (tableur)</button>
              <button type="button" onClick={() => { exportData('json'); setExportOpen(false) }} className="block w-full px-3 py-2 text-left text-[11px] text-white/70 hover:bg-white/[0.06]">JSON (sauvegarde)</button>
            </div>
          )}
        </div>
        <button type="button" onClick={() => { if (window.confirm('Réinitialiser TOUTES les statistiques ? Cette action est définitive (l’historique des sessions est supprimé localement).')) resetSessionHistory() }} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-1.5 text-[11px] font-semibold text-white/50 hover:border-red-300/25 hover:text-red-200" title="Réinitialiser toutes les statistiques"><Trash2 size={12} /></button>
      </div>
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto thin-scroll">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-5">
        {/* Totaux (spec §30) */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard icon={<Timer size={13} />} label="Temps total suivi" value={totalMinutes > 0 ? formatTime(totalMinutes) : '0h'} sub={activeTrackedSession ? 'session en cours incluse' : undefined} />
          <StatCard icon={<History size={13} />} label="Sessions" value={String(summary.sessionCount + summary.liveSessionCount)} sub={summary.recoveredCount ? `${summary.recoveredCount} récupérée(s)` : undefined} />
          <StatCard icon={<Trophy size={13} />} label="Le plus joué" value={mostPlayed ? mostPlayed.gameName : '—'} sub={mostPlayed && mostPlayed.minutes > 0 ? formatTime(mostPlayed.minutes) : undefined} />
          <StatCard icon={<Clock3 size={13} />} label="Cette semaine" value={weekMinutes > 0 ? formatTime(weekMinutes) : '0h'} sub={weekSessionCount ? `${weekSessionCount} session(s)` : undefined} />
        </div>

        {/* 7 derniers jours (spec §47) */}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">7 derniers jours</p>
          {days.every(day => day.minutes === 0)
            ? <p className="py-4 text-center text-[11px] text-white/34">Aucune activité suivie ces 7 derniers jours.</p>
            : <div className="flex h-24 items-end gap-1.5">
                {days.map(day => (
                  <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] text-white/26">{day.minutes > 0 ? formatTime(day.minutes) : ''}</span>
                    <div className="w-full rounded-t bg-[var(--zailon-accent)]/70 transition-all group-hover:bg-[var(--zailon-accent)]" style={{ height: `${Math.max(day.minutes > 0 ? 8 : 2, Math.round((day.minutes / maxDay) * 76))}px` }} />
                    <span className="text-[9px] text-white/30">{day.label}</span>
                  </div>
                ))}
              </div>}
        </section>

        {/* Par jeu (spec §31) avec répartition par profil (spec §32, §49) */}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.018]">
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-3">
            <BarChart3 size={13} className="text-white/30" />
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">Par jeu et par profil</p>
          </div>
          {byGame.length === 0
            ? <p className="px-4 py-8 text-center text-[11px] text-white/34">Aucune session suivie pour l’instant. Lancez un jeu depuis ZAILON (ou hors ZAILON si le suivi externe est activé) pour commencer.</p>
            : <ul className="divide-y divide-white/[0.04]">
                {byGame.map(entry => {
                  const game = games.find(item => item.id === entry.gameId)
                  const profiles = perProfile(sessionHistory, entry.gameId)
                  const maxProfile = Math.max(1, ...profiles.map(profile => profile.minutes))
                  return <li key={entry.gameId} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" onClick={() => { if (game) { setSelectedGame(game.id); setView('games') } }} className="group flex min-w-0 items-center gap-2 text-left">
                        <Gamepad2 size={12} className="shrink-0 text-white/30" />
                        <span className="truncate text-xs font-semibold text-white/72 group-hover:text-white">{entry.gameName}</span>
                        {entry.live && <span className="flex items-center gap-1 rounded-full bg-green-400/10 px-2 py-0.5 text-[9px] font-semibold text-green-300">● En cours</span>}
                      </button>
                      <div className="flex shrink-0 items-center gap-3">
                        {entry.sessions > 0 && <span className="text-[10px] text-white/28">{entry.sessions} session(s)</span>}
                        <span className="font-mono text-[11px] text-white/55">{entry.minutes > 0 ? formatTime(entry.minutes) : <span className="text-white/30">Jamais lancé</span>}</span>
                      </div>
                    </div>
                    {profiles.length > 1 && (
                      <div className="mt-2 space-y-1">
                        {profiles.map(profile => (
                          <div key={profile.profileId} className="flex items-center gap-2">
                            <span className="w-24 truncate text-[10px] text-white/38">{profile.profileName}</span>
                            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                              <div className="h-full rounded-full bg-[var(--zailon-accent)]/70" style={{ width: `${Math.max(profile.minutes > 0 ? 2 : 0, Math.round((profile.minutes / maxProfile) * 100))}%` }} />
                            </div>
                            <span className="w-14 shrink-0 text-right font-mono text-[10px] text-white/45">{profile.minutes > 0 ? formatTime(profile.minutes) : '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {entry.lastEndedAt && <p className="mt-1.5 text-[10px] text-white/26">Dernière fois : {timeAgo(entry.lastEndedAt)}</p>}
                    {entry.minutes > 0 && <button type="button" onClick={() => { if (window.confirm(`Réinitialiser les statistiques de « ${entry.gameName} » ?`)) resetSessionHistory(entry.gameId) }} className="mt-1 text-[10px] text-white/24 hover:text-red-200/70">Réinitialiser ce jeu</button>}
                  </li>
                })}
              </ul>}
        </section>

        <p className="px-1 text-[11px] leading-relaxed text-white/28">Suivi ZAILON uniquement — le temps Steam/EA reste séparé s’il est fourni par un add-on (§96). Historique persisté avec checkpoints toutes les ~5 min (§44) : une session interrompue par un crash de ZAILON est récupérée au prochain démarrage (§45).</p>
      </div>
    </div>
  </div>
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-white/34">{icon}{label}</div>
    <p className="mt-2 truncate font-display text-xl font-bold text-white/88" title={value}>{value}</p>
    {sub && <p className="mt-1 truncate text-[10px] text-white/32">{sub}</p>}
  </div>
}

/** Format d'une durée de session (ms) — réutilisé par le widget « En cours ». */
export function formatSessionDuration(startedAt: number, now: number): string {
  return formatElapsedDuration(startedAt, now)
}
