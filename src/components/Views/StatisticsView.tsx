import { ArrowLeft, BarChart3, Clock3, Download, Gamepad2, History, Search, Timer, Trash2, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { formatElapsedDuration, formatTime, timeAgo } from '../../utils'
import { dailyBreakdown, heatmapCells, minutesWithin, perGame, perProfile, summarizeSessions } from '../../lib/sessionStats'

type StatsTab = 'tout' | 'jeux' | 'apps'
type StatsRange = 7 | 30 | 'all'

const RANGE_LABELS: Array<{ value: StatsRange; label: string }> = [
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 'all', label: 'Tout' },
]

const SORT_LABELS = [
  { value: 'played', label: 'Le plus joué' },
  { value: 'recent', label: 'Récent' },
  { value: 'name', label: 'Nom' },
  { value: 'sessions', label: 'Nombre de sessions' },
] as const

/**
 * Page Statistiques (spec §29-52, §96-98) — ouverte depuis le widget
 * « Vos statistiques » de l'Accueil, sans entrée permanente dans la Sidebar
 * (§29). Données locales uniquement (§51) : source de vérité = historique
 * PERSISTÉ des sessions (`sessionHistory`), complété par la session en cours.
 * Vue Jeux / Applications / Tout (§97), plages 7j / 30j / Tout avec barres ou
 * heatmap (§47-48), recherche et tri (§98), temps Steam affiché SÉPARÉMENT du
 * suivi ZAILON (§96). Aucun serveur, aucun compte.
 */
export function StatisticsView() {
  const sessionHistory = useStore(state => state.sessionHistory)
  const activeTrackedSession = useStore(state => state.activeTrackedSession)
  const gameSessions = useStore(state => state.gameSessions)
  const games = useStore(state => state.games)
  const setView = useStore(state => state.setView)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const resetSessionHistory = useStore(state => state.resetSessionHistory)
  const [tab, setTab] = useState<StatsTab>('tout')
  const [range, setRange] = useState<StatsRange>(7)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<(typeof SORT_LABELS)[number]['value']>('played')
  const [exported, setExported] = useState<'csv' | 'json' | undefined>(undefined)
  const [exportOpen, setExportOpen] = useState(false)

  const now = Date.now()

  // Spec §97 : les applications (Photoshop, Blender…) ne se mélangent pas aux
  // jeux — l'onglet filtre l'historique par itemKind, jusqu'aux totaux et aux
  // graphiques (l'UI ne triche jamais sur les données).
  const filteredHistory = useMemo(() => {
    if (tab === 'tout') return sessionHistory
    const kind = tab === 'apps' ? 'software' : 'game'
    return sessionHistory.filter(session => games.find(game => game.id === session.gameId)?.itemKind === kind)
  }, [sessionHistory, tab, games])

  const liveSessions = useMemo(
    () => gameSessions.filter(session => session.state === 'GameRunning').map(session => ({ gameId: session.gameId, startedAt: session.startedAt })),
    [gameSessions],
  )

  const summary = useMemo(() => summarizeSessions(filteredHistory, liveSessions.length), [filteredHistory, liveSessions])
  const weekMinutes = useMemo(() => minutesWithin(filteredHistory, now, 7), [filteredHistory, now])
  const weekSessionCount = useMemo(() => filteredHistory.filter(session => session.endedAt >= now - 7 * 24 * 60 * 60 * 1000).length, [filteredHistory, now])
  const days = useMemo(() => (typeof range === 'number' ? dailyBreakdown(filteredHistory, now, range) : []), [filteredHistory, now, range])
  const heatmap = useMemo(() => (range === 'all' ? heatmapCells(filteredHistory, now, 12) : []), [filteredHistory, now, range])
  const byGame = useMemo(() => perGame(filteredHistory, liveSessions), [filteredHistory, liveSessions])
  const mostPlayed = byGame[0]

  const liveMinutes = useMemo(() => {
    if (!activeTrackedSession) return 0
    return Math.floor((now - activeTrackedSession.startedAt) / 60_000)
  }, [activeTrackedSession, now])
  const totalMinutes = summary.totalMinutes + (activeTrackedSession ? liveMinutes : 0)
  const maxDay = Math.max(1, ...days.map(day => day.minutes))

  // Spec §98 : recherche + tri sur la liste des jeux.
  const visibleGames = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    const list = q ? byGame.filter(entry => entry.gameName.toLocaleLowerCase().includes(q)) : [...byGame]
    return list.sort((a, b) => {
      switch (sort) {
        case 'recent': return (b.lastEndedAt ?? 0) - (a.lastEndedAt ?? 0)
        case 'name': return a.gameName.localeCompare(b.gameName, 'fr')
        case 'sessions': return b.sessions - a.sessions || b.minutes - a.minutes
        default: return b.minutes - a.minutes || (b.lastEndedAt ?? 0) - (a.lastEndedAt ?? 0)
      }
    })
  }, [byGame, query, sort])

  const exportData = (format: 'csv' | 'json') => {
    const rows = filteredHistory.map(session => ({ ...session })).sort((a, b) => a.startedAt - b.startedAt)
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
        {/* Onglets Jeux / Applications / Tout (spec §97) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex overflow-hidden rounded-lg border border-white/[0.08]">
            {([['tout', 'Tout'], ['jeux', 'Jeux'], ['apps', 'Applications']] as Array<[StatsTab, string]>).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setTab(value)} className={`px-4 py-1.5 text-[11px] font-semibold transition-colors ${tab === value ? 'bg-[var(--zailon-accent)] text-[var(--zailon-accent-text)]' : 'text-white/50 hover:bg-white/[0.05] hover:text-white'}`}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="relative">
              <Search size={11} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher…" className="w-40 rounded-lg border border-white/[0.08] bg-ink-200 py-1.5 pl-8 pr-3 text-[11px] text-white/75 outline-none placeholder:text-white/25 focus:border-gold/30" />
            </label>
            <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="rounded-lg border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[11px] text-white/65">
              {SORT_LABELS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        {/* Totaux (spec §30) */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard icon={<Timer size={13} />} label="Temps total suivi" value={totalMinutes > 0 ? formatTime(totalMinutes) : '0h'} sub={activeTrackedSession ? 'session en cours incluse' : undefined} />
          <StatCard icon={<History size={13} />} label="Sessions" value={String(summary.sessionCount + summary.liveSessionCount)} sub={summary.recoveredCount ? `${summary.recoveredCount} récupérée(s)` : undefined} />
          <StatCard icon={<Trophy size={13} />} label="Le plus joué" value={mostPlayed ? mostPlayed.gameName : '—'} sub={mostPlayed && mostPlayed.minutes > 0 ? formatTime(mostPlayed.minutes) : undefined} />
          <StatCard icon={<Clock3 size={13} />} label="Cette semaine" value={weekMinutes > 0 ? formatTime(weekMinutes) : '0h'} sub={weekSessionCount ? `${weekSessionCount} session(s)` : undefined} />
        </div>

        {/* Plage + graphique (spec §47-48) : barres 7j/30j, heatmap 12 semaines sur « Tout ». */}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">{range === 'all' ? 'Activité — 12 dernières semaines' : `${range} derniers jours`}</p>
            <div className="flex overflow-hidden rounded-md border border-white/[0.08]">
              {RANGE_LABELS.map(option => (
                <button key={String(option.value)} type="button" onClick={() => setRange(option.value)} className={`px-3 py-1 text-[10px] font-semibold ${range === option.value ? 'bg-white/[0.08] text-white' : 'text-white/40 hover:text-white'}`}>{option.label}</button>
              ))}
            </div>
          </div>
          {range !== 'all' ? (
            days.every(day => day.minutes === 0)
              ? <p className="py-6 text-center text-[11px] text-white/34">Aucune activité suivie sur cette période.</p>
              : <div className="flex h-24 items-end gap-1.5">
                  {days.map(day => (
                    <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center gap-1" title={`${day.label} · ${formatTime(day.minutes)}`}>
                      {range === 7 && <span className="text-[9px] text-white/26">{day.minutes > 0 ? formatTime(day.minutes) : ''}</span>}
                      <div className="w-full rounded-t bg-[var(--zailon-accent)]/70 transition-all group-hover:bg-[var(--zailon-accent)]" style={{ height: `${Math.max(day.minutes > 0 ? 8 : 2, Math.round((day.minutes / maxDay) * 76))}px` }} />
                      {range === 7 && <span className="text-[9px] text-white/30">{day.label}</span>}
                    </div>
                  ))}
                </div>
          ) : (
            heatmap.every(cell => cell.minutes === 0)
              ? <p className="py-6 text-center text-[11px] text-white/34">Aucune activité suivie sur les 12 dernières semaines.</p>
              : <div className="overflow-x-auto thin-scroll">
                  <div className="flex min-w-[560px] gap-1.5">
                    {Array.from({ length: 12 }, (_, week) => (
                      <div key={week} className="flex flex-col gap-1.5">
                        {heatmap.slice(week * 7, week * 7 + 7).map(cell => (
                          <div key={cell.date} title={`${cell.date} · ${cell.minutes > 0 ? formatTime(cell.minutes) : 'aucune session'}`} className={`h-[11px] w-[11px] rounded-[3px] ${HEATMAP_LEVELS[cell.level]}`} />
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[9px] text-white/28"><span>Moins</span>{HEATMAP_LEVELS.map((_, level) => <span key={level} className={`h-[9px] w-[9px] rounded-[2px] ${HEATMAP_LEVELS[level]}`} />)}<span>Plus</span></div>
                </div>
          )}
        </section>

        {/* Par jeu (spec §31) avec répartition par profil (spec §32, §49) */}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.018]">
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-3">
            <BarChart3 size={13} className="text-white/30" />
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">Par jeu et par profil</p>
            {query && <span className="ml-auto text-[10px] text-white/28">{visibleGames.length} résultat(s)</span>}
          </div>
          {visibleGames.length === 0
            ? <p className="px-4 py-8 text-center text-[11px] text-white/34">{query ? 'Aucun jeu ne correspond à la recherche.' : 'Aucune session suivie pour l’instant. Lancez un jeu depuis ZAILON (ou hors ZAILON si le suivi externe est activé) pour commencer.'}</p>
            : <ul className="divide-y divide-white/[0.04]">
                {visibleGames.map(entry => {
                  const game = games.find(item => item.id === entry.gameId)
                  const profiles = perProfile(filteredHistory, entry.gameId)
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
                    {/* Spec §96 : temps Steam JAMAIS fusionné — affiché séparément. */}
                    {game?.steamPlaytimeHours ? <p className="mt-1 text-[10px] text-white/26">Suivi ZAILON : {formatTime(entry.minutes)} · Steam : {formatTime(game.steamPlaytimeHours * 60)}</p> : null}
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

/** Teintes de la heatmap (spec §48) — niveaux 0-4, variables d'accent. */
const HEATMAP_LEVELS = [
  'bg-white/[0.05]',
  'bg-[var(--zailon-accent)]/25',
  'bg-[var(--zailon-accent)]/45',
  'bg-[var(--zailon-accent)]/70',
  'bg-[var(--zailon-accent)]',
]

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
