import { Download, Grid, List, RefreshCw, Search } from 'lucide-react'
import { useEffect } from 'react'
import { ExplodMod, Platform } from '../../types'
import { getSelectedProfile, useStore } from '../../store/useStore'
import { GAMEBANANA_GAMES } from '../../store/gamebanana'
import { formatDownloads, PLATFORM_COLORS, PLATFORM_LABELS } from '../../utils'

const PLATFORMS: Platform[] = ['gamebanana', 'nexus', 'curseforge', 'ayakamods']

export function ExploreView() {
  const explorePlatform = useStore(state => state.explorePlatform)
  const exploreGameId = useStore(state => state.exploreGameId)
  const exploreSearch = useStore(state => state.exploreSearch)
  const exploreGrid = useStore(state => state.exploreGrid)
  const mods = useStore(state => state.exploreMods)
  const loading = useStore(state => state.exploreLoading)
  const error = useStore(state => state.exploreError)
  const setExplorePlatform = useStore(state => state.setExplorePlatform)
  const setExploreGame = useStore(state => state.setExploreGame)
  const setExploreSearch = useStore(state => state.setExploreSearch)
  const setExploreGrid = useStore(state => state.setExploreGrid)
  const refreshExplore = useStore(state => state.refreshExplore)
  const installMod = useStore(state => state.installMod)
  const profile = useStore(getSelectedProfile)

  useEffect(() => { void refreshExplore() }, [exploreGameId, explorePlatform])
  const installed = new Set(profile?.mods.map(mod => mod.name.toLowerCase()) ?? [])

  return (
    <div className="flex h-full">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-3">
          <div className="relative flex-1"><Search size={11} className="absolute left-2.5 top-2 text-white/30" /><input value={exploreSearch} onChange={event => setExploreSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void refreshExplore() }} placeholder="Search GameBanana mods" className="w-full rounded-lg border border-white/[0.06] bg-white/[0.04] py-1.5 pl-7 pr-3 text-xs text-white/80 outline-none focus:border-gold/30" /></div>
          <button onClick={() => void refreshExplore()} title="Refresh" className="rounded-lg border border-white/[0.06] bg-white/[0.04] p-1.5 text-white/45 hover:text-gold"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setExploreGrid(!exploreGrid)} className="rounded-lg border border-white/[0.06] bg-white/[0.04] p-1.5 text-white/45 hover:text-white">{exploreGrid ? <List size={13} /> : <Grid size={13} />}</button>
        </header>
        <div className="flex-1 overflow-y-auto p-3">
          {loading && <Status text="Loading live GameBanana mods…" />}
          {!loading && error && <Status text={error} />}
          {!loading && !error && !mods.length && <Status text="No mods found for this game." />}
          {!loading && !error && !!mods.length && (exploreGrid ? <div className="grid grid-cols-3 gap-2">{mods.map(mod => <ModTile key={mod.id} mod={mod} installed={installed.has(mod.name.toLowerCase())} onInstall={() => void installMod(mod)} />)}</div> : <div className="space-y-1">{mods.map(mod => <ModRow key={mod.id} mod={mod} installed={installed.has(mod.name.toLowerCase())} onInstall={() => void installMod(mod)} />)}</div>)}
        </div>
      </section>
      <aside className="flex w-40 flex-col border-l border-white/[0.05] p-2.5">
        <p className="mb-2 text-[9px] font-mono uppercase tracking-widest text-white/25">Source</p>
        {PLATFORMS.map(platform => <button key={platform} onClick={() => setExplorePlatform(platform)} className={`mb-0.5 flex items-center gap-2 rounded px-2 py-1.5 text-left text-[10px] ${platform === explorePlatform ? 'bg-white/[0.08] text-white' : 'text-white/35 hover:bg-white/[0.04]'}`}><span className="h-1.5 w-1.5 rounded-full" style={{ background: platform === explorePlatform ? PLATFORM_COLORS[platform] : '#ffffff30' }} />{PLATFORM_LABELS[platform]}</button>)}
        <div className="my-3 border-t border-white/[0.05]" />
        <p className="mb-2 text-[9px] font-mono uppercase tracking-widest text-white/25">GameBanana game</p>
        <select value={exploreGameId} onChange={event => setExploreGame(Number(event.target.value))} className="w-full rounded border border-white/[0.08] bg-ink-200 px-2 py-1.5 text-[10px] text-white/70 outline-none"><>{GAMEBANANA_GAMES.map(game => <option key={game.id} value={game.id}>{game.shortName} · {game.name}</option>)}</></select>
        <p className="mt-3 text-[9px] leading-relaxed text-white/25">GameBanana is live. Other sources require their own publisher API credentials and are intentionally not simulated.</p>
      </aside>
    </div>
  )
}

function Status({ text }: { text: string }) {
  return <div className="flex h-full min-h-32 items-center justify-center text-center text-xs text-white/35">{text}</div>
}

function ModTile({ mod, installed, onInstall }: { mod: ExplodMod; installed: boolean; onInstall: () => void }) {
  return <article className="overflow-hidden rounded-lg border border-white/[0.06] bg-ink-200"><div className="aspect-video bg-ink-50">{mod.thumbnail && <img src={mod.thumbnail} alt="" className="h-full w-full object-cover" />}</div><div className="p-2"><p className="truncate text-[10px] font-medium text-white/90">{mod.name}</p><p className="truncate text-[9px] text-white/35">{mod.author}</p><div className="mt-2 flex items-center justify-between"><span className="text-[9px] text-white/25">↓ {formatDownloads(mod.downloads)}</span><InstallButton installed={installed} onInstall={onInstall} /></div></div></article>
}

function ModRow({ mod, installed, onInstall }: { mod: ExplodMod; installed: boolean; onInstall: () => void }) {
  return <article className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] p-2"><div className="h-9 w-14 overflow-hidden rounded bg-ink-50">{mod.thumbnail && <img src={mod.thumbnail} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-medium text-white/85">{mod.name}</p><p className="text-[9px] text-white/35">{mod.author} · ↓ {formatDownloads(mod.downloads)}</p></div><InstallButton installed={installed} onInstall={onInstall} /></article>
}

function InstallButton({ installed, onInstall }: { installed: boolean; onInstall: () => void }) {
  return <button disabled={installed} onClick={onInstall} className={`flex items-center gap-1 rounded px-2 py-1 text-[9px] ${installed ? 'cursor-default bg-gold/10 text-gold/50' : 'bg-gold text-ink-400 hover:bg-gold-bright'}`}>{installed ? 'Installed' : <><Download size={9} /> Install</>}</button>
}
