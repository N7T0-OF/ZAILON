/** Durée en MINUTES → « 2h 14m ». Ne reçoit jamais un timestamp absolu :
 * un timestamp (epoch ms) passé ici produit des milliards d'heures (bug
 * « 29770249211h ») — utiliser `formatClock` ou `formatElapsedDuration`. */
export function formatTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 525_600) return ''
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/** Timestamp epoch en MILLISECONDES → heure d'horloge « HH:MM ». C'est la
 * fonction à utiliser pour afficher une date/heure (jamais `formatTime`). */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Durée écoulée entre deux instants (ms) → « 2h 14m », « 1j 3h ». Unités
 * typées : les deux arguments sont des horodatages, JAMAIS un timestamp
 * absolu dans un formateur de durée. Valeur invalide (négative, NaN,
 * Infinity, > 1 an) → chaîne vide : rien n'est affiché à l'UI, l'erreur ne
 * va que dans le diagnostic développeur. */
export function formatElapsedDuration(startMs: number, nowMs: number): string {
  const elapsed = nowMs - startMs
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 31_536_000_000) {
    if (typeof console !== 'undefined') console.error('[ZAILON] durée invalide', { startMs, nowMs, elapsed })
    return ''
  }
  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest > 0 ? `${hours}h ${rest}min` : `${hours}h`
  }
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `${days}j ${restHours}h` : `${days}j`
}

export function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function timeAgo(date: Date | number): string {
  const now = Date.now()
  const diff = now - (date instanceof Date ? date.getTime() : date)
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function formatDownloads(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

export const LOADER_COLORS: Record<string, string> = {
  GIMI: '#7eb8f7',
  ZZMI: '#b87ef7',
  SRMI: '#f7cb7e',
  WWMI: '#7ef7b8',
  EFMI: '#f77e7e',
  UE5: '#e8b84b',
  DLL: '#a9a9f7',
  Archive: '#f7c37e',
  Folder: '#7ef7b8',
  BepInEx: '#ff7eb3',
  ASI: '#7ec8f7',
  CLEO: '#c8f77e',
  REF: '#f7a07e',
  MelonLoader: '#f77ef7',
  Manual: '#8888aa',
}

export const PLATFORM_COLORS: Record<string, string> = {
  gamebanana: '#e8b84b',
  nexus: '#df6e20',
  curseforge: '#f05e23',
  ayakamods: '#9b6dff',
  local: '#8888aa',
}

export const PLATFORM_LABELS: Record<string, string> = {
  gamebanana: 'GameBanana',
  nexus: 'Nexus Mods',
  curseforge: 'CurseForge',
  ayakamods: 'AyakaMods',
  local: 'Local',
}
