import { ExplodMod } from '../types'

export const GAMEBANANA_GAMES = [
  { id: 20920, name: 'Neverness to Everness', shortName: 'NTE' },
  { id: 7545, name: 'Genshin Impact', shortName: 'GI' },
  { id: 18874, name: 'Honkai: Star Rail', shortName: 'HSR' },
  { id: 20292, name: 'Zenless Zone Zero', shortName: 'ZZZ' },
  { id: 20545, name: 'Wuthering Waves', shortName: 'WUWA' },
  { id: 7371, name: 'Cyberpunk 2077', shortName: 'CP2077' },
  { id: 1261, name: 'Elden Ring', shortName: 'ER' },
  { id: 952, name: 'The Witcher 3', shortName: 'TW3' },
  { id: 6523, name: 'Persona 5 Royal', shortName: 'P5R' },
] as const

const FIELDS = '_idRow,_sName,_aSubmitter._sName,_nDownloadCount,_nLikeCount,_aPreviewMedia._sSubFeedImageUrl,_sDescription'
const API = 'https://api.gamebanana.com/Core'

const stringValue = (value: unknown) => typeof value === 'string' ? value : ''
const numberValue = (value: unknown) => typeof value === 'number' ? value : Number(value) || 0

function thumbnail(value: unknown) {
  const path = stringValue(value)
  if (!path) return ''
  return path.startsWith('http') ? path : `https:${path}`
}

export async function fetchGamebananaMods(gameId: number, search = '', page = 1): Promise<ExplodMod[]> {
  const params = new URLSearchParams({
    itemtype: 'Mod',
    gameid: String(gameId),
    nPerPage: '24',
    nPage: String(page),
    fields: FIELDS,
  })
  const endpoint = search.trim()
    ? `${API}/List/Like?${params.toString()}&field=_sName&match=${encodeURIComponent(search.trim())}`
    : `${API}/List/New?${params.toString()}`
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`GameBanana returned HTTP ${response.status}`)
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) return []
  const game = GAMEBANANA_GAMES.find(item => item.id === gameId)
  return payload.map((item): ExplodMod | null => {
    if (!Array.isArray(item) || !Number.isFinite(numberValue(item[0]))) return null
    const id = numberValue(item[0])
    return {
      id: `gb-${id}`,
      modId: id,
      name: stringValue(item[1]) || 'Untitled mod',
      author: stringValue(item[2]) || 'Unknown author',
      game: game?.name || 'GameBanana',
      thumbnail: thumbnail(item[5]),
      downloads: numberValue(item[3]),
      rating: numberValue(item[4]),
      tags: ['GameBanana'],
      nsfw: false,
      platform: 'gamebanana',
      url: `https://gamebanana.com/mods/${id}`,
      description: stringValue(item[6]),
    }
  }).filter((item): item is ExplodMod => item !== null)
}

function findDownload(value: unknown): { url: string; fileName: string } | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDownload(item)
      if (found) return found
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const url = stringValue(record._sDownloadUrl ?? record.downloadUrl ?? record.url)
  if (url) {
    return {
      url,
      fileName: stringValue(record._sFile ?? record._sFileName ?? record.fileName) || 'mod-download.zip',
    }
  }
  for (const nested of Object.values(record)) {
    const found = findDownload(nested)
    if (found) return found
  }
  return null
}

export async function fetchGamebananaDownload(modId: number) {
  const params = new URLSearchParams({ itemtype: 'Mod', itemid: String(modId), fields: 'Files().aFiles()', return_keys: 'true' })
  const response = await fetch(`${API}/Item/Data?${params.toString()}`, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`GameBanana returned HTTP ${response.status}`)
  const download = findDownload(await response.json())
  if (!download) throw new Error('No downloadable file was found for this mod.')
  return { ...download, url: download.url.startsWith('http') ? download.url : `https:${download.url}` }
}
