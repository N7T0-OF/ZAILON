/**
 * Parseur strict des URLs YouTube (spec Accueil multimédia §2).
 *
 * Aucune Data API Key, aucun téléchargement : on extrait uniquement le
 * videoId nécessaire au lecteur intégré. Le domaine est validé, les domaines
 * arbitraires sont refusés, et la chaîne complète n'est jamais utilisée comme
 * URL d'iframe — seul l'identifiant extrait entre dans l'URL du lecteur.
 */

export interface ParsedYouTubeUrl {
  /** Identifiant de vidéo YouTube (11 caractères [A-Za-z0-9_-]). */
  videoId: string
  /** L'URL d'origine telle que fournie par l'utilisateur. */
  originalUrl: string
  /** Timestamp de début éventuel (?t= ou #t=), en secondes. */
  startSeconds?: number
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

/** Domaines YouTube autorisés (spec §2, §69, §71 — whitelist stricte). */
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'music.youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
])

function parseStartSeconds(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  // Accepte « 15 », « 15s », « 1m30 » — formats courants de timestamp YouTube.
  const cleaned = value.trim().toLowerCase()
  const match = cleaned.match(/^(?:(\d+)m)?(\d+)s?$/)
  if (match) {
    const minutes = Number(match[1] ?? 0)
    const seconds = Number(match[2])
    if (Number.isFinite(minutes + seconds) && minutes + seconds >= 0) return minutes * 60 + seconds
  }
  const plain = Number(cleaned)
  if (!Number.isFinite(plain) || plain < 0) return undefined
  return Math.floor(plain)
}

/**
 * Extrait l'identifiant de vidéo depuis une URL YouTube.
 * Formes acceptées (spec §2) :
 *   youtube.com/watch?v=ID
 *   youtu.be/ID
 *   youtube.com/shorts/ID
 *   youtube.com/embed/ID
 *   youtube.com/live/ID
 * Renvoie `null` pour toute URL non-YouTube ou non reconnue.
 */
export function parseYouTubeUrl(raw: string): ParsedYouTubeUrl | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    // youtu.be sans protocole ou URL malformée → refusée (spec §69).
    return null
  }

  const host = url.hostname.toLowerCase()
  if (!YOUTUBE_HOSTS.has(host)) return null

  // Timestamp de début (spec §25) : ?t=, &start=, ou #t=.
  const startSeconds =
    parseStartSeconds(url.searchParams.get('t')) ??
    parseStartSeconds(url.searchParams.get('start')) ??
    parseStartSeconds(url.hash.replace(/^#/, '').split('&').find(part => part.startsWith('t='))?.slice(2))

  // youtu.be/ID
  if (host === 'youtu.be') {
    const id = url.pathname.replace(/^\//, '').split('/')[0]
    if (id && VIDEO_ID_RE.test(id)) return { videoId: id, originalUrl: trimmed, startSeconds }
    return null
  }

  // /watch?v=ID (le paramètre `v` doit être exactement l'ID)
  if (url.pathname === '/watch' || url.pathname === '') {
    const id = url.searchParams.get('v')
    if (id && VIDEO_ID_RE.test(id)) return { videoId: id, originalUrl: trimmed, startSeconds }
    return null
  }

  // /shorts/ID, /embed/ID, /live/ID, /v/ID
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length >= 2 && (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live' || segments[0] === 'v')) {
    const id = segments[1]
    if (id && VIDEO_ID_RE.test(id)) return { videoId: id, originalUrl: trimmed, startSeconds }
  }

  return null
}

/** URL d'iframe du lecteur — jamais l'URL utilisateur brute (spec §2, §71-72). */
export function youtubeEmbedUrl(videoId: string, options?: { startSeconds?: number }): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    controls: '0',
    loop: '1',
    playlist: videoId,
    playsinline: '1',
    rel: '0',
    showinfo: '0',
    iv_load_policy: '3',
    disablekb: '1',
    modestbranding: '1',
    origin: 'https://zailon.local',
  })
  if (options?.startSeconds) params.set('start', String(Math.max(0, Math.floor(options.startSeconds))))
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

/** Valide un identifiant de vidéo (11 caractères [A-Za-z0-9_-]). */
export function isValidYouTubeVideoId(value: string): boolean {
  return VIDEO_ID_RE.test(value)
}

/**
 * Nettoyage d'une URL pour l'aperçu (spec §24) : retire les paramètres de
 * liste de lecture et de tracking, conserve le timestamp de début.
 */
export function cleanYouTubeUrl(raw: string): string {
  const parsed = parseYouTubeUrl(raw)
  if (!parsed) return raw.trim()
  const base = `https://www.youtube.com/watch?v=${parsed.videoId}`
  return parsed.startSeconds !== undefined ? `${base}&t=${parsed.startSeconds}` : base
}

/** Miniature YouTube publique (spec §29) — utilisée comme fallback d'image. */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}
