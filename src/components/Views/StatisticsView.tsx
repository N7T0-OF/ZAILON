import { ArrowLeft, ChevronDown, ChevronRight, Clock3, Download, Gamepad2, History, Search, Timer, Trash2, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { resourceUrl } from '../../lib/native'
import { formatElapsedDuration, formatTime, timeAgo } from '../../utils'
import { dailyBreakdown, minutesWithin, perGame, perProfile, recentSessions, summarizeSessions } from '../../lib/sessionStats'
import type { TrackedSession } from '../../types'

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
 * Page Statistiques (spec « Temps de jeu & sessions — interface premium ») :
 * abandonne l'aspect « tableau de données » au profit d'une vitrine visuelle —
 * totaux en grandes cartes, « Jeux les plus utilisés » avec couvertures et
 * barres, « Activité récente » avec couvertures, et un détail PAR JEU
 * (profils, activité 7 jours, sessions récentes) ouvert au clic. Jeu et
 * profil restent deux niveaux distincts : Cyberpunk 142 h → Default 96 h,
 * Modded 31 h… Données locales uniquement — source de vérité = historique
 * PERSISTÉ des sessions, complété par la session en cours. Aucun serveur.
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
  const [expandedGameId, setExpandedGameId] = useState<string>()
  const [exported, setExported] = useState<'csv' | 'json' | undefined>(undefined)
  const [exportOpen, setExportOpen] = useState(false)

  const now = Date.now()

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
  const byGame = useMemo(() => perGame(filteredHistory, liveSessions), [filteredHistory, liveSessions])
  const recent = useMemo(() => recentSessions(filteredHistory, 6), [filteredHistory])

  const liveMinutes = useMemo(() => {
    if (!activeTrackedSession) return 0
    return Math.floor((now - activeTrackedSession.startedAt) / 60_000)
  }, [activeTrackedSession, now])
  const totalMinutes = summary.totalMinutes + (activeTrackedSession ? liveMinutes : 0)
  const maxMinutes = Math.max(1, ...byGame.map(entry => entry.minutes))

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
    const rows = [...filteredHistory].sort((a, b) => a.startedAt - b.startedAt)
    const content = format === 'csv'
      ? ['date,jeu,profil,minutes,source,récupérée',
          ...rows.map(session => [
            new Date(session.startedAt).toISOString(),
            `"${session.gameName.replace(/"/g, '"')}"`,
            `"${session.profileName.replace(/"/g, '"')}"`,
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
        {/* Onglets + plage + recherche/tri */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-white/[0.08]">
              {([['tout', 'Tout'], ['jeux', 'Jeux'], ['apps', 'Applications']] as Array<[StatsTab, string]>).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setTab(value)} className={`px-4 py-1.5 text-[11px] font-semibold transition-colors ${tab === value ? 'bg-[var(--zailon-accent)] text-[var(--zailon-accent-text)]' : 'text-white/50 hover:bg-white/[0.05] hover:text-white'}`}>{label}</button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-lg border border-white/[0.08]">
              {RANGE_LABELS.map(option => (
                <button key={String(option.value)} type="button" onClick={() => setRange(option.value)} className={`px-3 py-1.5 text-[10px] font-semibold ${range === option.value ? 'bg-white/[0.08] text-white' : 'text-white/40 hover:text-white'}`}>{option.label}</button>
              ))}
            </div>
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

        {/* Totaux — grandes cartes premium */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <HeroStat icon={<Timer size={15} />} label="Temps total" value={totalMinutes > 0 ? formatTime(totalMinutes) : '0h'} sub={activeTrackedSession ? 'session en cours incluse' : summary.sessionCount ? `${summary.sessionCount} session(s) archivée(s)` : 'suivi ZAILON'} />
          <HeroStat icon={<History size={15} />} label="Sessions" value={String(summary.sessionCount + summary.liveSessionCount)} sub={summary.recoveredCount ? `${summary.recoveredCount} récupérée(s)` : summary.liveSessionCount ? `${summary.liveSessionCount} en cours` : 'terminées'} />
          <HeroStat icon={<Clock3 size={15} />} label="Cette semaine" value={weekMinutes > 0 ? formatTime(weekMinutes) : '0h'} sub={weekSessionCount ? `${weekSessionCount} session(s)` : 'aucune session'} />
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Jeux les plus utilisés — classement visuel */}
          <section className="rounded-xl border border-white/[0.06] bg-white/[0.018] lg:col-span-3">
            <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-3">
              <Trophy size={13} className="text-gold/70" />
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">Jeux les plus utilisés</p>
              {query && <span className="ml-auto text-[10px] text-white/28">{visibleGames.length} résultat(s)</span>}
            </div>
            {visibleGames.length === 0
              ? <p className="px-4 py-10 text-center text-[11px] text-white/34">{query ? 'Aucun jeu ne correspond à la recherche.' : 'Aucune session suivie pour l’instant. Lancez un jeu depuis ZAILON pour commencer.'}</p>
              : <ul className="divide-y divide-white/[0.04]">
                  {visibleGames.slice(0, 8).map(entry => {
                    const game = games.find(item => item.id === entry.gameId)
                    const expanded = expandedGameId === entry.gameId
                    return <li key={entry.gameId}>
                      <button type="button" onClick={() => setExpandedGameId(expanded ? undefined : entry.gameId)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.025]">
                        <GameThumb game={game} name={entry.gameName} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-semibold text-white/78">{entry.gameName}</span>
                            {entry.live && <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-400/10 px-2 py-0.5 text-[9px] font-semibold text-green-300">● En cours</span>}
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full rounded-full bg-[var(--zailon-accent)]/70" style={{ width: `${Math.max(entry.minutes > 0 ? 3 : 0, Math.round((entry.minutes / maxMinutes) * 100))}%` }} />
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-xs text-white/60">{entry.minutes > 0 ? formatTime(entry.minutes) : '—'}</span>
                        {expanded ? <ChevronDown size={14} className="shrink-0 text-white/30" /> : <ChevronRight size={14} className="shrink-0 text-white/30" />}
                      </button>
                      {expanded && <GameDetail game={game} entry={entry} history={filteredHistory} now={now} onOpenGame={() => { if (game) { setSelectedGame(game.id); setView('games') } }} onReset={() => { if (window.confirm(`Réinitialiser les statistiques de « ${entry.gameName} » ?`)) resetSessionHistory(entry.gameId) }} />}
                    </li>
                  })}
                </ul>}
            {visibleGames.length > 8 && <p className="border-t border-white/[0.05] px-4 py-2 text-[10px] text-white/28">{visibleGames.length - 8} autre(s) jeu(x) masqué(s) — affinez la recherche pour les voir.</p>}
          </section>

          {/* Activité récente */}
          <section className="rounded-xl border border-white/[0.06] bg-white/[0.018] lg:col-span-2">
            <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-3">
              <Clock3 size={13} className="text-white/30" />
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">Activité récente</p>
            </div>
            {recent.length === 0
              ? <p className="px-4 py-10 text-center text-[11px] text-white/34">Aucune session récente.</p>
              : <ul className="divide-y divide-white/[0.04]">
                  {recent.map(session => {
                    const game = games.find(item => item.id === session.gameId)
                    return <li key={session.id} className="flex items-center gap-3 px-4 py-3">
                      <GameThumb game={game} name={session.gameName} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-white/70">{session.gameName}</p>
                        <p className="mt-0.5 truncate text-[10px] text-white/32">{session.profileName} · {formatTime(session.durationMin)}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-white/28">{timeAgo(session.endedAt)}</span>
                    </li>
                  })}
                </ul>}
          </section>
        </div>

        <p className="px-1 text-[11px] leading-relaxed text-white/28">Suivi ZAILON uniquement — le temps Steam/EA reste séparé s’il est fourni par un add-on (§96). Historique persisté avec checkpoints toutes les ~5 min : une session interrompue par un crash de ZAILON est récupérée au prochain démarrage.</p>
      </div>
    </div>
  </div>
}

/** Détail PAR JEU (spec premium) : profils distincts, activité 7 jours, sessions. */
function GameDetail({ game, entry, history, now, onOpenGame, onReset }: {
  game?: { id: string; name: string; resources?: { coverPath?: string; bannerPath?: string; backgroundPath?: string; iconPath?: string }; backgroundArt?: string }
  entry: { gameId: string; gameName: string; minutes: number; sessions: number; lastEndedAt?: number; live: boolean }
  history: TrackedSession[]
  now: number
  onOpenGame: () => void
  onReset: () => void
}) {
  const gameHistory = history.filter(session => session.gameId === entry.gameId)
  const week = minutesWithin(gameHistory, now, 7)
  const month = minutesWithin(gameHistory, now, 30)
  const profiles = perProfile(gameHistory, entry.gameId)
  const days = dailyBreakdown(gameHistory, now, 7)
  const maxDay = Math.max(1, ...days.map(day => day.minutes))
  const last = gameHistory[gameHistory.length - 1]
  return <div className="border-t border-white/[0.04] bg-black/15 px-4 py-3">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <DetailStat label="Cette semaine" value={week > 0 ? formatTime(week) : '0h'} />
      <DetailStat label="Ce mois" value={month > 0 ? formatTime(month) : '0h'} />
      <DetailStat label="Sessions" value={String(entry.sessions)} />
      <DetailStat label="Dernière" value={last ? timeAgo(last.endedAt) : '—'} />
    </div>
    {/* Activité 7 jours */}
    {days.some(day => day.minutes > 0) && <div className="mt-3 flex h-12 items-end gap-1">
      {days.map(day => (
        <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center gap-1" title={`${day.label} · ${formatTime(day.minutes)}`}>
          <div className="w-full rounded-t bg-[var(--zailon-accent)]/60 transition-all group-hover:bg-[var(--zailon-accent)]" style={{ height: `${Math.max(day.minutes > 0 ? 4 : 2, Math.round((day.minutes / maxDay) * 40))}px` }} />
          <span className="text-[8px] text-white/26">{day.label}</span>
        </div>
      ))}
    </div>}
    {/* Profils — deux niveaux distincts : jeu puis profils */}
    {profiles.length > 1 && <div className="mt-3 space-y-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/26">Profils</p>
      {profiles.map(profile => (
        <div key={profile.profileId} className="flex items-center gap-2">
          <span className="w-28 truncate text-[10px] text-white/40">{profile.profileName}</span>
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-white/[0.18]" style={{ width: `${Math.max(profile.minutes > 0 ? 2 : 0, Math.round((profile.minutes / entry.minutes) * 100))}%` }} />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-[10px] text-white/45">{profile.minutes > 0 ? formatTime(profile.minutes) : '—'}</span>
        </div>
      ))}
    </div>}
    <div className="mt-3 flex items-center gap-2">
      <button type="button" onClick={onOpenGame} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-1.5 text-[10px] font-semibold text-white/55 hover:bg-white/[0.05]"><Gamepad2 size={11} />Ouvrir le jeu</button>
      {entry.minutes > 0 && <button type="button" onClick={onReset} className="text-[10px] text-white/24 hover:text-red-200/70">Réinitialiser ce jeu</button>}
    </div>
  </div>
}

function GameThumb({ game, name, size = 40 }: { game?: { resources?: { coverPath?: string; bannerPath?: string; backgroundPath?: string; iconPath?: string }; backgroundArt?: string }; name: string; size?: number }) {
  const cover = resourceUrl(game?.resources?.coverPath || game?.resources?.bannerPath || game?.resources?.backgroundPath || game?.backgroundArt)
  return cover
    ? <img src={cover} alt="" loading="lazy" className="flex-none rounded-md object-cover" style={{ width: size, height: size * 1.4 }} />
    : <span className="flex flex-none items-center justify-center rounded-md bg-white/[0.05] font-display font-black text-[var(--zailon-accent)]" style={{ width: size, height: size * 1.4, fontSize: size * 0.42 }}>{name.charAt(0).toUpperCase()}</span>
}

function HeroStat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.035] to-white/[0.012] p-4">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-white/34">{icon}{label}</div>
    <p className="mt-2 font-display text-2xl font-black text-white/90">{value}</p>
    {sub && <p className="mt-1 truncate text-[10px] text-white/32">{sub}</p>}
  </div>
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/[0.025] px-2.5 py-2">
    <p className="text-[9px] uppercase tracking-[0.14em] text-white/26">{label}</p>
    <p className="mt-0.5 truncate text-[11px] font-semibold text-white/70">{value}</p>
  </div>
}

/** Format d'une durée de session (ms) — réutilisé par le widget « En cours ». */
export function formatSessionDuration(startedAt: number, now: number): string {
  return formatElapsedDuration(startedAt, now)
}
