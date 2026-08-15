/**
 * Planification des packs graphiques FiveM — logique pure (spec
 * « Gestionnaire de packs graphiques FiveM » §analyse intelligente,
 * §importation intelligente, §désinstallation propre).
 *
 * Aucun accès disque : cette lib transforme une liste de chemins relatifs
 * (contenu d'une archive) en un PLAN d'installation (source → cible sous le
 * profil), génère le manifeste `zailon-manifest.json` et sait en déduire le
 * plan de rollback. L'application réelle (copie/restauration) est faite par le
 * backend natif.
 */

/** Famille d'une entrée de pack. */
export type PackEntryKind = 'mods' | 'citizen' | 'plugins' | 'reshade-shaders' | 'reshade-config' | 'citizenfx' | 'gtav' | 'unknown'

export interface PackPlanEntry {
  /** Chemin relatif dans l'archive (normalisé `/`). */
  source: string
  /** Chemin cible relatif au profil FiveM (défini pour les entrées installables). */
  target?: string
  kind: PackEntryKind
  sensitive: boolean
}

export interface PackPlan {
  /** Entrées installables (mappées vers le profil). */
  entries: PackPlanEntry[]
  /** Entrées exclues : fichiers GTA V (à ne PAS copier dans FiveM) + inconnus. */
  excluded: PackPlanEntry[]
  /** Fichiers sensibles (.exe/.dll/.asi…), jamais exécutés automatiquement. */
  sensitive: PackPlanEntry[]
  summary: Record<'mods' | 'citizen' | 'plugins' | 'reshadeShaders' | 'reshadeConfig' | 'gtav' | 'unknown', number>
}

const SENSITIVE = /\.(exe|dll|asi|bat|cmd|ps1)$/i

/** Normalise un chemin relatif (`\` → `/`, suppression des segments vides). */
function norm(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '')
}

/** Supprime la racine commune des entrées (ex. `MonPack/`, `FiveM/application data/`). */
export function stripCommonRoot(entries: string[]): string[] {
  const normalized = entries.map(norm).filter(Boolean)
  if (normalized.length < 2) return normalized
  const split = normalized.map(entry => entry.split('/'))
  let depth = 0
  outer: while (depth < split[0].length) {
    const segment = split[0][depth]
    if (!segment) break
    for (const parts of split) {
      if (parts[depth] !== segment) break outer
    }
    depth += 1
  }
  if (depth === 0) return normalized
  return split.map(parts => parts.slice(depth).join('/')).filter(Boolean)
}

/** Mappe une entrée (déjà dé-racinée) vers sa famille et sa cible. */
export function mapPackEntry(path: string): { kind: PackEntryKind; target?: string } {
  const p = norm(path)
  if (!p) return { kind: 'unknown' }
  const lower = p.toLowerCase()

  const afterFolder = (folder: string): string | undefined => {
    if (lower === folder) return ''
    if (lower.startsWith(`${folder}/`)) return p.slice(folder.length + 1)
    const idx = lower.indexOf(`/${folder}/`)
    if (idx >= 0) return p.slice(idx + folder.length + 2)
    return undefined
  }

  // Fichiers GTA V : ne JAMAIS les copier dans FiveM (§ « Très important »).
  if (/(^|\/)scripts\//i.test(p) || /(^|\/)x64\//i.test(p) || /(^|\/)update\//i.test(p) || /(^|\/)dlcpacks\//i.test(p) || /\.rpf$/i.test(lower) || /(^|\/)asi\//i.test(p)) {
    return { kind: 'gtav' }
  }
  for (const folder of ['mods', 'citizen', 'plugins', 'reshade-shaders'] as const) {
    const rest = afterFolder(folder)
    if (rest !== undefined) return { kind: folder, target: `${folder}/${rest}` }
  }
  if (/citizenfx\.ini$/i.test(lower)) return { kind: 'citizenfx', target: 'citizenfx.ini' }
  if (/(^|\/)reshade\.ini$/i.test(p) || /(^|\/)reshade-preset\.ini$/i.test(p) || /(^|\/)presets?\//i.test(p)) {
    const name = p.split('/').pop() || 'preset.ini'
    return { kind: 'reshade-config', target: `presets/${name}` }
  }
  if (/\.fxh?$/i.test(lower)) return { kind: 'reshade-shaders', target: `reshade-shaders/${p.split('/').pop()}` }
  return { kind: 'unknown' }
}

/** Construit le plan d'installation complet d'un pack (sans rien installer). */
export function planFiveMPack(entries: string[]): PackPlan {
  const stripped = stripCommonRoot(entries)
  const mapped = stripped.map(source => {
    const { kind, target } = mapPackEntry(source)
    return { source, target, kind, sensitive: SENSITIVE.test(source) } satisfies PackPlanEntry
  })
  const entries_ = mapped.filter(entry => entry.target !== undefined && entry.kind !== 'gtav')
  const excluded = mapped.filter(entry => entry.target === undefined || entry.kind === 'gtav')
  const sensitive = mapped.filter(entry => entry.sensitive)
  const summary = {
    mods: entries_.filter(entry => entry.kind === 'mods').length,
    citizen: entries_.filter(entry => entry.kind === 'citizen').length,
    plugins: entries_.filter(entry => entry.kind === 'plugins').length,
    reshadeShaders: entries_.filter(entry => entry.kind === 'reshade-shaders').length,
    reshadeConfig: entries_.filter(entry => entry.kind === 'reshade-config').length,
    gtav: mapped.filter(entry => entry.kind === 'gtav').length,
    unknown: mapped.filter(entry => entry.kind === 'unknown').length,
  }
  return { entries: entries_, excluded, sensitive, summary }
}

/** Contenu du manifeste `zailon-manifest.json` (fichiers possédés + sources). */
export function packManifest(packName: string, plan: PackPlan): object {
  return {
    schemaVersion: 1,
    kind: 'FiveMGraphicPack',
    name: packName,
    installedAt: null,
    files: plan.entries.map(entry => ({
      target: entry.target,
      source: entry.source,
      kind: entry.kind,
    })),
    sensitive: plan.sensitive.map(entry => entry.source),
  }
}

/** Liste des fichiers possédés par un manifeste (plan de rollback / désinstallation). */
export function rollbackPlanFromManifest(manifest: { files?: Array<{ target?: string }> }): string[] {
  return (manifest.files || []).map(entry => entry.target).filter((target): target is string => Boolean(target))
}
