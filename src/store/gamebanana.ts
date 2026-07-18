import { ExplodMod } from '../types'

export const GAMEBANANA_GAMES = [
  { id: 23012, name: 'Neverness To Everness', shortName: 'NTE' },
  { id: 8552, name: 'Genshin Impact', shortName: 'GI' },
  { id: 18366, name: 'Honkai Star Rail', shortName: 'HSR' },
  { id: 19567, name: 'Zenless Zone Zero', shortName: 'ZZZ' },
  { id: 20357, name: 'Wuthering Waves', shortName: 'WUWA' },
  { id: 8722, name: 'Cyberpunk 2077', shortName: 'CP2077' },
  { id: 5609, name: 'The Witcher 3 : Wild Hunt', shortName: 'TW3' },
  { id: 16951, name: 'Persona 5 Royal (PC)', shortName: 'P5R' },
] as const

const API = 'https://api.gamebanana.com/Core'
const DETAILS_FIELDS = [
  'name',
  'Owner().name',
  'downloads',
  'likes',
  'Preview().sSubFeedImageUrl()',
  'description',
  'Nsfw().bIsNsfw()',
  'Game().name',
  'Url().sProfileUrl()',
].join(',')
const CACHE_TIME = 5 * 60_000
const pageCache = new Map<string, { expiresAt: number; mods: ExplodMod[] }>()

const stringValue = (value: unknown) => typeof value === 'string' ? value : ''
const numberValue = (value: unknown) => typeof value === 'number' ? value : Number(value) || 0
const booleanValue = (value: unknown) => value === true || value === 1 || value === '1'

function thumbnail(value: unknown) {
  const path = stringValue(value)
  if (!path) return ''
  return path.startsWith('http') ? path : `https:${path}`
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
  return stringValue(record.error) || undefined
}

async function fetchNewIds(gameId: number, page: number) {
  const params = new URLSearchParams({
    itemtype: 'Mod',
    gameid: String(gameId),
    page: String(page),
    format: 'json_min',
  })
  const response = await fetch(`${API}/List/New?${params.toString()}`, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`GameBanana a renvoyé HTTP ${response.status}.`)
  const payload: unknown = await response.json()
  const error = apiError(payload)
  if (error) throw new Error(error)
  if (!Array.isArray(payload)) return []
  return payload
    .map(item => Array.isArray(item) && item[0] === 'Mod' ? numberValue(item[1]) : 0)
    .filter(id => Number.isInteger(id) && id > 0)
}

async function fetchDetails(ids: number[], fallbackGame: string): Promise<ExplodMod[]> {
  if (!ids.length) return []
  const params = new URLSearchParams()
  for (const id of ids) {
    params.append('itemtype[]', 'Mod')
    params.append('itemid[]', String(id))
    params.append('fields[]', DETAILS_FIELDS)
    params.append('return_keys[]', 'true')
  }
  params.set('format', 'json_min')
  const response = await fetch(`${API}/Item/Data?${params.toString()}`, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`GameBanana a renvoyé HTTP ${response.status}.`)
  const payload: unknown = await response.json()
  const error = apiError(payload)
  if (error) throw new Error(error)
  if (!Array.isArray(payload)) return []

  return payload.map((row, index): ExplodMod | null => {
    if (!Array.isArray(row) || !ids[index]) return null
    const id = ids[index]
    const profileUrl = stringValue(row[8])
    return {
      id: `gb-${id}`,
      modId: id,
      name: stringValue(row[0]) || `Mod ${id}`,
      author: stringValue(row[1]) || 'Auteur inconnu',
      game: stringValue(row[7]) || fallbackGame,
      thumbnail: thumbnail(row[4]),
      downloads: numberValue(row[2]),
      rating: numberValue(row[3]),
      tags: ['GameBanana'],
      nsfw: booleanValue(row[6]),
      platform: 'gamebanana',
      url: profileUrl || `https://gamebanana.com/mods/${id}`,
      description: plainText(row[5]),
    }
  }).filter((item): item is ExplodMod => item !== null)
}

async function loadPage(gameId: number, page: number) {
  const cacheKey = `${gameId}:${page}`
  const cached = pageCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.mods
  const game = GAMEBANANA_GAMES.find(item => item.id === gameId)
  const ids = await fetchNewIds(gameId, page)
  const mods = await fetchDetails(ids, game?.name || 'GameBanana')
  pageCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TIME, mods })
  return mods
}

export async function fetchGamebananaMods(gameId: number, search = '', page = 1): Promise<ExplodMod[]> {
  const query = search.trim().toLocaleLowerCase()
  const pages = query ? [1, 2, 3] : [page]
  const loaded = (await Promise.all(pages.map(current => loadPage(gameId, current)))).flat()
  const unique = [...new Map(loaded.map(mod => [mod.id, mod])).values()]
  if (!query) return unique
  return unique.filter(mod => `${mod.name} ${mod.author} ${mod.description}`.toLocaleLowerCase().includes(query))
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
  const response = await fetch(`${API}/Item/Data?${params.toString()}`, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`GameBanana a renvoyé HTTP ${response.status}.`)
  const payload: unknown = await response.json()
  const error = apiError(payload)
  if (error) throw new Error(error)
  const candidates = collectDownloads(payload)
    .filter(candidate => candidate.trusted)
    .sort((left, right) => Number(right.trusted) - Number(left.trusted) || right.date - left.date)
  const download = candidates[0]
  if (!download) throw new Error('Aucun fichier téléchargeable sûr n’a été trouvé pour ce mod.')
  return { ...download, url: download.url.startsWith('http') ? download.url : `https:${download.url}` }
}
