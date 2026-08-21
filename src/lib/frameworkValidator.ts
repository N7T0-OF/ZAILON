/**
 * Validateur de frameworks pré-lancement (bloc Cyberpunk RED4ext).
 *
 * Logique pure et testable, miroir des diagnostics natifs
 * (`dependency_diagnostics` dans lib.rs) : un plugin/framework NE DOIT PAS être
 * activé sans son loader/core dans le même déploiement — ZAILON ne lance jamais
 * Cyberpunk avec un framework incomplet (« RED4ext could not be loaded »).
 *
 * Règles couvertes (spec « Correctif critique Cyberpunk RED4ext » §2-5) :
 * - RED4ext : un fichier sous `red4ext/plugins/` exige `red4ext/red4ext.dll`
 *   (fourni par un mod actif ou déjà présent dans le jeu) ;
 * - redscript : un fichier sous `r6/scripts/` exige le compilateur
 *   `engine/tools/scc.exe` ;
 * - TweakXL : un fichier sous `r6/tweaks/` exige `red4ext/plugins/TweakXL` ;
 * - ArchiveXL : une ressource `.xl` exige `red4ext/plugins/ArchiveXL`.
 *
 * Seul le CORE est vérifié (jamais par simple nom) : plugins présents sans
 * core → blocage. `onDisk(rel)` permet de considérer les fichiers déjà
 * installés dans le jeu (sinon, seul le déploiement du profil compte).
 */

export interface FrameworkCheckInput {
  name: string
  enabled: boolean
  files?: string[]
  /** Nom du framework déclaré (ex. `red4ext`), indépendant des fichiers. */
  framework?: string
}

export interface FrameworkValidation {
  valid: boolean
  /** Dépendances manquantes : le lancement doit être bloqué. */
  blockers: string[]
  warnings: string[]
}

function normalizeFile(path: string): string {
  return path.replace(/\\/g, '/').toLocaleLowerCase()
}

/** Vrai si un des mods actifs fournit le chemin relatif donné. */
function suppliedBy(mods: FrameworkCheckInput[], relative: string): boolean {
  const target = normalizeFile(relative)
  return mods.some(mod => mod.enabled && (mod.files || []).some(file => normalizeFile(file) === target))
}

function suppliedUnder(mods: FrameworkCheckInput[], prefix: string): boolean {
  const normalized = normalizeFile(prefix)
  return mods.some(mod => mod.enabled && (mod.files || []).some(file => normalizeFile(file).startsWith(normalized)))
}

/**
 * Capacités frameworks Cyberpunk (spec §28-31) : une capacité est fournie par
 * un paquet actif via un dossier canonique OU une signature de fichier — le
 * nom du dossier n'est jamais une partie du chemin de jeu et ne fait pas foi
 * (un dossier « core_01 » contenant `red4ext/plugins/TweakXL/…` fournit
 * `cyberpunk.tweakxl` grâce au dossier ; un `tweakxl.dll` mal placé la fournit
 * grâce à la signature de fichier).
 */
export type CyberpunkFrameworkCapability =
  | 'cyberpunk.red4ext'
  | 'cyberpunk.redscript'
  | 'cyberpunk.tweakxl'
  | 'cyberpunk.archivexl'
  | 'cyberpunk.codeware'
  | 'cyberpunk.cet'

interface FrameworkSignature {
  /** Tout fichier sous ce préfixe de dossier fournit la capacité. */
  folderPrefix?: string
  /** Un fichier portant ce nom (n'importe où) fournit la capacité. */
  fileSignatures?: string[]
  /** Tous ces fichiers exacts doivent être présents (cores compilés). */
  exactFiles?: string[]
}

export const CYBERPUNK_FRAMEWORK_SIGNATURES: Record<CyberpunkFrameworkCapability, FrameworkSignature> = {
  'cyberpunk.red4ext': { exactFiles: ['red4ext/red4ext.dll'] },
  'cyberpunk.redscript': { exactFiles: ['engine/tools/scc.exe'] },
  'cyberpunk.tweakxl': { folderPrefix: 'red4ext/plugins/TweakXL/', fileSignatures: ['tweakxl.dll', 'tweak_xl.dll'] },
  'cyberpunk.archivexl': { folderPrefix: 'red4ext/plugins/ArchiveXL/', fileSignatures: ['archivexl.dll'] },
  'cyberpunk.codeware': { folderPrefix: 'red4ext/plugins/Codeware/', fileSignatures: ['codeware.dll'] },
  'cyberpunk.cet': { exactFiles: ['bin/x64/plugins/cyber_engine_tweaks.asi'] },
}

/** Capacités fournies par un paquet actif (spec §28, §31). */
export function detectFrameworkCapabilities(mod: FrameworkCheckInput): CyberpunkFrameworkCapability[] {
  if (!mod.enabled) return []
  const files = (mod.files ?? []).map(normalizeFile)
  const found: CyberpunkFrameworkCapability[] = []
  for (const [capability, signature] of Object.entries(CYBERPUNK_FRAMEWORK_SIGNATURES)) {
    const byFolder = signature.folderPrefix
      ? files.some(file => file.startsWith(normalizeFile(signature.folderPrefix!)))
      : false
    const bySignature = signature.fileSignatures?.some(name => {
      const normalized = normalizeFile(name)
      return files.some(file => file === normalized || file.endsWith('/' + normalized))
    }) ?? false
    const byExact = signature.exactFiles?.every(exact => files.includes(normalizeFile(exact))) ?? false
    if (byFolder || bySignature || byExact) found.push(capability as CyberpunkFrameworkCapability)
  }
  return found
}

/** Union des capacités fournies par les mods actifs (graphe global, spec §29-30). */
export function providedFrameworkCapabilities(mods: FrameworkCheckInput[]): Set<CyberpunkFrameworkCapability> {
  const provided = new Set<CyberpunkFrameworkCapability>()
  mods.forEach(mod => detectFrameworkCapabilities(mod).forEach(capability => provided.add(capability)))
  return provided
}

export function validateCyberpunkFrameworkDeps(
  mods: FrameworkCheckInput[],
  onDisk?: (relative: string) => boolean,
): FrameworkValidation {
  const warnings: string[] = []
  const blockers: string[] = []
  const enabled = mods.filter(mod => mod.enabled)
  const hasPlugin = suppliedUnder(enabled, 'red4ext/plugins/')
  const hasScripts = suppliedUnder(enabled, 'r6/scripts/')
  const hasTweaks = suppliedUnder(enabled, 'r6/tweaks/')
  const hasXl = enabled.some(mod => (mod.files || []).some(file => normalizeFile(file).endsWith('.xl')))

  // Graphe de dépendances : les besoins sont satisfaits par des CAPACITÉS
  // (dossier canonique OU signature de fichier), jamais par un chemin exact de
  // dossier — « TweakXL est requis » alors que TweakXL est stagé sous
  // red4ext/plugins/TweakXL/… ne doit plus se produire.
  const provided = providedFrameworkCapabilities(enabled)
  const coreAvailable = (capability: CyberpunkFrameworkCapability, onDiskFile: string) =>
    provided.has(capability) || Boolean(onDisk?.(onDiskFile))

  if (hasPlugin && !coreAvailable('cyberpunk.red4ext', 'red4ext/red4ext.dll')) {
    blockers.push(
      'RED4ext est requis par au moins un plugin sous red4ext/plugins/ mais son loader (red4ext/red4ext.dll) n’est pas dans le déploiement. Activez le mod du framework RED4ext ou désactivez les plugins concernés.',
    )
  }
  if (hasScripts && !coreAvailable('cyberpunk.redscript', 'engine/tools/scc.exe')) {
    blockers.push(
      'redscript est requis par un ou plusieurs fichiers sous r6/scripts/ mais son compilateur (engine/tools/scc.exe) n’est pas dans le déploiement.',
    )
  }
  if (hasTweaks && !coreAvailable('cyberpunk.tweakxl', 'red4ext/plugins/TweakXL')) {
    blockers.push(
      'TweakXL est requis par un ou plusieurs fichiers sous r6/tweaks/ mais n’est pas dans le déploiement.',
    )
  }
  if (hasXl && !coreAvailable('cyberpunk.archivexl', 'red4ext/plugins/ArchiveXL')) {
    blockers.push(
      'ArchiveXL est requis par au moins une ressource .xl mais n’est pas dans le déploiement.',
    )
  }

  // Badge honnête : ne jamais prétendre « RED4ext chargé » si seul le core est
  // présent (le chargement réel se confirme au runtime, pas avant lancement).
  if (suppliedBy(enabled, 'red4ext/red4ext.dll')) {
    warnings.push('RED4ext core présent dans le déploiement — le chargement réel sera confirmé après lancement.')
  }

  return { valid: blockers.length === 0, blockers, warnings }
}

/** Vrai si le loader RED4ext est actif dans le déploiement (mod actif fournissant
 * `red4ext/red4ext.dll` ou un mod marqué `framework: red4ext`). C'est le badge
 * « RED4ext ⚠ » de l'Accueil et du Quick Panel : ⚠ = présent mais chargement
 * non confirmé — jamais « ✓ » sans confirmation runtime post-lancement. */
export function isRed4extActive(mods: FrameworkCheckInput[]): boolean {
  const normalized = normalizeFile('red4ext/')
  return mods.some(mod => mod.enabled && (
    (mod.framework ?? '').toLocaleLowerCase().includes('red4ext')
    || (mod.files ?? []).some(file => normalizeFile(file).startsWith(normalized))
  ))
}

/** Contexte du bouton « Réparer RED4ext » (spec Cyberpunk §9-10). */
export interface Red4extRepairContext {
  /** Mods actifs du profil (fichiers relatifs). */
  activeMods: FrameworkCheckInput[]
  /** Table virtuelle produite par l'audit de déploiement. */
  virtualFiles: Array<{ gameRelativePath: string }>
  brokenReferences: number
  deployable: boolean
}

export interface Red4extRepairSummary {
  /** Un mod actif fournit des fichiers sous `red4ext/`. */
  packageFound: boolean
  /** `red4ext/red4ext.dll` est fourni par un mod actif du profil. */
  coreInDeployment: boolean
  /** `red4ext/red4ext.dll` est exposé par la table virtuelle (audit). */
  coreInVirtualMap: boolean
  /** Fichiers sous `red4ext/plugins/`. */
  pluginCount: number
  /** Entrées `red4ext/` dans la table virtuelle. */
  red4extEntryCount: number
  brokenReferences: number
  verdict: 'ok' | 'package-missing' | 'core-missing' | 'core-not-exposed' | 'deployment-broken'
  /** Actions humaines — JAMAIS de téléchargement automatique (spec §9). */
  actions: string[]
}

/** Évalue l'état réel du framework RED4ext pour décider de la réparation.
 * Vérifie à chaque couche : profil (mods actifs), table virtuelle (audit),
 * références — le diagnostic ne prétend jamais « réparé » sans preuve. */
export function evaluateRed4extRepair(context: Red4extRepairContext): Red4extRepairSummary {
  const enabled = context.activeMods.filter(mod => mod.enabled)
  const red4extFiles = enabled
    .flatMap(mod => (mod.files ?? []).map(normalizeFile))
    .filter(file => file.startsWith('red4ext/'))
  const coreInDeployment = red4extFiles.includes('red4ext/red4ext.dll')
  const pluginCount = red4extFiles.filter(file => file.startsWith('red4ext/plugins/')).length
  const virtualRed4ext = context.virtualFiles
    .map(entry => normalizeFile(entry.gameRelativePath))
    .filter(path => path.startsWith('red4ext/'))
  const coreInVirtualMap = virtualRed4ext.includes('red4ext/red4ext.dll')

  const actions: string[] = []
  let verdict: Red4extRepairSummary['verdict'] = 'ok'

  if (red4extFiles.length === 0) {
    verdict = 'package-missing'
    actions.push('Aucun mod actif ne fournit de fichiers sous red4ext/. Activez le mod du framework RED4ext dans le profil.')
  } else if (!coreInDeployment) {
    verdict = 'core-missing'
    actions.push('Des fichiers red4ext/ sont présents mais pas le loader red4ext/red4ext.dll. Activez le mod qui contient le core (ou restaurez-le manuellement — ZAILON ne télécharge jamais une version sans confirmation).')
  } else if (!coreInVirtualMap) {
    verdict = 'core-not-exposed'
    actions.push('Le core est dans le profil mais absent de la table virtuelle : le manifeste ou la VirtualFileMap est cassé. Relancez l’audit puis réappliquez le déploiement au prochain lancement.')
  } else if (context.brokenReferences > 0) {
    verdict = 'deployment-broken'
    actions.push(`${context.brokenReferences} référence(s) de paquet cassée(s). Utilisez « Réparer l’import MO2 et le déploiement » (Outils de réparation).`)
  } else {
    actions.push('RED4ext opérationnel : core exposé dans la table virtuelle, plugins détectés. Le chargement réel se confirme au runtime.')
  }
  if (!context.deployable) {
    verdict = 'deployment-broken'
    actions.unshift('Le profil n’est pas déployable : réparez les références avant de lancer.')
  }

  return {
    packageFound: red4extFiles.length > 0,
    coreInDeployment,
    coreInVirtualMap,
    pluginCount,
    red4extEntryCount: virtualRed4ext.length,
    brokenReferences: context.brokenReferences,
    verdict,
    actions,
  }
}
