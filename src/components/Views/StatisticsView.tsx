import { ArrowLeft, BarChart3, Clock3, Gamepad2, History, Timer, Trophy } from 'lucide-react'
import { useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { formatElapsedDuration, formatTime, timeAgo } from '../../utils'

/**
 * Page Statistiques (spec §29-52) — ouverte depuis le widget « Vos statistiques »
 * de l'Accueil, sans entrée permanente dans la Sidebar (§29). Données locales
 * uniquement (§51) : agrégées depuis les playtimes persistés par jeu/profil et
 * les sessions de l'exécution courante. Aucun serveur, aucun compte.
 */
export function StatisticsView() {
  const games = useStore(state => state.games)
  const gameSessions = useStore(state => state.gameSessions)
  const setView = useStore(state => state.setView)
  const setSelectedGame = useStore(state => state.setSelectedGame)

  const stats = useMemo(() => {
    const now = Date.now()
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    const weekSessions = gameSessions.filter(session => (session.endedAt ?? now) >= weekAgo)
    const weekMinutes = weekSessions.reduce((sum, session) => sum + ((session.endedAt ?? now) - session.startedAt) / 60_000, 0)
    const totalPlaytime = games.reduce((sum, game) => sum + (game.totalPlaytime || 0), 0)
    const mostPlayed = [...games].sort((a, b) => (b.totalPlaytime || 0) - (a.totalPlaytime || 0))[0]
    const perGame = games
      .map(game => {
        const profiles = [...game.profiles].sort((a, b) => (b.playtime || 0) - (a.playtime || 0))
        return {
          game,
          playtime: game.totalPlaytime || 0,
          lastPlayed: game.lastPlayed,
          profiles,
          sessions: gameSessions.filter(session => session.gameId === game.id).length,
        }
      })
      .sort((a, b) => b.playtime - a.playtime || (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    return { totalPlaytime, mostPlayed, perGame, weekMinutes, weekSessionCount: weekSessions.length, sessionCount: gameSessions.length, now }
  }, [games, gameSessions])

  return <div className="flex h-full min-h-0 flex-col bg-[#0a0c0c]">
    <header className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-4">
      <button type="button" onClick={() => setView('home')} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] bg-black/25 text-white/50 hover:bg-white/[0.07] hover:text-white" title="Retour à l’Accueil" aria-label="Retour à l’Accueil"><ArrowLeft size={13} /></button>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/30">Statistiques</p>
        <h1 className="mt-0.5 font-display text-lg font-bold text-white/90">Temps de jeu &amp; sessions</h1>
      </div>
      <p className="hidden text-[11px] text-white/30 sm:block">Données 100 % locales · aucun compte (§51)</p>
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto thin-scroll">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-5">
        {/* Totaux (spec §30) */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard icon={<Timer size={13} />} label="Temps total suivi" value={stats.totalPlaytime ? formatTime(stats.totalPlaytime) : '0h'} />
          <StatCard icon={<History size={13} />} label="Sessions (cette exécution)" value={String(stats.sessionCount)} />
          <StatCard icon={<Trophy size={13} />} label="Le plus joué" value={stats.mostPlayed && stats.mostPlayed.totalPlaytime ? stats.mostPlayed.shortName || stats.mostPlayed.name : '—'} sub={stats.mostPlayed?.totalPlaytime ? formatTime(stats.mostPlayed.totalPlaytime) : undefined} />
          <StatCard icon={<Clock3 size={13} />} label="Cette semaine" value={stats.weekMinutes > 0 ? formatTime(stats.weekMinutes) : '0h'} sub={stats.weekSessionCount ? `${stats.weekSessionCount} session(s)` : undefined} />
        </div>

        {/* Par jeu (spec §31) avec répartition par profil (spec §32, §49) */}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.018]">
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-3">
            <BarChart3 size={13} className="text-white/30" />
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">Par jeu et par profil</p>
          </div>
          {stats.perGame.length === 0
            ? <p className="px-4 py-8 text-center text-[11px] text-white/34">Aucun jeu ajouté pour l’instant.</p>
            : <ul className="divide-y divide-white/[0.04]">
                {stats.perGame.map(({ game, playtime, lastPlayed, profiles, sessions }) => {
                  const maxProfile = Math.max(1, ...profiles.map(profile => profile.playtime || 0))
                  return <li key={game.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" onClick={() => { setSelectedGame(game.id); setView('games') }} className="group flex min-w-0 items-center gap-2 text-left">
                        <Gamepad2 size={12} className="shrink-0 text-white/30" />
                        <span className="truncate text-xs font-semibold text-white/72 group-hover:text-white">{game.name}</span>
                      </button>
                      <div className="flex shrink-0 items-center gap-3">
                        {sessions > 0 && <span className="text-[10px] text-white/28">{sessions} session(s)</span>}
                        <span className="font-mono text-[11px] text-white/55">{playtime ? formatTime(playtime) : <span className="text-white/30">Jamais lancé</span>}</span>
                      </div>
                    </div>
                    {profiles.length > 1 && (
                      <div className="mt-2 space-y-1">
                        {profiles.map(profile => (
                          <div key={profile.id} className="flex items-center gap-2">
                            <span className="w-24 truncate text-[10px] text-white/38">{profile.name}</span>
                            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                              <div className="h-full rounded-full bg-[var(--zailon-accent)]/70" style={{ width: `${Math.max(playtime ? 2 : 0, Math.round(((profile.playtime || 0) / maxProfile) * 100))}%` }} />
                            </div>
                            <span className="w-14 shrink-0 text-right font-mono text-[10px] text-white/45">{profile.playtime ? formatTime(profile.playtime) : '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {lastPlayed && <p className="mt-1.5 text-[10px] text-white/26">Dernière fois : {timeAgo(lastPlayed)}</p>}
                  </li>
                })}
              </ul>}
        </section>

        <p className="px-1 text-[11px] leading-relaxed text-white/28">Suivi ZAILON uniquement — le temps Steam/EA reste séparé s’il est fourni par un add-on (§96). Les sessions de l’exécution courante alimentent « Cette semaine » et le compteur de sessions ; les totaux par jeu viennent des playtimes persistés (§90).</p>
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
