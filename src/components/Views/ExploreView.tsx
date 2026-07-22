import { FormEvent, PointerEvent, useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  ExternalLink,
  Gamepad2,
  Grid2X2,
  KeyRound,
  LayoutList,
  Loader2,
  Pin,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { ExplodMod, Platform } from '../../types'
import { native, NexusCatalogGame, NexusCatalogMod, ProviderConnectionStatus } from '../../lib/native'

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
  const catalogGames = useStore(state => state.exploreGames)
  const gameQuery = useStore(state => state.exploreGameQuery)
  const pinnedGames = useStore(state => state.explorePinnedGames)
  const recentGames = useStore(state => state.exploreRecentGames)
  const search = useStore(state => state.exploreSearch)
  const page = useStore(state => state.explorePage)
  const hasNextPage = useStore(state => state.exploreHasNextPage)
  const sort = useStore(state => state.exploreSort)
  const grid = useStore(state => state.exploreGrid)
  const columns = useStore(state => state.exploreColumns)
  const mods = useStore(state => state.exploreMods)
  const loading = useStore(state => state.exploreLoading)
  const error = useStore(state => state.exploreError)
  const gamesLoading = useStore(state => state.exploreGamesLoading)
  const gameError = useStore(state => state.exploreGameError)
  const games = useStore(state => state.games)
  const selectedGameId = useStore(state => state.selectedGameId)
  const showNsfw = useStore(state => state.nsfw)
  const setPlatform = useStore(state => state.setExplorePlatform)
  const setGame = useStore(state => state.setExploreGame)
  const setGameQuery = useStore(state => state.setExploreGameQuery)
  const searchGames = useStore(state => state.searchExploreGames)
  const pinGame = useStore(state => state.pinExploreGame)
  const setSearch = useStore(state => state.setExploreSearch)
  const setPage = useStore(state => state.setExplorePage)
  const setSort = useStore(state => state.setExploreSort)
  const setGrid = useStore(state => state.setExploreGrid)
  const setColumns = useStore(state => state.setExploreColumns)
  const refresh = useStore(state => state.refreshExplore)
  const installMod = useStore(state => state.installMod)
  const setView = useStore(state => state.setView)
  const [installingId, setInstallingId] = useState<string>()
  const [previewMod, setPreviewMod] = useState<ExplodMod>()
  const [providerStatuses, setProviderStatuses] = useState<Record<string, ProviderConnectionStatus>>({})
  const selectedGame = games.find(game => game.id === selectedGameId)
  const readyProvider = platform === 'gamebanana' || (platform === 'nexus' && providerStatuses.nexus?.configured)
  const gameChoices = [...new Map([...pinnedGames, ...recentGames, ...catalogGames].map(game => [game.id, game])).values()]
  const selectedCatalogGame = gameChoices.find(game => game.id === gameId) || { id: gameId, name: `GameBanana #${gameId}` }
  const visibleMods = showNsfw ? mods : mods.filter(mod => !mod.nsfw)
  const hiddenNsfw = mods.length - visibleMods.length

  useEffect(() => {
    if (!native.isDesktop()) return
    void native.providerConnectionStatuses().then(setProviderStatuses).catch(() => undefined)
    let unlisten: (() => void) | undefined
    void listen<ProviderConnectionStatus>('provider-status-changed', event => {
      setProviderStatuses(current => ({ ...current, [event.payload.provider]: event.payload }))
    }).then(listener => { unlisten = listener })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (platform !== 'gamebanana') return
    const timeout = window.setTimeout(() => void refresh(), search ? 450 : 0)
    return () => window.clearTimeout(timeout)
  }, [platform, gameId, page, sort, search, refresh])

  useEffect(() => {
    if (platform !== 'gamebanana') return
    const timeout = window.setTimeout(() => void searchGames(), 400)
    return () => window.clearTimeout(timeout)
  }, [gameQuery, platform, searchGames])

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
      {providers.map(provider => {
        const connected = provider.ready || (provider.id === 'nexus' && providerStatuses.nexus?.configured)
        const detail = provider.id === 'nexus' && providerStatuses.nexus?.configured
          ? providerStatuses.nexus.connected ? `Connecté${providerStatuses.nexus.accountName ? ` · ${providerStatuses.nexus.accountName}` : ''}` : 'Clé sécurisée · test conseillé'
          : provider.detail
        return <button
          key={provider.id}
          type="button"
          onClick={() => setPlatform(provider.id)}
          className={`rounded-xl border p-3 text-left transition-colors ${platform === provider.id ? 'border-gold/28 bg-gold/[0.07]' : 'border-white/[0.07] bg-white/[0.018] hover:border-white/15 hover:bg-white/[0.04]'}`}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white/82">{provider.name}</span>
            {connected ? <CheckCircle2 size={14} className="text-emerald-300/72" /> : <KeyRound size={14} className="text-white/28" />}
          </span>
          <span className="mt-1 block text-[11px] text-white/38">{detail}</span>
        </button>
      })}
    </section>

    {!readyProvider ? <ProviderUnavailable provider={providers.find(item => item.id === platform)?.name || platform} onConfigure={() => setView('settings')} /> : platform === 'nexus' ? <NexusCatalog selectedGameName={selectedGame?.name} showNsfw={showNsfw} /> : <>
      <section className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <label className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 focus-within:border-gold/26">
              <Gamepad2 size={15} className="shrink-0 text-white/42" />
              <span className="sr-only">Rechercher un jeu GameBanana</span>
              <input value={gameQuery} onChange={event => setGameQuery(event.target.value)} placeholder={selectedCatalogGame.name || 'Chercher un jeu GameBanana…'} autoComplete="off" className="min-w-0 flex-1 bg-transparent text-xs text-white/76 outline-none placeholder:text-white/42" />
              <button type="button" onClick={() => pinGame(selectedCatalogGame)} title="Épingler ou désépingler ce jeu" className={pinnedGames.some(game => game.id === gameId) ? 'text-gold' : 'text-white/30 hover:text-white'}><Pin size={14} /></button>
            </label>
            {gameQuery.trim().length >= 2 && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/[0.1] bg-[#101313] p-1 shadow-2xl">
              {gamesLoading ? <p className="flex items-center gap-2 px-3 py-3 text-[11px] text-white/42"><Loader2 size={13} className="animate-spin" />Recherche GameBanana…</p> : gameError ? <p className="px-3 py-3 text-[11px] text-red-200/65">{gameError}</p> : gameChoices.length ? gameChoices.map(game => <button key={game.id} type="button" onClick={() => { setGame(game.id); setGameQuery('') }} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs text-white/68 hover:bg-white/[0.06] hover:text-white"><span className="truncate">{game.name}</span><span className="font-mono text-[11px] text-white/28">#{game.id}</span></button>) : <p className="px-3 py-3 text-[11px] text-white/38">Aucun jeu correspondant.</p>}
            </div>}
          </div>

          <form onSubmit={submitSearch} className="flex min-w-0 flex-[1.3] items-center rounded-lg border border-white/[0.08] bg-black/20 focus-within:border-gold/26">
            <Search size={15} className="ml-3 shrink-0 text-white/32" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Filtrer les mods de cette page…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs text-white/78 outline-none placeholder:text-white/25" />
            <button type="submit" disabled={loading} className="mr-1 rounded-md bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/62 hover:bg-white/[0.1] disabled:opacity-40">Rechercher</button>
          </form>

          <div className="flex items-center gap-1">
            <button type="button" onClick={() => void refresh()} disabled={loading} title="Actualiser le catalogue" aria-label="Actualiser le catalogue" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-white/46 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
            <button type="button" onClick={() => setGrid(true)} title="Affichage en grille" aria-label="Affichage en grille" className={`flex h-9 w-9 items-center justify-center rounded-lg ${grid ? 'bg-gold text-[#101313]' : 'border border-white/[0.08] text-white/38 hover:text-white'}`}><Grid2X2 size={14} /></button>
            <button type="button" onClick={() => setGrid(false)} title="Affichage en liste" aria-label="Affichage en liste" className={`flex h-9 w-9 items-center justify-center rounded-lg ${!grid ? 'bg-gold text-[#101313]' : 'border border-white/[0.08] text-white/38 hover:text-white'}`}><LayoutList size={15} /></button>
            {grid && <label className="ml-1 flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] px-2 text-[11px] text-white/46">Colonnes<select value={columns} onChange={event => setColumns(event.target.value as typeof columns)} className="bg-[#101313] text-white/72"><option value="auto">Auto</option><option value="2">2</option><option value="3">3</option></select></label>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-white/45">Trier par <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="ml-1 rounded border border-white/[0.08] bg-[#101313] px-2 py-1.5 text-[11px] text-white/75"><option value="recent">Récent</option><option value="updated">Récemment mis à jour</option><option value="popular">Mentions J’aime (page)</option><option value="downloaded">Téléchargements (page)</option></select></label>
          <button type="button" onClick={() => { setSearch(''); setSort('recent'); setPage(1) }} className="rounded border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-white/50 hover:text-white">Réinitialiser les filtres</button>
          <span className="ml-auto text-[11px] text-white/30">Page {page}</span>
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

        {loading && !mods.length ? <LoadingGrid /> : !visibleMods.length && !error ? <EmptyResults onReset={() => { setSearch(''); void refresh() }} /> : <div className={grid ? `grid gap-3 ${columns === '2' ? 'md:grid-cols-2' : columns === '3' ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2 2xl:grid-cols-3'}` : 'space-y-2'}>
          {visibleMods.map(mod => <ModResult key={mod.id} mod={mod} grid={grid} installing={installingId === mod.id} canInstall={Boolean(selectedGame?.modsPath)} targetName={selectedGame?.name} onPreview={() => setPreviewMod(mod)} onInstall={() => void install(mod)} />)}
        </div>}
        <div className="mt-4 flex items-center justify-center gap-2" aria-label="Pagination GameBanana">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className="flex h-9 items-center gap-1 rounded-lg border border-white/[0.08] px-3 text-[11px] text-white/65 hover:bg-white/[0.05] disabled:opacity-25"><ChevronLeft size={14} /> Précédent</button>
          <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-gold text-[11px] font-bold text-[#101313]">{page}</span>
          <button type="button" disabled={!hasNextPage || loading} onClick={() => setPage(page + 1)} className="flex h-9 items-center gap-1 rounded-lg border border-white/[0.08] px-3 text-[11px] text-white/65 hover:bg-white/[0.05] disabled:opacity-25">Suivant <ChevronRight size={14} /></button>
        </div>
      </section>
    </>}
    {previewMod && <ModPreviewModal mod={previewMod} canInstall={Boolean(selectedGame?.modsPath)} installing={installingId === previewMod.id} onInstall={() => void install(previewMod)} onClose={() => setPreviewMod(undefined)} />}
  </div>
}

function TargetGame({ gameName, configured, onConfigure }: { gameName?: string; configured: boolean; onConfigure: () => void }) {
  return <button type="button" onClick={onConfigure} className={`flex max-w-sm items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${configured ? 'border-emerald-300/16 bg-emerald-300/[0.035]' : 'border-amber-300/18 bg-amber-300/[0.035]'}`}>
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${configured ? 'bg-emerald-300/10 text-emerald-200/72' : 'bg-amber-300/10 text-amber-200/72'}`}><Gamepad2 size={16} /></span>
    <span className="min-w-0"><span className="block text-[11px] uppercase tracking-[0.12em] text-white/32">Cible d’installation</span><span className="block truncate text-xs font-semibold text-white/76">{configured ? gameName : 'Configurer un dossier Mods'}</span></span>
  </button>
}

function NexusCatalog({ selectedGameName, showNsfw }: { selectedGameName?: string; showNsfw: boolean }) {
  const columns = useStore(state => state.exploreColumns)
  const [games, setGames] = useState<NexusCatalogGame[]>([])
  const [domain, setDomain] = useState('')
  const [gameFilter, setGameFilter] = useState(selectedGameName || '')
  const [feed, setFeed] = useState<'recent' | 'updated' | 'trending'>('trending')
  const [query, setQuery] = useState('')
  const [mods, setMods] = useState<NexusCatalogMod[]>([])
  const [loadingGames, setLoadingGames] = useState(true)
  const [loadingMods, setLoadingMods] = useState(false)
  const [error, setError] = useState<string>()
  const [previewMod, setPreviewMod] = useState<ExplodMod>()

  useEffect(() => {
    let active = true
    setLoadingGames(true)
    void native.nexusCatalogGames().then(items => {
      if (!active) return
      setGames(items)
      const normalized = (selectedGameName || '').toLocaleLowerCase()
      const match = items.find(game => game.name.toLocaleLowerCase() === normalized)
        || items.find(game => normalized && (game.name.toLocaleLowerCase().includes(normalized) || normalized.includes(game.name.toLocaleLowerCase())))
      if (match) {
        setDomain(match.domain)
        setGameFilter(match.name)
      }
      setLoadingGames(false)
    }).catch(reason => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setLoadingGames(false)
    })
    return () => { active = false }
  }, [selectedGameName])

  const loadMods = async (nextDomain = domain, nextFeed = feed) => {
    if (!nextDomain) return
    setLoadingMods(true)
    setError(undefined)
    try {
      setMods(await native.nexusCatalogMods(nextDomain, nextFeed))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoadingMods(false)
    }
  }

  useEffect(() => {
    if (domain) void loadMods(domain, feed)
  }, [domain, feed])

  const gameMatches = gameFilter.trim().length < 2 ? games.slice(0, 25) : games
    .filter(game => `${game.name} ${game.domain}`.toLocaleLowerCase().includes(gameFilter.trim().toLocaleLowerCase()))
    .slice(0, 25)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleMods = mods.filter(mod => (showNsfw || !mod.nsfw) && (!normalizedQuery || `${mod.name} ${mod.author} ${mod.description}`.toLocaleLowerCase().includes(normalizedQuery)))
  const selectedCatalogGame = games.find(game => game.domain === domain)

  return <section className="mt-4">
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="min-w-0 flex-1 text-[11px] text-white/48">Jeu Nexus
          <div className="relative mt-1.5">
            <input value={gameFilter} onChange={event => setGameFilter(event.target.value)} placeholder={loadingGames ? 'Chargement des jeux Nexus…' : 'Nom ou domaine Nexus…'} className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/78 outline-none focus:border-gold/26" />
            {gameFilter && gameFilter !== selectedCatalogGame?.name && gameMatches.length > 0 && <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-white/[0.1] bg-[#101313] p-1 shadow-2xl">
              {gameMatches.map(game => <button key={game.domain} type="button" onClick={() => { setDomain(game.domain); setGameFilter(game.name) }} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[11px] text-white/62 hover:bg-white/[0.06] hover:text-white"><span className="truncate">{game.name}</span><span className="shrink-0 font-mono text-white/28">{game.domain}</span></button>)}
            </div>}
          </div>
        </label>
        <label className="text-[11px] text-white/48">Flux
          <select value={feed} onChange={event => setFeed(event.target.value as typeof feed)} className="mt-1.5 block w-full rounded-lg border border-white/[0.08] bg-[#101313] px-3 py-2 text-xs text-white/76"><option value="trending">Tendances</option><option value="recent">Nouveautés</option><option value="updated">Mis à jour</option></select>
        </label>
        <label className="min-w-0 flex-1 text-[11px] text-white/48">Filtrer les résultats
          <span className="mt-1.5 flex items-center rounded-lg border border-white/[0.08] bg-black/20 px-3"><Search size={14} className="text-white/30" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nom, auteur, description…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs text-white/78 outline-none" /></span>
        </label>
        <button type="button" onClick={() => void loadMods()} disabled={!domain || loadingMods} className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-[11px] font-semibold text-white/62 hover:bg-white/[0.06] disabled:opacity-35"><RefreshCw size={14} className={loadingMods ? 'animate-spin' : ''} />Actualiser</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/34"><span>{selectedCatalogGame ? `${selectedCatalogGame.name} · ${formatCount(selectedCatalogGame.modCount)} mods` : 'Choisissez un jeu Nexus pour charger son catalogue.'}</span><span>La clé reste dans le coffre système ; seules les données du catalogue arrivent dans l’interface.</span></div>
    </div>

    {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/18 bg-red-400/[0.04] p-4 text-[11px] text-red-200/70"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
    {loadingMods ? <LoadingGrid /> : domain && !visibleMods.length && !error ? <EmptyResults onReset={() => { setQuery(''); void loadMods() }} /> : <div className={`mt-4 grid gap-3 ${columns === '2' ? 'md:grid-cols-2' : columns === '3' ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2 2xl:grid-cols-3'}`}>
      {visibleMods.map(item => {
        const mod: ExplodMod = {
          id: item.id,
          modId: item.modId,
          name: item.name,
          author: item.author || 'Auteur Nexus',
          game: item.game || selectedCatalogGame?.name || item.gameDomain,
          thumbnail: item.thumbnail,
          downloads: item.downloads,
          rating: item.endorsements,
          tags: item.version ? [`v${item.version}`] : ['Nexus Mods'],
          nsfw: item.nsfw,
          platform: 'nexus',
          url: item.url,
          description: item.description,
          updatedAt: item.updatedAt,
        }
        return <ModResult key={mod.id} mod={mod} grid installing={false} canInstall={false} sourceOnly targetName={selectedCatalogGame?.name} onPreview={() => setPreviewMod(mod)} onInstall={() => undefined} />
      })}
    </div>}
    {previewMod && <ModPreviewModal mod={previewMod} canInstall={false} sourceOnly installing={false} onInstall={() => undefined} onClose={() => setPreviewMod(undefined)} />}
  </section>
}

function ProviderUnavailable({ provider, onConfigure }: { provider: string; onConfigure: () => void }) {
  return <section className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.018] px-5 text-center">
    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/34"><KeyRound size={19} /></div>
    <h2 className="mt-3 text-sm font-semibold text-white/72">{provider} n’est pas encore connecté</h2>
    <p className="mt-1 max-w-md text-[11px] leading-relaxed text-white/38">Cette source exige une authentification ou une clé API. ZAILON ne présente aucun résultat fictif : GameBanana reste disponible immédiatement sans compte.</p>
    <button type="button" onClick={onConfigure} className="mt-4 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[#101313]">Ouvrir les paramètres</button>
  </section>
}

function ModPreviewModal({ mod, canInstall, sourceOnly = false, installing, onInstall, onClose }: {
  mod: ExplodMod
  canInstall: boolean
  sourceOnly?: boolean
  installing: boolean
  onInstall: () => void
  onClose: () => void
}) {
  const allImages = [...new Set([mod.thumbnail, ...(mod.screenshots || [])].filter(Boolean))]
  const [brokenImages, setBrokenImages] = useState<string[]>([])
  const images = allImages.filter(image => !brokenImages.includes(image))
  const [imageIndex, setImageIndex] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const tiltRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number>()
  const currentImage = images[imageIndex]
  const thumbnailSource = (source: string) => source.replace(
    /(images\.gamebanana\.com\/img\/ss\/mods\/)(?!\d+-\d+_)([^/?]+)(\?.*)?$/i,
    (_match, base: string, file: string, query: string | undefined) => `${base}100-90_${file}${query || ''}`,
  )
  const openSource = () => native.isDesktop() ? native.openExternalUrl(mod.url) : window.open(mod.url, '_blank', 'noopener,noreferrer')
  const previous = () => setImageIndex(index => (index - 1 + images.length) % images.length)
  const next = () => setImageIndex(index => (index + 1) % images.length)

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') lightbox ? setLightbox(false) : onClose()
      if (event.key === 'ArrowLeft' && images.length > 1) previous()
      if (event.key === 'ArrowRight' && images.length > 1) next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [images.length, lightbox, onClose])

  useEffect(() => {
    if (images.length < 2) return
    const neighbors = [images[(imageIndex - 1 + images.length) % images.length], images[(imageIndex + 1) % images.length]]
    neighbors.forEach(source => { const image = new Image(); image.src = source })
  }, [imageIndex, images.join('|')])

  useEffect(() => () => window.cancelAnimationFrame(frameRef.current || 0), [])

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2))
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2))
    window.cancelAnimationFrame(frameRef.current || 0)
    frameRef.current = window.requestAnimationFrame(() => {
      if (tiltRef.current) tiltRef.current.style.transform = `rotateX(${-y * 5}deg) rotateY(${x * 7}deg) scale(1.005)`
    })
  }
  const resetTilt = () => {
    window.cancelAnimationFrame(frameRef.current || 0)
    frameRef.current = window.requestAnimationFrame(() => {
      if (tiltRef.current) tiltRef.current.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)'
    })
  }
  const imageFailed = (source: string) => {
    setBrokenImages(current => current.includes(source) ? current : [...current, source])
    setImageIndex(0)
  }

  return <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/82 p-3 backdrop-blur-md" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="mod-preview-title" className="grid max-h-[94vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-white/[0.11] bg-[#101313] shadow-[0_36px_120px_rgba(0,0,0,.82)] lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,.75fr)]">
      <div className="min-h-0 border-b border-white/[0.07] lg:border-b-0 lg:border-r">
        <div onPointerMove={tilt} onPointerLeave={resetTilt} className="relative flex min-h-[320px] h-[58vh] max-h-[680px] items-center justify-center overflow-hidden bg-black/45" style={{ perspective: 1000 }}>
          <div ref={tiltRef} className="flex h-full w-full items-center justify-center transition-transform duration-300 ease-out will-change-transform">
            {currentImage ? <img src={currentImage} onClick={() => setLightbox(true)} onError={() => imageFailed(currentImage)} alt={`Aperçu ${imageIndex + 1} de ${mod.name}`} title="Ouvrir au format complet" className="h-full w-full cursor-zoom-in object-contain" /> : <div className="text-center text-white/24"><Compass size={38} className="mx-auto" /><p className="mt-3 text-[11px]">Aucune capture disponible</p></div>}
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/65 to-transparent p-3"><span className="rounded bg-black/45 px-2 py-1 text-[11px] text-white/56">Galerie 3D en parallaxe</span>{images.length > 0 && <span className="rounded bg-black/45 px-2 py-1 font-mono text-[11px] text-white/56">{imageIndex + 1} / {images.length}</span>}</div>
          {images.length > 1 && <><button type="button" onClick={previous} aria-label="Image précédente" className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/75 backdrop-blur hover:bg-black/80"><ChevronLeft size={20} /></button><button type="button" onClick={next} aria-label="Image suivante" className="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/75 backdrop-blur hover:bg-black/80"><ChevronRight size={20} /></button></>}
        </div>
        {images.length > 1 && <div className="flex gap-2 overflow-x-auto border-t border-white/[0.06] p-2">{images.map((image, index) => <button key={image} type="button" onClick={() => { setImageIndex(index); resetTilt() }} aria-label={`Afficher l’image ${index + 1}`} className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border ${index === imageIndex ? 'border-gold/70' : 'border-white/[0.08]'}`}><img src={thumbnailSource(image)} onError={event => { if (!event.currentTarget.dataset.fullFallback) { event.currentTarget.dataset.fullFallback = 'true'; event.currentTarget.src = image } else imageFailed(image) }} alt="" loading={Math.abs(index - imageIndex) <= 1 ? 'eager' : 'lazy'} className="h-full w-full object-cover" /></button>)}</div>}
      </div>
      <aside className="flex min-h-0 flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.07] p-4"><div className="min-w-0"><p className="font-mono text-[11px] uppercase tracking-[0.18em] text-gold/60">{mod.platform === 'nexus' ? 'Nexus Mods' : 'GameBanana'} · {mod.game}</p><h2 id="mod-preview-title" className="mt-1 font-display text-2xl font-bold text-white">{mod.name}</h2><p className="mt-1 text-[11px] text-white/42">par {mod.author}</p></div><button type="button" onClick={onClose} aria-label="Fermer l’aperçu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/42 hover:bg-white/[0.07] hover:text-white"><X size={17} /></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-white/[0.025] p-3"><p className="text-[11px] text-white/32">Téléchargements</p><p className="mt-1 text-sm font-semibold text-white/76">{formatCount(mod.downloads)}</p></div><div className="rounded-lg bg-white/[0.025] p-3"><p className="text-[11px] text-white/32">Mentions J’aime</p><p className="mt-1 text-sm font-semibold text-white/76">{formatCount(mod.rating)}</p></div></div>
          {mod.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{mod.tags.map(tag => <span key={tag} className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[11px] text-white/44">{tag}</span>)}{mod.nsfw && <span className="rounded-full border border-red-300/18 bg-red-300/[0.06] px-2 py-1 text-[11px] text-red-200/70">NSFW</span>}</div>}
          <div className="mt-4"><h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/48">Description</h3><p className="mt-2 whitespace-pre-line text-[11px] leading-relaxed text-white/48">{mod.description || 'Aucune description fournie par la source.'}</p></div>
          <p className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.018] p-3 text-[11px] leading-relaxed text-white/34">Source vérifiable : aucune miniature NSFW masquée n’est chargée. Seules l’image courante et ses deux voisines sont préchargées dans cette galerie.</p>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] p-4"><button type="button" onClick={() => void openSource()} className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/62 hover:bg-white/[0.05]"><ExternalLink size={13} />Voir la page source</button><button type="button" onClick={sourceOnly ? () => void openSource() : onInstall} disabled={installing} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[#101313] disabled:opacity-40">{installing ? <Loader2 size={13} className="animate-spin" /> : sourceOnly ? <ExternalLink size={13} /> : <Download size={13} />}{installing ? 'Installation…' : sourceOnly ? 'Ouvrir Nexus' : canInstall ? 'Installer' : 'Configurer le jeu'}</button></footer>
      </aside>
    </section>
    {lightbox && currentImage && <div role="dialog" aria-modal="true" aria-label={`Image ${imageIndex + 1} de ${mod.name} au format complet`} className="fixed inset-0 z-[280] flex flex-col bg-black/94 p-3 backdrop-blur-xl" onPointerDown={event => { if (event.target === event.currentTarget) setLightbox(false) }}>
      <header className="flex items-center justify-between gap-3 pb-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white/78">{mod.name}</p><p className="text-[11px] text-white/40">{imageIndex + 1} / {images.length} · image complète conservée dans la fiche</p></div><button type="button" onClick={() => setLightbox(false)} aria-label="Fermer l’image complète" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white/70 hover:bg-white/10"><X size={18} /></button></header>
      <div className="relative min-h-0 flex-1" onPointerDown={event => event.stopPropagation()}><img src={currentImage} onError={() => imageFailed(currentImage)} alt={`Image complète ${imageIndex + 1} de ${mod.name}`} className="h-full w-full select-none object-contain" />{images.length > 1 && <><button type="button" onClick={previous} aria-label="Image précédente" className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/80"><ChevronLeft size={22} /></button><button type="button" onClick={next} aria-label="Image suivante" className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/80"><ChevronRight size={22} /></button></>}</div>
      {images.length > 1 && <div className="mx-auto mt-2 flex max-w-full gap-2 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/35 p-2">{images.map((image, index) => <button key={image} type="button" onClick={() => setImageIndex(index)} className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border ${index === imageIndex ? 'border-gold' : 'border-white/10'}`}><img src={thumbnailSource(image)} alt="" className="h-full w-full object-cover" /></button>)}</div>}
    </div>}
  </div>
}

function ModResult({ mod, grid, installing, canInstall, sourceOnly = false, targetName, onPreview, onInstall }: { mod: ExplodMod; grid: boolean; installing: boolean; canInstall: boolean; sourceOnly?: boolean; targetName?: string; onPreview: () => void; onInstall: () => void }) {
  const openSource = () => native.isDesktop() ? native.openExternalUrl(mod.url) : window.open(mod.url, '_blank', 'noopener,noreferrer')
  return <article className={`group overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.018] transition-colors hover:border-white/15 hover:bg-white/[0.03] ${grid ? '' : 'flex min-h-28'}`}>
    <button type="button" onClick={onPreview} aria-label={`Aperçu rapide de ${mod.name}`} className={`relative shrink-0 cursor-pointer overflow-hidden bg-white/[0.025] text-left ${grid ? 'aspect-[16/7] w-full' : 'w-44'}`}>
      {mod.thumbnail ? <img src={mod.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover opacity-75 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-90" /> : <div className="flex h-full items-center justify-center text-white/16"><Compass size={26} /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0d1010] via-transparent to-transparent" />
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[11px] font-semibold text-white/62 backdrop-blur-sm">{mod.game}</span>
    </button>
    <div className="flex min-w-0 flex-1 flex-col p-3.5">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-white/82" title={mod.name}>{mod.name}</h2><p className="mt-0.5 truncate text-[11px] text-white/38">par {mod.author}</p></div>
        {mod.nsfw && <span className="rounded border border-red-300/18 bg-red-300/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-red-200/70">NSFW</span>}
      </div>
      {mod.description && <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-white/34">{mod.description}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <span className="text-[11px] text-white/32">{formatCount(mod.downloads)} téléchargements · {formatCount(mod.rating)} mentions J’aime</span>
        <span className="flex items-center gap-1.5">
          <button type="button" onClick={() => void openSource()} title={`Ouvrir la page ${mod.platform === 'nexus' ? 'Nexus Mods' : 'GameBanana'}`} aria-label={`Ouvrir ${mod.name} sur ${mod.platform === 'nexus' ? 'Nexus Mods' : 'GameBanana'}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-white/38 hover:bg-white/[0.06] hover:text-white"><ExternalLink size={13} /></button>
          <button type="button" onClick={sourceOnly ? () => void openSource() : onInstall} disabled={installing} title={sourceOnly ? `Ouvrir ${mod.name} sur Nexus Mods` : canInstall ? `Installer dans ${targetName}` : 'Configurer d’abord le dossier Mods du jeu cible'} className={`flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition-colors ${canInstall || sourceOnly ? 'bg-[#dbe8e5] text-[#101313] hover:bg-white' : 'border border-amber-200/16 bg-amber-200/[0.04] text-amber-100/64'} disabled:opacity-45`}>
            {installing ? <Loader2 size={13} className="animate-spin" /> : sourceOnly ? <ExternalLink size={13} /> : <Download size={13} />}{installing ? 'Installation…' : sourceOnly ? 'Voir sur Nexus' : canInstall ? 'Installer' : 'Configurer'}
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
