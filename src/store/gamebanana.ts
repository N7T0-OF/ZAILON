import { ExplodMod, ExploreSort, GamebananaGame } from '../types'

export const GAMEBANANA_GAMES = [
  { id: 8722, name: 'Cyberpunk 2077', shortName: 'CP2077' },
  { id: 8552, name: 'Genshin Impact', shortName: 'GI' },
  { id: 18366, name: 'Honkai Star Rail', shortName: 'HSR' },
  { id: 19567, name: 'Zenless Zone Zero', shortName: 'ZZZ' },
  { id: 20357, name: 'Wuthering Waves', shortName: 'WUWA' },
  { id: 5609, name: 'The Witcher 3 : Wild Hunt', shortName: 'TW3' },
] as const

const API = 'https://api.gamebanana.com/Core'
const DETAILS_FIELDS = [
  'name',
  'Owner().name',
  'downloads',
  'likes',
  'Preview().sSubFeedImageUrl()',
  'Preview().sStructuredDataFullsizeUrl()',
  'description',
  'Nsfw().bIsNsfw()',
  'Game().name',
  'Url().sProfileUrl()',
  'screenshots',
].join(',')
const CACHE_TIME = 5 * 60_000
const pageCache = new Map<string, { expiresAt: number; mods: ExplodMod[] }>()
const gameCache = new Map<string, { expiresAt: number; games: GamebananaGame[] }>()

const stringValue = (value: unknown) => typeof value === 'string' ? value : ''
const numberValue = (value: unknown) => typeof value === 'number' ? value : Number(value) || 0
const booleanValue = (value: unknown) => value === true || value === 1 || value === '1'

function imageUrl(value: unknown) {
  const path = stringValue(value)
  if (!path) return ''
  return path.startsWith('http') ? path : path.startsWith('//') ? `https:${path}` : ''
}

function previewImages(value: unknown, images: string[] = []): string[] {
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try { return previewImages(JSON.parse(value), images) } catch { return images }
  }
  if (Array.isArray(value)) {
    value.forEach(item => previewImages(item, images))
    return [...new Set(images)]
  }
  if (!value || typeof value !== 'object') return images
  const record = value as Record<string, unknown>
  const base = stringValue(record._sBaseUrl ?? record.baseUrl)
  const file = stringValue(record._sFile ?? record.file)
  const direct = stringValue(record._sUrl ?? record.url ?? record._sImageUrl)
  const candidate = direct || (base && file
    ? `${base}${base.endsWith('/') ? '' : '/'}${file}`
    : file ? `https://images.gamebanana.com/img/ss/mods/${file}` : '')
  const normalized = imageUrl(candidate)
  if (normalized && /\.(?:png|jpe?g|webp|gif|avif)(?:\?|$)/i.test(normalized)) images.push(normalized)
  Object.values(record).forEach(item => previewImages(item, images))
  return [...new Set(images)]
}

function plainText(value: unknown) {
  return stringValue(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function apiError(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const record = payload as Record<string, unknown>
  return stringValue(record.error ?? record._sErrorMessage) || undefined
}

function requestSignal(signal?: AbortSignal) {
  if (!signal) return AbortSignal.timeout(15_000)
  return AbortSignal.any([signal, AbortSignal.timeout(15_000)])
}

export type GamebananaFailure = 'network' | 'timeout' | 'http' | 'schema' | 'api'

export class GamebananaApiError extends Error {
  constructor(public readonly category: GamebananaFailure, message: string, public readonly status?: number) {
    super(message)
    this.name = 'GamebananaApiError'
  }
}

async function apiJson(url: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { signal: requestSignal(signal) })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    if ((error as Error)?.name === 'TimeoutError') throw new GamebananaApiError('timeout', 'GameBanana ne répond pas dans le délai imparti.')
    throw new GamebananaApiError('network', 'GameBanana est inaccessible. Vérifiez la connexion puis réessayez.')
  }
  if (!response.ok) throw new GamebananaApiError('http', `GameBanana a renvoyé HTTP ${response.status}.`, response.status)
  let payload: unknown
  try { payload = await response.json() } catch { throw new GamebananaApiError('schema', 'GameBanana a renvoyé une réponse illisible.') }
  const error = apiError(payload)
  if (error) throw new GamebananaApiError('api', error)
  return payload
}

async function fetchNewIds(gameId: number, page: number, includeUpdated: boolean, signal?: AbortSignal) {
  const params = new URLSearchParams({
    itemtype: 'Mod',
    gameid: String(gameId),
    page: String(page),
    format: 'json_min',
    include_updated: includeUpdated ? '1' : '0',
  })
  const payload = await apiJson(`${API}/List/New?${params.toString()}`, signal)
  if (!Array.isArray(payload)) throw new GamebananaApiError('schema', 'La liste de mods GameBanana a un format inattendu.')
  return payload
    .map(item => Array.isArray(item) && item[0] === 'Mod' ? numberValue(item[1]) : 0)
    .filter(id => Number.isInteger(id) && id > 0)
}

function detailValue(row: unknown[] | Record<string, unknown>, name: string, legacyIndex: number) {
  return Array.isArray(row) ? row[legacyIndex] : row[name]
}

async function fetchDetails(ids: number[], fallbackGame: string, fallbackGameId: number, signal?: AbortSignal): Promise<ExplodMod[]> {
  if (!ids.length) return []
  const params = new URLSearchParams()
  for (const id of ids) {
    params.append('itemtype[]', 'Mod')
    params.append('itemid[]', String(id))
    params.append('fields[]', DETAILS_FIELDS)
    params.append('return_keys[]', 'true')
  }
  params.set('format', 'json_min')
  const payload = await apiJson(`${API}/Item/Data?${params.toString()}`, signal)
  if (!Array.isArray(payload)) throw new GamebananaApiError('schema', 'Les détails GameBanana ont un format inattendu.')

  return payload.map((raw, index): ExplodMod | null => {
    if ((!Array.isArray(raw) && (!raw || typeof raw !== 'object')) || !ids[index]) return null
    const row = raw as unknown[] | Record<string, unknown>
    const id = ids[index]
    const thumbnail = imageUrl(detailValue(row, 'Preview().sSubFeedImageUrl()', 4))
    const structured = imageUrl(detailValue(row, 'Preview().sStructuredDataFullsizeUrl()', 5))
    const screenshots = [thumbnail, structured, ...previewImages(detailValue(row, 'screenshots', 10))].filter(Boolean)
    return {
      id: `gb-${id}`,
      modId: id,
      name: stringValue(detailValue(row, 'name', 0)) || `Mod ${id}`,
      author: stringValue(detailValue(row, 'Owner().name', 1)) || 'Auteur inconnu',
      game: stringValue(detailValue(row, 'Game().name', 8)) || fallbackGame,
      thumbnail,
      screenshots: [...new Set(screenshots)],
      downloads: numberValue(detailValue(row, 'downloads', 2)),
      rating: numberValue(detailValue(row, 'likes', 3)),
      tags: ['GameBanana'],
      nsfw: booleanValue(detailValue(row, 'Nsfw().bIsNsfw()', 7)),
      platform: 'gamebanana',
      url: stringValue(detailValue(row, 'Url().sProfileUrl()', 9)) || `https://gamebanana.com/mods/${id}`,
      description: plainText(detailValue(row, 'description', 6)),
      gameId: fallbackGameId,
    }
  }).filter((item): item is ExplodMod => item !== null)
}

async function loadPage(gameId: number, page: number, includeUpdated: boolean, signal?: AbortSignal) {
  const cacheKey = `${gameId}:${page}:${includeUpdated}`
  const cached = pageCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.mods
  const game = GAMEBANANA_GAMES.find(item => item.id === gameId)
  const ids = await fetchNewIds(gameId, page, includeUpdated, signal)
  const mods = await fetchDetails(ids, game?.name || `GameBanana #${gameId}`, gameId, signal)
  pageCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TIME, mods })
  return mods
}

export async function searchGamebananaGames(query: string, signal?: AbortSignal): Promise<GamebananaGame[]> {
  const match = query.trim()
  if (match.length < 2) return []
  const cacheKey = match.toLocaleLowerCase()
  const cached = gameCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.games
  const params = new URLSearchParams({ itemtype: 'Game', field: 'name', match, format: 'json_min' })
  const payload = await apiJson(`${API}/List/Like?${params.toString()}`, signal)
  if (!Array.isArray(payload)) throw new GamebananaApiError('schema', 'La recherche de jeux GameBanana a un format inattendu.')
  const games = payload.map(item => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return { id: numberValue(record.id), name: stringValue(record.name) }
  }).filter(game => game.id > 0 && game.name)
  gameCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TIME, games })
  return games
}

export async function fetchGamebananaMods(gameId: number, search = '', page = 1, sort: ExploreSort = 'recent', signal?: AbortSignal): Promise<{ mods: ExplodMod[]; hasNextPage: boolean }> {
  const query = search.trim().toLocaleLowerCase()
  const includeUpdated = sort === 'updated'
  const [current, nextIds] = await Promise.all([
    loadPage(gameId, page, includeUpdated, signal),
    fetchNewIds(gameId, page + 1, includeUpdated, signal),
  ])
  let mods = query ? current.filter(mod => `${mod.name} ${mod.author} ${mod.description}`.toLocaleLowerCase().includes(query)) : current
  if (sort === 'popular') mods = [...mods].sort((a, b) => b.rating - a.rating)
  if (sort === 'downloaded') mods = [...mods].sort((a, b) => b.downloads - a.downloads)
  return { mods: [...new Map(mods.map(mod => [mod.id, mod])).values()], hasNextPage: nextIds.length > 0 }
}

type DownloadCandidate = { url: string; fileName: string; date: number; trusted: boolean }

function collectDownloads(value: unknown, candidates: DownloadCandidate[] = []): DownloadCandidate[] {
  if (Array.isArray(value)) {
    value.forEach(item => collectDownloads(item, candidates))
    return candidates
  }
  if (!value || typeof value !== 'object') return candidates
  const record = value as Record<string, unknown>
  const url = stringValue(record._sDownloadUrl ?? record.downloadUrl ?? record.url)
  if (url) {
    const analysis = stringValue(record._sAnalysisResult)
    const antivirus = stringValue(record._sAvResult)
    candidates.push({
      url,
      fileName: stringValue(record._sFile ?? record._sFileName ?? record.fileName) || 'mod-download.zip',
      date: numberValue(record._tsDateAdded ?? record.date),
      trusted: (!analysis || analysis === 'ok') && (!antivirus || antivirus === 'clean'),
    })
  }
  Object.values(record).forEach(item => collectDownloads(item, candidates))
  return candidates
}

export async function fetchGamebananaDownload(modId: number) {
  const params = new URLSearchParams({
    itemtype: 'Mod',
    itemid: String(modId),
    fields: 'Files().aFiles()',
    return_keys: 'true',
    format: 'json_min',
  })
  const payload = await apiJson(`${API}/Item/Data?${params.toString()}`)
  const candidates = collectDownloads(payload)
    .filter(candidate => candidate.trusted)
    .sort((left, right) => right.date - left.date)
  const download = candidates[0]
  if (!download) throw new GamebananaApiError('schema', 'Aucun fichier téléchargeable sûr n’a été trouvé pour ce mod.')
  return { ...download, url: download.url.startsWith('http') ? download.url : `https:${download.url}` }
}
