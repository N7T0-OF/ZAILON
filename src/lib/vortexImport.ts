/**
 * Import Vortex — logique pure (spec « Finalisation des add-ons » §35).
 *
 * Vortex déploie déjà les mods dans le dossier du jeu (hardlink/symlink/move)
 * et décrit ce déploiement dans `vortex.deployment.json` (voir
 * Nexus-Mods/Vortex — « Deployment Methods », issue #13880). ZAILON ne re-déploie
 * donc RIEN : il lit le manifeste, déduit les mods actifs et crée un profil de
 * RÉFÉRENCES (jamais de copie, jamais de lien recréé).
 *
 * Parsing défensif : un champ inconnu/manquant ne casse pas la lecture ; un
 * manifeste sans entrées valides est ignoré (jamais deviné).
 */

export interface VortexDeploymentFile {
  /** Chemin relatif déployé (ex. `Data\\foo.esp`). */
  relPath: string
  /** Identifiant du mod source dans Vortex. */
  source: string
  /** Méthode de déploiement (hardlink/symlink/copy/move…). */
  deploymentMethod?: string
}

export interface VortexDeployment {
  instance: string
  version?: number
  files: VortexDeploymentFile[]
}

export interface VortexModSummary {
  name: string
  fileCount: number
  methods: string[]
}

/** Normalise un chemin relatif (`\\` → `/`). */
function norm(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '')
}

/**
 * Parse le manifeste `vortex.deployment.json` de façon défensive : renvoie
 * `null` si la structure attendue (`instance` + `files[]` avec relPath/source)
 * est absente ou vide — jamais de structure inventée.
 */
export function parseVortexDeployment(value: unknown): VortexDeployment | null {
  if (typeof value !== 'object' || value === null) return null
  const root = value as Record<string, unknown>
  const instance = typeof root.instance === 'string' && root.instance.trim() ? root.instance.trim() : null
  if (!instance) return null
  const rawFiles = Array.isArray(root.files) ? root.files : null
  if (!rawFiles || rawFiles.length === 0) return null
  const version = typeof root.version === 'number' ? root.version : undefined
  const files: VortexDeploymentFile[] = []
  for (const raw of rawFiles) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Record<string, unknown>
    const relPath = typeof entry.relPath === 'string' ? norm(entry.relPath) : ''
    const source = typeof entry.source === 'string' ? entry.source.trim() : ''
    if (!relPath || !source) continue
    files.push({
      relPath,
      source,
      deploymentMethod: typeof entry.deploymentMethod === 'string' ? entry.deploymentMethod : undefined,
    })
  }
  if (files.length === 0) return null
  return { instance, version, files }
}

/** Déduit les mods distincts (par source) et leur nombre de fichiers déployés. */
export function vortexModSummaries(deployment: VortexDeployment): VortexModSummary[] {
  const map = new Map<string, VortexModSummary>()
  for (const file of deployment.files) {
    const current = map.get(file.source)
    if (current) {
      current.fileCount += 1
      if (file.deploymentMethod && !current.methods.includes(file.deploymentMethod)) current.methods.push(file.deploymentMethod)
    } else {
      map.set(file.source, { name: file.source, fileCount: 1, methods: file.deploymentMethod ? [file.deploymentMethod] : [] })
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Résumé humain d'un déploiement (pour l'UI). */
export function vortexDeploymentDigest(deployment: VortexDeployment): { modCount: number; fileCount: number; methods: string[] } {
  const mods = vortexModSummaries(deployment)
  const methods = new Set<string>()
  for (const mod of mods) for (const method of mod.methods) methods.add(method)
  return { modCount: mods.length, fileCount: deployment.files.length, methods: [...methods].sort() }
}

/** Nom de profil ZAILON proposé pour un déploiement Vortex. */
export function vortexProfileName(instance: string, existing: string[]): string {
  const base = `Vortex — ${instance}`
  const lower = new Set(existing.map(name => name.toLocaleLowerCase()))
  if (!lower.has(base.toLocaleLowerCase())) return base
  let suffix = 2
  while (lower.has(`${base} (${suffix})`.toLocaleLowerCase())) suffix += 1
  return `${base} (${suffix})`
}
