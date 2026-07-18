import { FormEvent, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Download,
  ExternalLink,
  Gamepad2,
  Grid2X2,
  KeyRound,
  LayoutList,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { GAMEBANANA_GAMES } from '../../store/gamebanana'
import { useStore } from '../../store/useStore'
import type { ExplodMod, Platform } from '../../types'
import { native } from '../../lib/native'

const providers: Array<{ id: Platform; name: string; detail: string; ready: boolean }> = [
  { id: 'gamebanana', name: 'GameBanana', detail: 'Catalogue public connecté', ready: true },
  { id: 'nexus', name: 'Nexus Mods', detail: 'Clé API personnelle requise', ready: false },
  { id: 'curseforge', name: 'CurseForge', detail: 'Clé API partenaire requise', ready: false },
  { id: 'ayakamods', name: 'Ayaka Mods', detail: 'Connecteur en préparation', ready: false },
]

const formatCount = (value: number) => new Intl.NumberFormat('fr-FR', {
  notation: value >= 10_000 ? 'compact' : 'standard',
  maximumFractionDigits: 1,
}).format(value)

export function ExploreView() {
  const platform = useStore(state => state.explorePlatform)
  const gameId = useStore(state => state.exploreGameId)
  const search = useStore(state => state.exploreSearch)
  const grid = useStore(state => state.exploreGrid)
  const mods = useStore(state => state.exploreMods)
  const loading = useStore(state => state.exploreLoading)
  const error = useStore(state => state.exploreError)
  const games = useStore(state => state.games)
  const selectedGameId = useStore(state => state.selectedGameId)
  const showNsfw = useStore(state => state.nsfw)
  const setPlatform = useStore(state => state.setExplorePlatform)
  const setGame = useStore(state => state.setExploreGame)
  const setSearch = useStore(state => state.setExploreSearch)
  const setGrid = useStore(state => state.setExploreGrid)
  const refresh = useStore(state => state.refreshExplore)
  const installMod = useStore(state => state.installMod)
  const setView = useStore(state => state.setView)
  const [installingId, setInstallingId] = useState<string>()
  const selectedGame = games.find(game => game.id === selectedGameId)
  const readyProvider = providers.find(provider => provider.id === platform)?.ready
  const resolvedGameId = GAMEBANANA_GAMES.some(game => game.id === gameId) ? gameId : GAMEBANANA_GAMES[0].id
  const visibleMods = showNsfw ? mods : mods.filter(mod => !mod.nsfw)
  const hiddenNsfw = mods.length - visibleMods.length

  useEffect(() => {
    if (platform !== 'gamebanana') return
    if (resolvedGameId !== gameId) setGame(resolvedGameId)
    else void refresh()
  }, [platform, gameId, refresh, resolvedGameId, setGame])

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    void refresh()
  }

  const install = async (mod: ExplodMod) => {
    if (!selectedGame?.modsPath) {
      setView('games')
      return
    }
    setInstallingId(mod.id)
    try {
      await installMod(mod)
    } finally {
      setInstallingId(undefined)
    }
  }

  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div className="flex items-center gap-2 text-gold/64"><Compass size={15} /><p className="font-mono text-[11px] uppercase tracking-[0.22em]">Catalogue de mods en ligne</p></div>
        <h1 className="mt-2 font-display text-3xl font-bold text-white">Explorer</h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/42">Recherchez de vrais mods, vérifiez leur source puis installez-les dans le dossier Mods du jeu sélectionné.</p>
      </div>
      <TargetGame gameName={selectedGame?.name} configured={Boolean(selectedGame?.modsPath)} onConfigure={() => setView('games')} />
    </header>

    <section className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4" aria-label="Sources de mods">
      {providers.map(provider => <button
        key={provider.id}
        type="button"
        onClick={() => setPlatform(provider.id)}
        className={`rounded-xl border p-3 text-left transition-colors ${platform === provider.id ? 'border-gold/28 bg-gold/[0.07]' : 'border-white/[0.07] bg-white/[0.018] hover:border-white/15 hover:bg-white/[0.04]'}`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-white/82">{provider.name}</span>
          {provider.ready ? <CheckCircle2 size={14} className="text-emerald-300/72" /> : <KeyRound size={14} className="text-white/28" />}
        </span>
        <span className="mt-1 block text-[11px] text-white/38">{provider.detail}</span>
      </button>)}
    </section>

    {!readyProvider ? <ProviderUnavailable provider={providers.find(item => item.id === platform)?.name || platform} /> : <>
      <section className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-white/48">
            <Gamepad2 size={15} className="shrink-0" />
            <span className="sr-only">Jeu du catalogue</span>
            <select value={resolvedGameId} onChange={event => setGame(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent text-xs text-white/76 outline-none">
              {GAMEBANANA_GAMES.map(game => <option key={game.id} value={game.id} className="bg-[#101313]">{game.name}</option>)}
            </select>
          </label>

          <form onSubmit={submitSearch} className="flex min-w-0 flex-[1.3] items-center rounded-lg border border-white/[0.08] bg-black/20 focus-within:border-gold/26">
            <Search size={15} className="ml-3 shrink-0 text-white/32" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher dans les nouveautés…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs text-white/78 outline-none placeholder:text-white/25" />
            <button type="submit" disabled={loading} className="mr-1 rounded-md bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/62 hover:bg-white/[0.1] disabled:opacity-40">Rechercher</button>
          </form>

          <div className="flex items-center gap-1">
            <button type="button" onClick={() => void refresh()} disabled={loading} title="Actualiser le catalogue" aria-label="Actualiser le catalogue" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-white/46 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
            <button type="button" onClick={() => setGrid(true)} title="Affichage en grille" aria-label="Affichage en grille" className={`flex h-9 w-9 items-center justify-center rounded-lg ${grid ? 'bg-gold text-[#101313]' : 'border border-white/[0.08] text-white/38 hover:text-white'}`}><Grid2X2 size={14} /></button>
            <button type="button" onClick={() => setGrid(false)} title="Affichage en liste" aria-label="Affichage en liste" className={`flex h-9 w-9 items-center justify-center rounded-lg ${!grid ? 'bg-gold text-[#101313]' : 'border border-white/[0.08] text-white/38 hover:text-white'}`}><LayoutList size={15} /></button>
          </div>
        </div>
      </section>

      {error && <section className="mt-4 flex items-start gap-3 rounded-xl border border-red-400/18 bg-red-400/[0.04] p-4">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-300/76" />
        <div className="min-w-0 flex-1"><h2 className="text-xs font-semibold text-white/78">Impossible de charger GameBanana</h2><p className="mt-1 break-words text-[11px] text-white/42">{error}</p></div>
        <button type="button" onClick={() => void refresh()} className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-[11px] font-semibold text-white/62 hover:bg-white/[0.06]">Réessayer</button>
      </section>}

      <section className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-white/38">{loading ? 'Connexion à GameBanana…' : `${visibleMods.length} résultat${visibleMods.length > 1 ? 's' : ''} réel${visibleMods.length > 1 ? 's' : ''}${hiddenNsfw ? ` · ${hiddenNsfw} adulte${hiddenNsfw > 1 ? 's' : ''} masqué${hiddenNsfw > 1 ? 's' : ''}` : ''}`}</p>
          <span className="flex items-center gap-1.5 text-[11px] text-white/30"><ShieldCheck size={13} /> Les fichiers sont récupérés depuis la source officielle.</span>
        </div>

        {loading && !mods.length ? <LoadingGrid /> : !visibleMods.length && !error ? <EmptyResults onReset={() => { setSearch(''); void refresh() }} /> : <div className={grid ? 'grid gap-3 md:grid-cols-2 2xl:grid-cols-3' : 'space-y-2'}>
          {visibleMods.map(mod => <ModResult key={mod.id} mod={mod} grid={grid} installing={installingId === mod.id} canInstall={Boolean(selectedGame?.modsPath)} targetName={selectedGame?.name} onInstall={() => void install(mod)} />)}
        </div>}
      </section>
    </>}
  </div>
}

function TargetGame({ gameName, configured, onConfigure }: { gameName?: string; configured: boolean; onConfigure: () => void }) {
  return <button type="button" onClick={onConfigure} className={`flex max-w-sm items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${configured ? 'border-emerald-300/16 bg-emerald-300/[0.035]' : 'border-amber-300/18 bg-amber-300/[0.035]'}`}>
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${configured ? 'bg-emerald-300/10 text-emerald-200/72' : 'bg-amber-300/10 text-amber-200/72'}`}><Gamepad2 size={16} /></span>
    <span className="min-w-0"><span className="block text-[11px] uppercase tracking-[0.12em] text-white/32">Cible d’installation</span><span className="block truncate text-xs font-semibold text-white/76">{configured ? gameName : 'Configurer un dossier Mods'}</span></span>
  </button>
}

function ProviderUnavailable({ provider }: { provider: string }) {
  return <section className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.018] px-5 text-center">
    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/34"><KeyRound size={19} /></div>
    <h2 className="mt-3 text-sm font-semibold text-white/72">{provider} n’est pas encore connecté</h2>
    <p className="mt-1 max-w-md text-[11px] leading-relaxed text-white/38">Cette source exige une authentification ou une clé API. ZAILON ne présente aucun résultat fictif : GameBanana reste disponible immédiatement sans compte.</p>
  </section>
}

function ModResult({ mod, grid, installing, canInstall, targetName, onInstall }: { mod: ExplodMod; grid: boolean; installing: boolean; canInstall: boolean; targetName?: string; onInstall: () => void }) {
  const openSource = () => native.isDesktop() ? native.openExternalUrl(mod.url) : window.open(mod.url, '_blank', 'noopener,noreferrer')
  return <article className={`group overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.018] transition-colors hover:border-white/15 hover:bg-white/[0.03] ${grid ? '' : 'flex min-h-28'}`}>
    <div className={`relative shrink-0 overflow-hidden bg-white/[0.025] ${grid ? 'aspect-[16/7] w-full' : 'w-44'}`}>
      {mod.thumbnail ? <img src={mod.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover opacity-75 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-90" /> : <div className="flex h-full items-center justify-center text-white/16"><Compass size={26} /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0d1010] via-transparent to-transparent" />
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[11px] font-semibold text-white/62 backdrop-blur-sm">{mod.game}</span>
    </div>
    <div className="flex min-w-0 flex-1 flex-col p-3.5">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-white/82" title={mod.name}>{mod.name}</h2><p className="mt-0.5 truncate text-[11px] text-white/38">par {mod.author}</p></div>
        {mod.nsfw && <span className="rounded border border-red-300/18 bg-red-300/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-red-200/70">NSFW</span>}
      </div>
      {mod.description && <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-white/34">{mod.description}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <span className="text-[11px] text-white/32">{formatCount(mod.downloads)} téléchargements · {formatCount(mod.rating)} mentions J’aime</span>
        <span className="flex items-center gap-1.5">
          <button type="button" onClick={() => void openSource()} title="Ouvrir la page GameBanana" aria-label={`Ouvrir ${mod.name} sur GameBanana`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-white/38 hover:bg-white/[0.06] hover:text-white"><ExternalLink size={13} /></button>
          <button type="button" onClick={onInstall} disabled={installing} title={canInstall ? `Installer dans ${targetName}` : 'Configurer d’abord le dossier Mods du jeu cible'} className={`flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition-colors ${canInstall ? 'bg-[#dbe8e5] text-[#101313] hover:bg-white' : 'border border-amber-200/16 bg-amber-200/[0.04] text-amber-100/64'} disabled:opacity-45`}>
            {installing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}{installing ? 'Installation…' : canInstall ? 'Installer' : 'Configurer'}
          </button>
        </span>
      </div>
    </div>
  </article>
}

function LoadingGrid() {
  return <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015]"><div className="aspect-[16/7] animate-pulse bg-white/[0.035]" /><div className="space-y-2 p-4"><div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.05]" /><div className="h-2.5 w-1/3 animate-pulse rounded bg-white/[0.035]" /></div></div>)}</div>
}

function EmptyResults({ onReset }: { onReset: () => void }) {
  return <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-center"><Search size={20} className="text-white/22" /><h2 className="mt-3 text-sm font-semibold text-white/62">Aucun mod trouvé</h2><p className="mt-1 text-[11px] text-white/34">Essayez un terme plus large ou rechargez les nouveautés.</p><button type="button" onClick={onReset} className="mt-3 rounded-lg border border-white/[0.1] px-3 py-1.5 text-[11px] font-semibold text-white/58 hover:bg-white/[0.05]">Afficher les nouveautés</button></div>
}
