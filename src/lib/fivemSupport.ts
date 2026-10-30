/**
 * Support FiveM avancé — logique pure (spec « Support FiveM avancé » §1-2,
 * §4, §26 ; « Gestionnaire de packs graphiques FiveM » §analyse intelligente).
 *
 * Aucun accès disque : les chemins réels sont fournis par le backend natif ;
 * cette lib ne fait que classer et décider. Le chemin de `FiveM.app` n'est
 * jamais codé en dur — il est déduit des chemins observés.
 */

export type ReShadeCompat = 'recommended' | 'compatible' | 'risky' | 'unknown'

/** Dossiers utiles attendus dans l'environnement FiveM. */
export interface FiveMStructure {
  /** Racine FiveM détectée (dossier contenant FiveM.exe). */
  root?: string
  /** Chemin `FiveM.app` (dossier de données applicatives FiveM). */
  appData?: string
  /** Présence de `CitizenFX.ini`. */
  hasCitizenFxIni: boolean
  /** Dossiers présents : mods / citizen / plugins. */
  folders: { mods: boolean; citizen: boolean; plugins: boolean }
  /** Chemin GTA V (lu depuis `[Game] IVPath`) — jamais modifié par ZAILON. */
  gtaVPath?: string
}

export interface FiveMStructureInput {
  /** Chemin de l'exécutable (FiveM.exe) ou du lanceur. */
  execPath?: string
  /** Racine de l'installation FiveM (dossier contenant FiveM.exe). */
  installDirectory?: string
  /** Chemins observés par le scan natif (normalisés). */
  observedPaths?: string[]
}

const FIVEM_EXE = 'fivem.exe'
const FIVEM_APP = 'fivem.app'

/** Normalise un chemin pour une comparaison insensible à la casse. */
function norm(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

/** Détecte la structure FiveM à partir des chemins observés (jamais codé en dur). */
export function detectFiveMStructure(input: FiveMStructureInput): FiveMStructure {
  const paths = (input.observedPaths || []).map(norm)
  const root = input.installDirectory
  const hasApp = paths.some(path => path.endsWith(`/${FIVEM_APP}`) || path.includes(`/${FIVEM_APP}/`))
  const hasExe = paths.some(path => path.endsWith(`/${FIVEM_EXE}`)) || norm(input.execPath || '').endsWith(`/${FIVEM_EXE}`)
  const hasCitizenFx = paths.some(path => path.endsWith('/citizenfx.ini'))
  const hasFolder = (name: string) => paths.some(path => path.includes(`/${FIVEM_APP}/${name}/`) || path.endsWith(`/${FIVEM_APP}/${name}`))
  return {
    root: hasExe || hasApp ? root : undefined,
    appData: hasApp ? paths.find(path => path.includes(`/${FIVEM_APP}`)) : undefined,
    hasCitizenFxIni: hasCitizenFx,
    folders: { mods: hasFolder('mods'), citizen: hasFolder('citizen'), plugins: hasFolder('plugins') },
  }
}

/** Vrai si le chemin/nom désigne FiveM (marqueurs connus de la communauté). */
export function isFiveMName(name: string): boolean {
  const lower = norm(name)
  return lower.includes('fivem') || lower.includes('five m') || lower.includes('citizenfx')
}

/**
 * Classification de compatibilité ReShade pour une combinaison FiveM/GTA V.
 * Volontairement conservateur (spec §26) : aucune version n'est « toujours
 * bonne » ; `unknown` quand on ne peut pas décider.
 */
export function fiveMReShadeCompatibility(version?: string, hints?: { knownBad?: string[]; knownGood?: string[] }): ReShadeCompat {
  if (!version) return 'unknown'
  const knownBad = (hints?.knownBad || []).map(norm)
  const knownGood = (hints?.knownGood || []).map(norm)
  const target = norm(version)
  if (knownBad.includes(target)) return 'risky'
  if (knownGood.includes(target)) return 'recommended'
  // Une version majeure 5.x est « compatible » par défaut (méthode ReShade5
  // documentée), une 6.x reste « inconnue » tant qu'aucun retour ne la classe.
  if (/^5\./.test(target)) return 'compatible'
  return 'unknown'
}

/** Familles de fichiers reconnues dans un pack graphique. */
export type FiveMPackClass = 'fivem' | 'reshade' | 'gtav' | 'unknown'

export interface FiveMPackClassification {
  /** Nombre de fichiers classés par famille. */
  counts: Record<FiveMPackClass, number>
  /** Vrai si le pack contient au moins un élément FiveM (mods/citizen/plugins). */
  hasFiveM: boolean
  /** Vrai si le pack contient au moins un élément ReShade (shaders/preset/dll). */
  hasReShade: boolean
  /** Vrai si le pack contient des fichiers GTA V (à ne PAS copier dans FiveM). */
  hasGtaV: boolean
  /** Fichiers inconnus (à montrer avant installation — sandbox d'analyse). */
  unknownFiles: string[]
  /** Fichiers sensibles détectés (.exe/.dll/.asi — jamais exécutés automatiquement). */
  sensitiveFiles: string[]
}

const RESHADE_MARKERS = [/reshade/i, /\.ini$/, /reshade-shaders\//i, /\.fxh?$/i]
const GTAV_MARKERS = [/(^|\/)scripts\//i, /asi\//i, /graphics\.ytd/i, /\.rpf$/i, /update\//i, /x64\//i]
const FIVEM_MARKERS = [/(^|\/)mods\//i, /(^|\/)citizen\//i, /(^|\/)plugins\//i, /citizenfx\.ini/i, /fxmanifest\.lua/i]

/** Classe une entrée d'archive (chemin relatif) dans une famille. */
export function classifyFiveMPackEntry(path: string): FiveMPackClass {
  if (FIVEM_MARKERS.some(marker => marker.test(path))) return 'fivem'
  if (GTAV_MARKERS.some(marker => marker.test(path))) return 'gtav'
  if (RESHADE_MARKERS.some(marker => marker.test(path))) return 'reshade'
  return 'unknown'
}

/** Classe tout le contenu d'une archive (chemins relatifs) sans rien installer. */
export function classifyFiveMPack(entries: string[]): FiveMPackClassification {
  const counts: Record<FiveMPackClass, number> = { fivem: 0, reshade: 0, gtav: 0, unknown: 0 }
  const unknownFiles: string[] = []
  const sensitiveFiles: string[] = []
  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, '/')
    const klass = classifyFiveMPackEntry(normalized)
    counts[klass] += 1
    if (klass === 'unknown') unknownFiles.push(normalized)
    if (/\.(exe|dll|asi|bat|cmd|ps1)$/i.test(normalized)) sensitiveFiles.push(normalized)
  }
  return {
    counts,
    hasFiveM: counts.fivem > 0,
    hasReShade: counts.reshade > 0,
    hasGtaV: counts.gtav > 0,
    unknownFiles: unknownFiles.slice(0, 50),
    sensitiveFiles: sensitiveFiles.slice(0, 50),
  }
}
