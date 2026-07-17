export function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function timeAgo(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()
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
