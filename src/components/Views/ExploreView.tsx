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
  KeyRound,
  Loader2,
  Pin,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { ExplodMod, Platform } from '../../types'
import {
  native,
  NexusAccountCapabilities,
  NexusCatalogGame,
  NexusCatalogPage,
  NexusCollectionDetail,
  NexusCollectionPage,
  NexusCollectionSummary,
  ProviderConnectionStatus,
} from '../../lib/native'
import { NexusExplorerAdapter } from '../../lib/explorerProviders'
import { GridColumnCycleButton, ProviderExplorerToolbar, ProviderFilters, ProviderPagination, ProviderSearchResults, ProviderSortControl, ProviderViewModeToggle } from '../Explorer/ProviderExplorer'

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

const NEXUS_SESSION_KEY = 'zailon:nexus-explorer:v2'
const NEXUS_CACHE_TTL = 5 * 60 * 1000
const nexusPageCache = new Map<string, { page: NexusCatalogPage; cachedAt: number }>()
const nexusCollectionPageCache = new Map<string, { page: NexusCollectionPage; cachedAt: number }>()

type NexusExplorerSession = {
  mode?: 'mods' | 'collections'
  domain: string
  gameFilter: string
  query: string
  sort: 'recent' | 'updated' | 'popular' | 'downloaded'
  page: number
  pageSize: number
}

const readNexusSession = (): NexusExplorerSession => {
  const fallback: NexusExplorerSession = { mode: 'mods', domain: '', gameFilter: '', query: '', sort: 'recent', page: 1, pageSize: 20 }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(NEXUS_SESSION_KEY) || '{}') as Partial<NexusExplorerSession>
    return {
      mode: parsed.mode === 'collections' ? 'collections' : 'mods',
      domain: typeof parsed.domain === 'string' ? parsed.domain : fallback.domain,
      gameFilter: typeof parsed.gameFilter === 'string' ? parsed.gameFilter : fallback.gameFilter,
      query: typeof parsed.query === 'string' ? parsed.query : fallback.query,
      sort: ['recent', 'updated', 'popular', 'downloaded'].includes(parsed.sort || '') ? parsed.sort as NexusExplorerSession['sort'] : fallback.sort,
      page: typeof parsed.page === 'number' && parsed.page >= 1 ? Math.floor(parsed.page) : fallback.page,
      pageSize: [20, 40, 60].includes(parsed.pageSize || 0) ? parsed.pageSize as number : fallback.pageSize,
    }
  } catch {
    return fallback
  }
}

const writeNexusSession = (session: NexusExplorerSession) => {
  try { window.localStorage.setItem(NEXUS_SESSION_KEY, JSON.stringify(session)) } catch { /* Le cache de session reste facultatif. */ }
}

const nexusCacheKey = (domain: string, query: string, sort: string, page: number, pageSize: number, showNsfw: boolean) =>
  [domain, query.trim().toLocaleLowerCase(), sort, page, pageSize, showNsfw ? 'adult' : 'safe'].join('|')

const cacheNexusPage = (key: string, page: NexusCatalogPage) => {
  nexusPageCache.set(key, { page, cachedAt: Date.now() })
  while (nexusPageCache.size > 80) {
    const oldest = nexusPageCache.keys().next().value
    if (typeof oldest !== 'string') break
    nexusPageCache.delete(oldest)
  }
}

const cacheNexusCollectionPage = (key: string, page: NexusCollectionPage) => {
  nexusCollectionPageCache.set(key, { page, cachedAt: Date.now() })
  while (nexusCollectionPageCache.size > 80) {
    const oldest = nexusCollectionPageCache.keys().next().value
    if (typeof oldest !== 'string') break
    nexusCollectionPageCache.delete(oldest)
  }
}

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '—'
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1 }
  return `${size.toLocaleString('fr-FR', { maximumFractionDigits: unit > 1 ? 1 : 0 })} ${units[unit]}`
}

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

    {!readyProvider ? <ProviderUnavailable provider={providers.find(item => item.id === platform)?.name || platform} onConfigure={() => setView('settings')} /> : platform === 'nexus' ? <NexusCatalogV2 selectedGameName={selectedGame?.name} showNsfw={showNsfw} /> : <>
      <section className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3">
        <ProviderExplorerToolbar>
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
            <ProviderViewModeToggle grid={grid} onChange={setGrid} />
            {grid && <GridColumnCycleButton currentColumnCount={columns} onChange={setColumns} />}
          </div>
        </ProviderExplorerToolbar>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ProviderSortControl value={sort} onChange={setSort} />
          <ProviderFilters onReset={() => { setSearch(''); setSort('recent'); setPage(1) }} />
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

        <ProviderSearchResults grid={grid} columns={columns} loading={loading && !mods.length} empty={!visibleMods.length && !error} loadingFallback={<LoadingGrid />} emptyFallback={<EmptyResults onReset={() => { setSearch(''); void refresh() }} />}>
          {visibleMods.map(mod => <ModResult key={mod.id} mod={mod} grid={grid} installing={installingId === mod.id} canInstall={Boolean(selectedGame?.modsPath)} targetName={selectedGame?.name} onPreview={() => setPreviewMod(mod)} onInstall={() => void install(mod)} />)}
        </ProviderSearchResults>
        <ProviderPagination provider="GameBanana" page={page} hasNextPage={hasNextPage} loading={loading} onPageChange={setPage} />
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
  const grid = useStore(state => state.exploreGrid)
  const setGrid = useStore(state => state.setExploreGrid)
  const setColumns = useStore(state => state.setExploreColumns)
  const restored = useRef<NexusExplorerSession>(readNexusSession())
  const [games, setGames] = useState<NexusCatalogGame[]>([])
  const [domain, setDomain] = useState(restored.current.domain)
  const [gameFilter, setGameFilter] = useState(selectedGameName || restored.current.gameFilter)
  const [query, setQuery] = useState(restored.current.query)
  const [serverQuery, setServerQuery] = useState(restored.current.query.trim())
  const [sort, setSort] = useState<NexusExplorerSession['sort']>(restored.current.sort)
  const [page, setPage] = useState(restored.current.page)
  const [pageSize, setPageSize] = useState(restored.current.pageSize)
  const [catalogPage, setCatalogPage] = useState<NexusCatalogPage>()
  const [loadingGames, setLoadingGames] = useState(true)
  const [loadingMods, setLoadingMods] = useState(false)
  const [error, setError] = useState<string>()
  const [previewMod, setPreviewMod] = useState<ExplodMod>()
  const requestSerial = useRef(0)
  const resultsRef = useRef<HTMLElement>(null)
  const pendingScroll = useRef(false)
  const firstQueryEffect = useRef(true)
  const previousNsfw = useRef(showNsfw)

  useEffect(() => {
    let active = true
    setLoadingGames(true)
    void native.nexusCatalogGames().then(items => {
      if (!active) return
      setGames(items)
      const normalized = (selectedGameName || '').toLocaleLowerCase()
      const selectedMatch = items.find(game => game.name.toLocaleLowerCase() === normalized)
        || items.find(game => normalized && (game.name.toLocaleLowerCase().includes(normalized) || normalized.includes(game.name.toLocaleLowerCase())))
      const restoredMatch = items.find(game => game.domain === restored.current.domain)
      const match = selectedMatch || restoredMatch
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

  const loadMods = async (force = false) => {
    const nextDomain = domain
    if (!nextDomain) return
    const key = nexusCacheKey(nextDomain, serverQuery, sort, page, pageSize, showNsfw)
    const cached = nexusPageCache.get(key)
    if (!force && cached && Date.now() - cached.cachedAt < NEXUS_CACHE_TTL) {
      ++requestSerial.current
      setCatalogPage(cached.page)
      setError(undefined)
      setLoadingMods(false)
      if (pendingScroll.current) {
        pendingScroll.current = false
        window.requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      }
      return
    }
    if (force) nexusPageCache.delete(key)
    const request = ++requestSerial.current
    setLoadingMods(true)
    setError(undefined)
    try {
      const result = await native.nexusCatalogMods(nextDomain, serverQuery, sort, page, pageSize, showNsfw)
      if (request === requestSerial.current) {
        cacheNexusPage(key, result)
        setCatalogPage(result)
        if (result.pagination.totalPages > 0 && page > result.pagination.totalPages) {
          setPage(result.pagination.totalPages)
        } else if (pendingScroll.current) {
          pendingScroll.current = false
          window.requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
        }
      }
    } catch (reason) {
      if (request === requestSerial.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (request === requestSerial.current) setLoadingMods(false)
    }
  }

  useEffect(() => {
    if (domain) void loadMods()
  }, [domain, serverQuery, sort, page, pageSize, showNsfw])

  useEffect(() => {
    if (firstQueryEffect.current) {
      firstQueryEffect.current = false
      return
    }
    const timer = window.setTimeout(() => {
      setPage(1)
      setServerQuery(query.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (previousNsfw.current === showNsfw) return
    previousNsfw.current = showNsfw
    setPage(1)
  }, [showNsfw])

  useEffect(() => {
    writeNexusSession({ domain, gameFilter, query, sort, page, pageSize })
  }, [domain, gameFilter, query, sort, page, pageSize])

  const gameMatches = gameFilter.trim().length < 2 ? games.slice(0, 25) : games
    .filter(game => `${game.name} ${game.domain}`.toLocaleLowerCase().includes(gameFilter.trim().toLocaleLowerCase()))
    .slice(0, 25)
  const mods = catalogPage?.results || []
  const selectedCatalogGame = games.find(game => game.domain === domain)
  const pageCount = Math.max(1, catalogPage?.pagination.totalPages || 1)
  const changePage = (next: number) => {
    const target = Math.max(1, Math.min(pageCount, next))
    if (target === page) return
    pendingScroll.current = true
    setPage(target)
  }

  return <section className="mt-4">
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <ProviderExplorerToolbar>
        <label className="min-w-0 flex-1 text-[11px] text-white/48">Jeu Nexus
          <div className="relative mt-1.5">
            <input value={gameFilter} onChange={event => setGameFilter(event.target.value)} placeholder={loadingGames ? 'Chargement des jeux Nexus…' : 'Nom ou domaine Nexus…'} className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/78 outline-none focus:border-gold/26" />
            {gameFilter && gameFilter !== selectedCatalogGame?.name && gameMatches.length > 0 && <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-white/[0.1] bg-[#101313] p-1 shadow-2xl">
              {gameMatches.map(game => <button key={game.domain} type="button" onClick={() => { setDomain(game.domain); setGameFilter(game.name); setPage(1) }} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[11px] text-white/62 hover:bg-white/[0.06] hover:text-white"><span className="truncate">{game.name}</span><span className="shrink-0 font-mono text-white/28">{game.domain}</span></button>)}
            </div>}
          </div>
        </label>
        <label className="min-w-0 flex-1 text-[11px] text-white/48">Rechercher sur Nexus
          <span className="mt-1.5 flex items-center rounded-lg border border-white/[0.08] bg-black/20 px-3"><Search size={14} className="text-white/30" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Titre, auteur ou description…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs text-white/78 outline-none" /></span>
        </label>
        <button type="button" onClick={() => void loadMods(true)} disabled={!domain || loadingMods} className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-[11px] font-semibold text-white/62 hover:bg-white/[0.06] disabled:opacity-35"><RefreshCw size={14} className={loadingMods ? 'animate-spin' : ''} />Actualiser</button>
        <ProviderViewModeToggle grid={grid} onChange={setGrid} />
        {grid && <GridColumnCycleButton currentColumnCount={columns} onChange={setColumns} />}
      </ProviderExplorerToolbar>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ProviderSortControl value={sort} onChange={value => { setSort(value); setPage(1) }} />
        <label className="text-[11px] text-white/45">Par page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }} className="ml-1 rounded border border-white/[0.08] bg-[#101313] px-2 py-1.5 text-[11px] text-white/75"><option value={20}>20</option><option value={40}>40</option><option value={60}>60</option></select></label>
        <ProviderFilters onReset={() => { setQuery(''); setServerQuery(''); setSort('recent'); setPage(1); setPageSize(20) }} />
        <span className="ml-auto text-[11px] text-white/30">Page {page} / {pageCount}</span>
      </div>
      <div className="mt-3 grid gap-2 text-[11px] text-white/38 sm:grid-cols-3">
        <span className="rounded-lg border border-white/[0.06] bg-white/[0.018] px-3 py-2">Catalogue du jeu <strong className="ml-1 text-white/65">{selectedCatalogGame ? formatCount(selectedCatalogGame.modCount) : '—'}</strong></span>
        <span className="rounded-lg border border-white/[0.06] bg-white/[0.018] px-3 py-2">Résultats filtrés <strong className="ml-1 text-white/65">{catalogPage ? formatCount(catalogPage.pagination.totalResults) : '—'}</strong></span>
        <span className="rounded-lg border border-white/[0.06] bg-white/[0.018] px-3 py-2">Chargés sur cette page <strong className="ml-1 text-white/65">{catalogPage?.pagination.loadedResultCount ?? 0}</strong></span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-white/30">Recherche, tri, filtre adulte et pagination sont exécutés par Nexus. La clé reste dans le coffre système ; les pages sont mises en cache cinq minutes.</p>
    </div>

    {error && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-400/18 bg-red-400/[0.04] p-4 text-[11px] text-red-200/70"><AlertTriangle size={15} className="shrink-0" /><span className="min-w-0 flex-1">{error}</span>{page > 1 && <button type="button" onClick={() => setPage(page - 1)} className="rounded-lg border border-red-200/15 px-3 py-1.5 font-semibold hover:bg-red-200/[0.06]">Page précédente</button>}<button type="button" onClick={() => void loadMods(true)} className="rounded-lg bg-red-200/10 px-3 py-1.5 font-semibold hover:bg-red-200/15">Réessayer</button></div>}
    <section ref={resultsRef} className="scroll-mt-4">
    {loadingMods && mods.length > 0 && <div className="my-3 flex items-center gap-2 text-[11px] text-white/38"><Loader2 size={13} className="animate-spin" />Mise à jour de la page depuis Nexus…</div>}
    <ProviderSearchResults grid={grid} columns={columns} loading={loadingMods && !mods.length} empty={Boolean(domain && !mods.length && !error)} loadingFallback={<LoadingGrid />} emptyFallback={<EmptyResults onReset={() => { setQuery(''); setServerQuery(''); setPage(1) }} />}>
      {mods.map(item => {
        const mod = NexusExplorerAdapter.toResult(item, selectedCatalogGame?.name)
        return <ModResult key={mod.id} mod={mod} grid={grid} installing={false} canInstall={false} sourceOnly targetName={selectedCatalogGame?.name} onPreview={() => setPreviewMod(mod)} onInstall={() => undefined} />
      })}
    </ProviderSearchResults>
    {domain && catalogPage && catalogPage.pagination.totalResults > 0 && <ProviderPagination provider="Nexus Mods" page={page} pageCount={pageCount} hasNextPage={catalogPage.pagination.hasNext} loading={loadingMods} onPageChange={changePage} />}
    </section>
    {previewMod && <ModPreviewModal mod={previewMod} canInstall={false} sourceOnly installing={false} onInstall={() => undefined} onClose={() => setPreviewMod(undefined)} />}
  </section>
}

function NexusCatalogV2({ selectedGameName, showNsfw }: { selectedGameName?: string; showNsfw: boolean }) {
  const [mode, setMode] = useState<'mods' | 'collections'>(readNexusSession().mode || 'mods')
  useEffect(() => {
    const current = readNexusSession()
    writeNexusSession({ ...current, mode })
  }, [mode])
  return <section>
    <div className="mt-4 inline-flex rounded-lg border border-white/[0.08] bg-black/20 p-1" aria-label="Type de contenu Nexus">
      <button type="button" onClick={() => setMode('mods')} className={`rounded-md px-4 py-2 text-xs font-semibold ${mode === 'mods' ? 'bg-gold text-[#101313]' : 'text-white/48 hover:text-white'}`}>Mods</button>
      <button type="button" onClick={() => setMode('collections')} className={`rounded-md px-4 py-2 text-xs font-semibold ${mode === 'collections' ? 'bg-gold text-[#101313]' : 'text-white/48 hover:text-white'}`}>Collections</button>
    </div>
    {mode === 'mods'
      ? <NexusCatalog selectedGameName={selectedGameName} showNsfw={showNsfw} />
      : <NexusCollectionsCatalog selectedGameName={selectedGameName} showNsfw={showNsfw} />}
  </section>
}

function NexusCollectionsCatalog({ selectedGameName, showNsfw }: { selectedGameName?: string; showNsfw: boolean }) {
  const columns = useStore(state => state.exploreColumns)
  const grid = useStore(state => state.exploreGrid)
  const setGrid = useStore(state => state.setExploreGrid)
  const setColumns = useStore(state => state.setExploreColumns)
  const prepareCollectionProfile = useStore(state => state.prepareCollectionProfile)
  const selectedGame = useStore(state => state.games.find(game => game.id === state.selectedGameId))
  const restored = useRef(readNexusSession())
  const [games, setGames] = useState<NexusCatalogGame[]>([])
  const [domain, setDomain] = useState(restored.current.domain)
  const [gameFilter, setGameFilter] = useState(selectedGameName || restored.current.gameFilter)
  const [query, setQuery] = useState(restored.current.query)
  const [serverQuery, setServerQuery] = useState(restored.current.query.trim())
  const [sort, setSort] = useState<NexusExplorerSession['sort']>(restored.current.sort)
  const [page, setPage] = useState(restored.current.page)
  const [pageSize, setPageSize] = useState(restored.current.pageSize)
  const [catalog, setCatalog] = useState<NexusCollectionPage>()
  const [capabilities, setCapabilities] = useState<NexusAccountCapabilities>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [selectedCollection, setSelectedCollection] = useState<NexusCollectionSummary>()
  const [detail, setDetail] = useState<NexusCollectionDetail>()
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string>()
  const [installing, setInstalling] = useState(false)
  const requestSerial = useRef(0)
  const resultsRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let active = true
    void native.nexusCatalogGames().then(items => {
      if (!active) return
      setGames(items)
      const normalized = (selectedGameName || '').toLocaleLowerCase()
      const preferred = items.find(game => game.name.toLocaleLowerCase() === normalized)
        || items.find(game => normalized && (game.name.toLocaleLowerCase().includes(normalized) || normalized.includes(game.name.toLocaleLowerCase())))
        || items.find(game => game.domain === restored.current.domain)
      if (preferred) {
        setDomain(preferred.domain)
        setGameFilter(preferred.name)
      }
    }).catch(reason => active && setError(reason instanceof Error ? reason.message : String(reason)))
    void native.nexusAccountCapabilities().then(account => active && setCapabilities(account)).catch(() => undefined)
    return () => { active = false }
  }, [selectedGameName])

  const loadCollections = async (force = false) => {
    if (!domain) return
    const key = nexusCacheKey(domain, serverQuery, `collections:${sort}`, page, pageSize, showNsfw)
    const cached = nexusCollectionPageCache.get(key)
    if (!force && cached && Date.now() - cached.cachedAt < NEXUS_CACHE_TTL) {
      ++requestSerial.current
      setCatalog(cached.page)
      setError(undefined)
      return
    }
    if (force) nexusCollectionPageCache.delete(key)
    const request = ++requestSerial.current
    setLoading(true)
    setError(undefined)
    try {
      const result = await native.nexusCatalogCollections(domain, serverQuery, sort, page, pageSize, showNsfw)
      if (request !== requestSerial.current) return
      cacheNexusCollectionPage(key, result)
      setCatalog(result)
      if (page > result.pagination.totalPages) setPage(Math.max(1, result.pagination.totalPages))
    } catch (reason) {
      if (request === requestSerial.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (request === requestSerial.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (domain) void loadCollections()
  }, [domain, serverQuery, sort, page, pageSize, showNsfw])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setServerQuery(query.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [query])

  const openCollection = async (collection: NexusCollectionSummary) => {
    setSelectedCollection(collection)
    setDetail(undefined)
    setDetailError(undefined)
    setDetailLoading(true)
    try {
      setDetail(await native.nexusCollectionDetail(collection.gameDomain, collection.slug, collection.latestRevisionNumber, showNsfw))
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setDetailLoading(false)
    }
  }

  const installCollection = async (profileName: string) => {
    if (!detail || !selectedGame) return
    setInstalling(true)
    try {
      const profileId = await prepareCollectionProfile(detail, profileName, showNsfw)
      if (profileId) {
        setSelectedCollection(undefined)
        setDetail(undefined)
      }
    } finally {
      setInstalling(false)
    }
  }

  const selectedCatalogGame = games.find(game => game.domain === domain)
  const gameMatches = gameFilter.trim().length < 2 ? games.slice(0, 25) : games
    .filter(game => `${game.name} ${game.domain}`.toLocaleLowerCase().includes(gameFilter.trim().toLocaleLowerCase()))
    .slice(0, 25)
  const results = catalog?.results || []
  const pageCount = Math.max(1, catalog?.pagination.totalPages || 1)

  return <section className="mt-4">
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <ProviderExplorerToolbar>
        <label className="min-w-0 flex-1 text-[11px] text-white/48">Jeu Nexus
          <div className="relative mt-1.5">
            <input value={gameFilter} onChange={event => setGameFilter(event.target.value)} placeholder="Nom ou domaine Nexus…" className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/78 outline-none focus:border-gold/26" />
            {gameFilter && gameFilter !== selectedCatalogGame?.name && gameMatches.length > 0 && <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-white/[0.1] bg-[#101313] p-1 shadow-2xl">{gameMatches.map(game => <button key={game.domain} type="button" onClick={() => { setDomain(game.domain); setGameFilter(game.name); setPage(1) }} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[11px] text-white/62 hover:bg-white/[0.06]"><span>{game.name}</span><span className="font-mono text-white/28">{game.domain}</span></button>)}</div>}
          </div>
        </label>
        <label className="min-w-0 flex-1 text-[11px] text-white/48">Rechercher des Collections
          <span className="mt-1.5 flex items-center rounded-lg border border-white/[0.08] bg-black/20 px-3"><Search size={14} className="text-white/30" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Titre, auteur ou description…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs text-white/78 outline-none" /></span>
        </label>
        <button type="button" onClick={() => void loadCollections(true)} disabled={!domain || loading} className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-[11px] font-semibold text-white/62 disabled:opacity-35"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Actualiser</button>
        <ProviderViewModeToggle grid={grid} onChange={setGrid} />
        {grid && <GridColumnCycleButton currentColumnCount={columns} onChange={setColumns} />}
      </ProviderExplorerToolbar>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ProviderSortControl value={sort} onChange={value => { setSort(value); setPage(1) }} />
        <label className="text-[11px] text-white/45">Par page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }} className="ml-1 rounded border border-white/[0.08] bg-[#101313] px-2 py-1.5 text-[11px] text-white/75"><option value={20}>20</option><option value={40}>40</option><option value={60}>60</option></select></label>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] ${capabilities?.membershipTier === 'premium' ? 'border-emerald-300/18 text-emerald-100/65' : 'border-amber-300/18 text-amber-100/60'}`}>Compte {capabilities?.membershipTier === 'premium' ? 'Premium' : capabilities?.membershipTier === 'free' ? 'gratuit' : 'à vérifier'}</span>
        <span className="ml-auto text-[11px] text-white/30">Page {page} / {pageCount}</span>
      </div>
      <div className="mt-3 grid gap-2 text-[11px] text-white/38 sm:grid-cols-3"><span className="rounded-lg border border-white/[0.06] px-3 py-2">Collections du jeu <strong className="ml-1 text-white/65">{catalog?.pagination.providerGameTotalCollections ? formatCount(catalog.pagination.providerGameTotalCollections) : '—'}</strong></span><span className="rounded-lg border border-white/[0.06] px-3 py-2">Résultats filtrés <strong className="ml-1 text-white/65">{catalog ? formatCount(catalog.pagination.totalResults) : '—'}</strong></span><span className="rounded-lg border border-white/[0.06] px-3 py-2">Chargées sur cette page <strong className="ml-1 text-white/65">{catalog?.pagination.loadedResultCount || 0}</strong></span></div>
      <p className="mt-2 text-[11px] leading-relaxed text-white/32">Résultats et pages proviennent directement de Nexus. Les comptes gratuits restent sur les pages officielles et attendent chaque confirmation NXM.</p>
    </div>
    {error && <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-400/18 bg-red-400/[0.04] p-4 text-[11px] text-red-200/70"><AlertTriangle size={15} /><span className="flex-1">{error}</span><button type="button" onClick={() => void loadCollections(true)} className="rounded-lg border border-red-200/15 px-3 py-1.5">Réessayer</button></div>}
    <section ref={resultsRef} className="scroll-mt-4">
      <ProviderSearchResults grid={grid} columns={columns} loading={loading && !results.length} empty={Boolean(domain && !results.length && !error)} loadingFallback={<LoadingGrid />} emptyFallback={<EmptyResults onReset={() => { setQuery(''); setServerQuery(''); setPage(1) }} />}>
        {results.map(collection => <CollectionResult key={collection.id} collection={collection} grid={grid} onOpen={() => void openCollection(collection)} />)}
      </ProviderSearchResults>
      {catalog && catalog.pagination.totalResults > 0 && <ProviderPagination provider="Nexus Collections" page={page} pageCount={pageCount} hasNextPage={catalog.pagination.hasNext} loading={loading} onPageChange={next => { setPage(Math.max(1, Math.min(pageCount, next))); window.requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }} />}
    </section>
    {selectedCollection && <CollectionDetailModal collection={selectedCollection} detail={detail} loading={detailLoading} error={detailError} account={capabilities} selectedGameName={selectedGame?.name} installing={installing} onRetry={() => void openCollection(selectedCollection)} onInstall={profileName => void installCollection(profileName)} onClose={() => { setSelectedCollection(undefined); setDetail(undefined) }} />}
  </section>
}

function CollectionResult({ collection, grid, onOpen }: { collection: NexusCollectionSummary; grid: boolean; onOpen: () => void }) {
  const openSource = () => native.isDesktop() ? native.openExternalUrl(collection.url) : window.open(collection.url, '_blank', 'noopener,noreferrer')
  return <article className={`group overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.018] hover:border-white/15 ${grid ? '' : 'flex min-h-32'}`}>
    <button type="button" onClick={onOpen} className={`relative shrink-0 overflow-hidden bg-white/[0.025] text-left ${grid ? 'aspect-[16/7] w-full' : 'w-52'}`}>{collection.tileImage ? <img src={collection.tileImage} alt="" loading="lazy" className="h-full w-full object-cover opacity-75 transition group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center text-white/18"><Compass size={28} /></div>}<div className="absolute inset-0 bg-gradient-to-t from-[#0d1010] via-transparent to-transparent" /><span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[11px] text-white/65">Révision {collection.latestRevisionNumber || '—'}</span></button>
    <div className="flex min-w-0 flex-1 flex-col p-3.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-white/82">{collection.name}</h2><p className="mt-0.5 truncate text-[11px] text-white/38">par {collection.author || 'auteur Nexus'}</p></div>{collection.adult && <span className="rounded border border-red-300/18 px-1.5 py-0.5 text-[11px] text-red-200/70">NSFW</span>}</div><p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-white/36">{collection.summary || 'Aucun résumé fourni.'}</p><div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3"><span className="text-[11px] text-white/34">{collection.modCount} mods · {formatBytes(collection.totalSize)} · {collection.recommendedManager}</span><span className="flex gap-1.5"><button type="button" onClick={() => void openSource()} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-white/40"><ExternalLink size={13} /></button><button type="button" onClick={onOpen} className="rounded-lg bg-[#dbe8e5] px-3 text-[11px] font-semibold text-[#101313]">Détails</button></span></div></div>
  </article>
}

function CollectionDetailModal({ collection, detail, loading, error, account, selectedGameName, installing, onRetry, onInstall, onClose }: {
  collection: NexusCollectionSummary
  detail?: NexusCollectionDetail
  loading: boolean
  error?: string
  account?: NexusAccountCapabilities
  selectedGameName?: string
  installing: boolean
  onRetry: () => void
  onInstall: (profileName: string) => void
  onClose: () => void
}) {
  const [profileName, setProfileName] = useState(`${collection.name} · r${collection.latestRevisionNumber || 'latest'}`)
  const openSource = (url: string) => native.isDesktop() ? native.openExternalUrl(url) : window.open(url, '_blank', 'noopener,noreferrer')
  return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/82 p-3 backdrop-blur-md" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.11] bg-[#101313] shadow-2xl">
    <header className="relative min-h-40 overflow-hidden border-b border-white/[0.08] p-5">{collection.headerImage && <img src={collection.headerImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}<div className="absolute inset-0 bg-gradient-to-r from-[#101313] via-[#101313]/85 to-[#101313]/45" /><div className="relative flex items-start justify-between gap-4"><div><p className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold/65">Nexus Collection · {collection.game}</p><h2 className="mt-2 font-display text-2xl font-bold text-white">{collection.name}</h2><p className="mt-1 text-xs text-white/48">par {collection.author} · révision {detail?.revisionNumber || collection.latestRevisionNumber || '—'}</p></div><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/35 text-white/55"><X size={17} /></button></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-5">{loading && <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-white/48"><Loader2 size={17} className="animate-spin" />Lecture de la révision exacte…</div>}{error && <div className="rounded-xl border border-red-300/18 bg-red-300/[0.04] p-4"><p className="text-xs text-red-100/70">{error}</p><p className="mt-2 text-[11px] text-white/38">Si Nexus bloque le contenu adulte, activez NSFW dans ZAILON. Aucun contrôle n’est contourné.</p><button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-red-200/20 px-3 py-2 text-[11px]">Réessayer</button></div>}
      {detail && <div className="space-y-4"><div className="grid gap-2 sm:grid-cols-4"><Metric label="Mods exacts" value={String(detail.entries.length)} /><Metric label="Téléchargement" value={formatBytes(detail.totalSize)} /><Metric label="Espace temporaire" value={formatBytes(detail.temporaryBytes)} /><Metric label="Schéma" value={`${collection.recommendedManager} ${detail.collectionSchemaVersion}`} /></div><p className="text-xs leading-relaxed text-white/48">{detail.collection.description || detail.collection.summary || 'Aucune description fournie.'}</p>
        {(detail.warnings.length > 0 || detail.unsupportedInstructions.length > 0) && <div className="rounded-xl border border-amber-300/16 bg-amber-300/[0.035] p-3 text-[11px] leading-relaxed text-amber-50/65">{[...detail.warnings, ...detail.unsupportedInstructions].map(message => <p key={message}>• {message}</p>)}</div>}
        <div><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold text-white/72">Fichiers de la révision</h3><span className="text-[11px] text-white/35">{detail.entries.length} ID(s) exact(s)</span></div><div className="max-h-64 overflow-y-auto rounded-xl border border-white/[0.07]">{detail.entries.slice(0, 250).map(entry => <div key={`${entry.collectionEntryId}-${entry.fileId}`} className="flex items-center gap-3 border-b border-white/[0.05] px-3 py-2.5 last:border-0"><span className={`h-2 w-2 rounded-full ${entry.status === 'Unavailable' ? 'bg-red-300/70' : 'bg-emerald-300/60'}`} /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-white/65">{entry.displayName || entry.fileName}</p><p className="truncate font-mono text-[11px] text-white/28">mod {entry.modId} · fichier {entry.fileId} · {entry.expectedVersion || 'version inconnue'}</p></div><button type="button" disabled={!entry.sourceUrl} onClick={() => void openSource(entry.sourceUrl)} className="rounded-lg border border-white/[0.08] px-2 py-1 text-[11px] text-white/45 disabled:opacity-25">Nexus</button></div>)}</div>{detail.entries.length > 250 && <p className="mt-1 text-[11px] text-white/30">Aperçu limité ; le plan conserve les {detail.entries.length} entrées.</p>}</div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"><label className="text-[11px] text-white/48">Nom du nouveau profil vide<input value={profileName} onChange={event => setProfileName(event.target.value)} maxLength={160} className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/75 outline-none" /></label><p className="mt-2 text-[11px] leading-relaxed text-white/38">Cible : {selectedGameName || 'aucun jeu sélectionné'}. Le profil est verrouillé et n’hérite d’aucun mod. {account?.membershipTier === 'premium' ? 'La file Premium attendra votre confirmation.' : 'Compte gratuit : Nexus demandera chaque confirmation et renverra le lien NXM.'}</p></div></div>}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] p-4"><button type="button" onClick={() => void openSource(collection.url)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] text-white/58"><ExternalLink size={13} />Page officielle</button><div className="flex gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-[11px] text-white/45">Fermer</button><button type="button" disabled={!detail || !selectedGameName || !profileName.trim() || installing} onClick={() => onInstall(profileName)} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[#101313] disabled:opacity-35">{installing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}{installing ? 'Préparation…' : 'Créer le profil et le plan'}</button></div></footer>
  </section></div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"><p className="text-[11px] text-white/32">{label}</p><p className="mt-1 text-sm font-semibold text-white/72">{value}</p></div>
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
