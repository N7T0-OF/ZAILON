/**
 * Frosty Editor — Pont vers le runtime réel (spec §76-86, §16).
 *
 * ZAILON ne bundle JAMAIS Frosty (licence CC BY-NC-ND, docs/frosty-license-audit.md) :
 * ce module détecte le runtime officiel (FrostyModManager/Editor/Cmd), pilote le
 * Worker natif (start/status/stop), et traduit l'inventaire réel des données du
 * jeu (scan natif) en index d'assets. Pur — la couche IPC est dans native.ts.
 */

import type { FrostyAsset, FrostyAssetType } from './frostyAssets.ts'
import type { FrostyProject } from './frostyEditor.ts'

/** Runtime Frosty officiel détecté. */
export interface FrostyRuntime {
  path: string
  exe: string
  /** 'modmanager' | 'editor' | 'cmd' — ordre de préférence natif. */
  kind: FrostyRuntimeKind
  size: number
  detectedAt: number
}

export type FrostyRuntimeKind = 'modmanager' | 'editor' | 'cmd'

/** Fichier réel scanné côté natif. */
export interface GameDataFile {
  path: string
  size: number
  modified: number
}

/** État du Worker natif. */
export interface FrostyWorkerNativeStatus {
  running: boolean
  memoryMb: number | null
}

// ─────────────────────────────── Runtime ───────────────────────────────

/** Classe un exécutable Frosty (pur, testable). */
export function classifyRuntimeExe(exe: string): FrostyRuntimeKind {
  const lower = exe.toLowerCase()
  if (lower.includes('modmanager')) return 'modmanager'
  if (lower.includes('editor')) return 'editor'
  if (lower.includes('cmd')) return 'cmd'
  return 'modmanager'
}

/** Version recommandée par jeu (spec §62) — clé = nom de jeu exact. */
export function recommendedRuntimeForGame(gameName: string, fallback = '1.0.6.3'): string {
  const map: Record<string, string> = {
    'Need for Speed (2015)': '1.0.6.3',
    'Need for Speed Heat': '1.0.6.3',
    'Need for Speed Unbound': '1.0.6.3',
    'Battlefield 1': '1.0.6.3',
    'Battlefield V': '1.0.6.3',
    'Battlefield 4': '1.0.6.3',
    'Star Wars Battlefront II': '1.0.6.3',
    'Mass Effect: Andromeda': '1.0.6.3',
  }
  return map[gameName] ?? fallback
}

/** Règles de détection locales (dossier du jeu) — côté natif : détection + addon-data. */
export function localRuntimeCandidates(gamePath: string): string[] {
  const dir = gamePath.replace(/[\\/][^\\/]+$/, '')
  return [dir, `${dir}/Frosty`, dir.replace(/[\\/][^\\/]+$/, '')]
}

// ─────────────────────────── Fichiers réels → index ─────────────────────

/** Classification honnête d'un fichier réel par extension (spec §16 — jamais inventée). */
export function classifyGameDataFile(path: string): { type: FrostyAssetType; resourceType: string } {
  const lower = path.toLowerCase()
  const ext = lower.split('.').pop() ?? ''
  const fileName = lower.split(/[\\/]/).pop() ?? ''
  // Cas réels Frostbite : cas_XX.cas / cat.bin (catalogue) / .toc.
  if (['cas', 'cat', 'toc'].includes(ext) || (ext === 'bin' && fileName.startsWith('cat'))) return { type: 'chunk', resourceType: 'CasResource' }
  if (ext === 'ebx') return { type: 'ebx', resourceType: 'EbxAsset' }
  if (['dds', 'tga', 'png', 'bik', 'jpg'].includes(ext)) return { type: 'texture', resourceType: 'TextureAsset' }
  if (['mesh', 'meshset'].includes(ext)) return { type: 'mesh', resourceType: 'MeshSetAsset' }
  if (['spk', 'wav', 'mp3', 'bnk', 'ea3', 'ogg'].includes(ext)) return { type: 'audio', resourceType: 'SoundWaveAsset' }
  if (['loc', 'locres', 'strings'].includes(ext)) return { type: 'res', resourceType: 'LocalizationAsset' }
  if (['sb', 'sba', 'res'].includes(ext)) return { type: 'res', resourceType: 'ResAsset' }
  return { type: 'res', resourceType: 'RawResource' }
}

/** Traduit l'inventaire réel du jeu en assets d'index (spec §16). */
export function gameFilesToAssetIndex(gameKey: string, frostyVersion: string, files: GameDataFile[]): FrostyAsset[] {
  return files.map((file, index) => {
    const { type, resourceType } = classifyGameDataFile(file.path)
    const segments = file.path.split(/[\\/]/)
    const name = segments[segments.length - 1] ?? file.path
    const bundle = segments.length > 1 ? segments[segments.length - 2] : 'root'
    return {
      id: `${gameKey}:${index}:${type}`,
      name: file.path,
      path: file.path,
      type,
      bundle,
      resourceType,
      size: file.size,
    }
  })
}

/** Répartition réelle du scan (résumé UI). */
export function gameDataSummary(files: GameDataFile[]): { count: number; bytes: number; biggest: string | null } {
  let bytes = 0
  let biggest: GameDataFile | null = null
  for (const file of files) {
    bytes += file.size
    if (!biggest || file.size > biggest.size) biggest = file
  }
  return { count: files.length, bytes, biggest: biggest ? `${biggest.path} (${formatBytes(biggest.size)})` : null }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} Go`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} Mo`
  return `${Math.round(bytes / 1_000)} Ko`
}

// ─────────────────────────────── Worker natif ──────────────────────────

/** Politique de redémarrage du Worker après un crash natif (§78, §83). */
export function workerAfterNativeCrash(crashCount: number, maxBeforeDisable = 2): 'restart' | 'disable' {
  return crashCount + 1 >= maxBeforeDisable ? 'disable' : 'restart'
}

/** Décision d'arrêt du Worker à la fermeture de l'éditeur (§81). */
export function workerStopDecision(mode: 'balanced' | 'performance' | 'max', warmMs: Record<'balanced' | 'performance' | 'max', number> = { balanced: 45_000, performance: 5_000, max: 0 }): { stopNow: boolean; warmMs: number } {
  const delay = warmMs[mode]
  return { stopNow: delay === 0, warmMs: delay }
}

/** Rampe le PID natif dans le modèle de cycle de vie (§79-80). */
export function workerFromNative(status: FrostyWorkerNativeStatus, pid: number | undefined): { running: boolean; pid?: number; memoryMb: number | null } {
  return { running: status.running, pid, memoryMb: status.memoryMb }
}

/** Vérifie qu'un projet Frosty a un runtime réel avant build (§102). */
export function runtimeRequiredCheck(runtime: FrostyRuntime | null, project: FrostyProject): { ok: boolean; message?: string } {
  if (!runtime) return { ok: false, message: 'Runtime Frosty officiel introuvable — installez/détectez Frosty (Frosty Support) avant de builder.' }
  const recommended = recommendedRuntimeForGame(project.gameName)
  if (recommended !== '1.0.6.3' && project.frostyRuntimeVersion !== recommended) {
    return { ok: true, message: `⚠ Version conseillée pour ${project.gameName} : ${recommended} (projet : ${project.frostyRuntimeVersion}).` }
  }
  return { ok: true }
}
