/**
 * Validateur hiérarchique des frameworks Cyberpunk (spec « Runtime Session V3 »
 * §36-43).
 *
 * Principe : RED4ext est le framework racine critique. Si RED4ext échoue,
 * redscript / ArchiveXL / TweakXL / Codeware / CET peuvent apparaître
 * « absents » alors qu'ils sont simplement dépendants — on ne doit JAMAIS
 * empiler trois messages « framework manquant » quand une cause commune existe.
 *
 * Ordre de vérification (spec §37) :
 *   RED4ext → redscript → ArchiveXL → TweakXL → Codeware → CET
 *
 * Le premier framework non prêt dans cet ordre est la CAUSE PRIMAIRE ; les
 * frameworks suivants non prêts sont des CONSÉQUENCES (spec §43) — leur état
 * propre n'est pas diagnostiqué indépendamment.
 *
 * États distingués (spec §40) :
 *   - ready        : fourni et exposé correctement ;
 *   - missing      : aucun mod actif ne fournit la capacité ;
 *   - misplaced    : fourni par signature de fichier mais hors de son dossier
 *                    canonique (ex. tweakxl.dll à plat au lieu de
 *                    red4ext/plugins/TweakXL/) ;
 *   - not-deployed : paquet présent dans le profil mais absent de la table
 *                    virtuelle (racine mal exposée) — vérifié seulement si
 *                    `virtualFiles` est fourni ;
 *   - incompatible : l'empreinte a changé depuis le dernier lancement réussi
 *                    (Last Known Good, spec §41) — avertissement, pas blocage ;
 *   - consequence  : non prêt MAIS causé par la cause primaire (pas de message
 *                    propre).
 *
 * Logique pure et testable : aucun accès au store.
 */

import {
  CYBERPUNK_FRAMEWORK_SIGNATURES,
  detectFrameworkCapabilities,
  type CyberpunkFrameworkCapability,
  type FrameworkCheckInput,
} from './frameworkValidator.ts'
import {
  compareFrameworkSets,
  fingerprintFrameworkSet,
  type FrameworkSnapshot,
} from './lastKnownGood.ts'

export type FrameworkDiagnosisKind =
  | 'ready'
  | 'missing'
  | 'absent'
  | 'misplaced'
  | 'not-deployed'
  | 'incompatible'
  | 'consequence'

export interface FrameworkDiagnosis {
  capability: CyberpunkFrameworkCapability
  label: string
  kind: FrameworkDiagnosisKind
  /** Fourni par au moins un mod actif (dossier canonique OU signature). */
  provided: boolean
  /** Fichiers des mods actifs qui fournissent la capacité. */
  providedFiles: string[]
  /** Fichiers canoniques attendus (dossier ou core exact). */
  canonicalFiles: string[]
  /** Explication humaine de l'état. */
  detail: string
  /** Framework qui cause l'état, si `consequence`. */
  blockedBy?: string
}

export interface HierarchicalValidation {
  /** Diagnostics dans l'ordre de vérification (spec §37). */
  ordered: FrameworkDiagnosis[]
  /** Cause primaire : le premier framework non prêt, s'il en existe un. */
  primaryCause?: FrameworkDiagnosis
  /** Conséquences (frameworks de rang supérieur masqués par la cause). */
  consequences: FrameworkDiagnosis[]
  blockers: string[]
  warnings: string[]
  valid: boolean
}

export const FRAMEWORK_ORDER: CyberpunkFrameworkCapability[] = [
  'cyberpunk.red4ext',
  'cyberpunk.redscript',
  'cyberpunk.archivexl',
  'cyberpunk.tweakxl',
  'cyberpunk.codeware',
  'cyberpunk.cet',
]

export const FRAMEWORK_LABELS: Record<CyberpunkFrameworkCapability, string> = {
  'cyberpunk.red4ext': 'RED4ext',
  'cyberpunk.redscript': 'redscript',
  'cyberpunk.archivexl': 'ArchiveXL',
  'cyberpunk.tweakxl': 'TweakXL',
  'cyberpunk.codeware': 'Codeware',
  'cyberpunk.cet': 'Cyber Engine Tweaks',
}

/** Emplacement canonique par capacité : dossier (préfixe) ou core exact. */
const CANONICAL: Record<CyberpunkFrameworkCapability, string[]> = {
  'cyberpunk.red4ext': ['red4ext/red4ext.dll'],
  'cyberpunk.redscript': ['engine/tools/scc.exe'],
  'cyberpunk.archivexl': ['red4ext/plugins/ArchiveXL/'],
  'cyberpunk.tweakxl': ['red4ext/plugins/TweakXL/'],
  'cyberpunk.codeware': ['red4ext/plugins/Codeware/'],
  'cyberpunk.cet': ['bin/x64/plugins/cyber_engine_tweaks.asi'],
}

/** Vrai si `file` est sous un emplacement canonique (préfixe) ou égal à un
 * core exact. */
function matchesCanonical(file: string, canonical: string[]): boolean {
  return canonical.some(target =>
    target.endsWith('/')
      ? file.startsWith(target.toLocaleLowerCase())
      : file === target.toLocaleLowerCase(),
  )
}

export function validateFrameworkHierarchy(
  mods: FrameworkCheckInput[],
  options?: {
    /** Chemins projetés dans la racine du jeu (table virtuelle de l'audit). */
    virtualFiles?: string[]
    /** Last Known Good enregistré au dernier lancement réussi (spec §41). */
    previousSnapshot?: FrameworkSnapshot
  },
): HierarchicalValidation {
  const normalize = (path: string) => path.replace(/\\/g, '/').toLocaleLowerCase()
  const enabled = mods.filter(mod => mod.enabled)
  const allProvidedFiles = enabled.flatMap(mod =>
    (mod.files ?? []).map(normalize),
  )
  const provided = new Set<CyberpunkFrameworkCapability>()
  enabled.forEach(mod =>
    detectFrameworkCapabilities(mod).forEach(capability => provided.add(capability)),
  )

  /** Vrai si un fichier (normalisé) participe à la fourniture d'une capacité. */
  const fileProvides = (file: string, capability: CyberpunkFrameworkCapability): boolean => {
    const signature = CYBERPUNK_FRAMEWORK_SIGNATURES[capability]
    if (signature.folderPrefix && file.startsWith(signature.folderPrefix.toLocaleLowerCase())) return true
    if (signature.fileSignatures?.some(name => {
      const normalized = name.toLocaleLowerCase()
      return file === normalized || file.endsWith('/' + normalized)
    })) return true
    if (signature.exactFiles?.some(exact => file === exact.toLocaleLowerCase())) return true
    return false
  }

  // Changements Last Known Good par label (clés de snapshot insensibles à la
  // casse : « RED4ext », « redscript »…).
  const lkgChanges = options?.previousSnapshot
    ? compareFrameworkSets(options.previousSnapshot, fingerprintFrameworkSet(enabled))
    : []
  const lkgChanged = new Set(lkgChanges.map(change => change.framework.toLocaleLowerCase()))

  const virtualFiles = options?.virtualFiles?.map(normalize) ?? undefined

  // Besoins réels du profil : un framework manquant ne bloque QUE s'il est
  // requis par un contenu actif (plugins → RED4ext, r6/scripts → redscript,
  // r6/tweaks → TweakXL, .xl → ArchiveXL). Codeware/CET n'ont pas de besoin
  // déductible automatiquement (capacités seulement).
  const hasPlugin = allProvidedFiles.some(file => file.startsWith('red4ext/plugins/'))
  const hasScripts = allProvidedFiles.some(file => file.startsWith('r6/scripts/'))
  const hasTweaks = allProvidedFiles.some(file => file.startsWith('r6/tweaks/'))
  const hasXl = allProvidedFiles.some(file => file.endsWith('.xl'))
  const NEEDED: Record<CyberpunkFrameworkCapability, boolean> = {
    'cyberpunk.red4ext': hasPlugin,
    'cyberpunk.redscript': hasScripts,
    'cyberpunk.archivexl': hasXl,
    'cyberpunk.tweakxl': hasTweaks,
    'cyberpunk.codeware': false,
    'cyberpunk.cet': false,
  }

  const diagnoses: FrameworkDiagnosis[] = FRAMEWORK_ORDER.map(capability => {
    const label = FRAMEWORK_LABELS[capability]
    const canonicalFiles = CANONICAL[capability]
    const providedFiles = allProvidedFiles.filter(file =>
      fileProvides(file, capability),
    )
    const isProvided = provided.has(capability)

    if (!isProvided) {
      // Manquant mais non requis : simple absence, jamais un blocage.
      if (!NEEDED[capability]) {
        return {
          capability,
          label,
          kind: 'absent',
          provided: false,
          providedFiles: [],
          canonicalFiles,
          detail: `${label} n'est pas fourni par le profil — non requis par les mods actifs.`,
        }
      }
      return {
        capability,
        label,
        kind: 'missing',
        provided: false,
        providedFiles: [],
        canonicalFiles,
        detail: `${label} est requis par un contenu actif mais aucun mod du profil ne le fournit.`,
      }
    }

    // Fourni mais hors emplacement canonique (signature seule, dossier mal
    // nommé) : le dossier canonique ne contient aucun fichier.
    const canonicalHits = allProvidedFiles.filter(file => matchesCanonical(file, canonicalFiles))
    if (canonicalHits.length === 0) {
      return {
        capability,
        label,
        kind: 'misplaced',
        provided: true,
        providedFiles,
        canonicalFiles,
        detail: `${label} est fourni (signature de fichier) mais aucun fichier n'est à son emplacement canonique attendu (${canonicalFiles.join(' ou ')}). Utilisez « Réparer les racines des imports ».`,
      }
    }

    // Présent dans le profil mais absent de la table virtuelle : racine mal
    // exposée au runtime (vérifié uniquement si l'audit est fourni).
    if (virtualFiles !== undefined) {
      const projected = virtualFiles.some(file => matchesCanonical(file, canonicalFiles))
      if (!projected) {
        return {
          capability,
          label,
          kind: 'not-deployed',
          provided: true,
          providedFiles,
          canonicalFiles,
          detail: `${label} est dans le profil mais absent de la table virtuelle — la racine projetée ne l'expose pas. Relancez l'audit puis réappliquez le déploiement.`,
        }
      }
    }

    if (lkgChanged.has(label.toLocaleLowerCase())) {
      return {
        capability,
        label,
        kind: 'incompatible',
        provided: true,
        providedFiles,
        canonicalFiles,
        detail: `${label} a changé depuis votre dernier lancement réussi (Last Known Good). Vérifiez la compatibilité avec la version actuelle du jeu.`,
      }
    }

    return {
      capability,
      label,
      kind: 'ready',
      provided: true,
      providedFiles,
      canonicalFiles,
      detail: `${label} prêt : fourni et exposé.`,
    }
  })

  const hardStates: FrameworkDiagnosisKind[] = ['missing', 'misplaced', 'not-deployed']
  const primaryCause = diagnoses.find(diagnosis => hardStates.includes(diagnosis.kind))

  // Frameworks RED4ext natifs : plugins RED4ext (spec §37). Si RED4ext est la
  // cause primaire, TweakXL / ArchiveXL / Codeware (fournis ou requis) sont des
  // CONSÉQUENCES — jamais des erreurs indépendantes (spec §43).
  const RED4EXT_DEPENDENTS: CyberpunkFrameworkCapability[] = [
    'cyberpunk.archivexl',
    'cyberpunk.tweakxl',
    'cyberpunk.codeware',
  ]
  const blocked = new Set<CyberpunkFrameworkCapability>()
  if (primaryCause?.capability === 'cyberpunk.red4ext') {
    for (const capability of RED4EXT_DEPENDENTS) {
      const diagnosis = diagnoses.find(item => item.capability === capability)
      if (diagnosis && diagnosis.kind !== 'absent') blocked.add(capability)
    }
  }

  const blockers: string[] = []
  const warnings: string[] = []
  const consequences: FrameworkDiagnosis[] = []
  const ordered = diagnoses.map(diagnosis => {
    if (blocked.has(diagnosis.capability)) {
      const consequence: FrameworkDiagnosis = {
        ...diagnosis,
        kind: 'consequence',
        blockedBy: primaryCause?.label,
        detail: `${diagnosis.label} non disponible — conséquence de ${primaryCause?.label}. Corrigez ${primaryCause?.label} en premier.`,
      }
      consequences.push(consequence)
      return consequence
    }
    if (diagnosis.kind === 'incompatible') {
      warnings.push(diagnosis.detail)
    }
    return diagnosis
  })

  if (primaryCause) {
    blockers.push(
      `Framework principal non chargé : ${primaryCause.label} — ${primaryCause.detail}`,
    )
    if (consequences.length) {
      blockers.push(
        `Conséquences : ${consequences.map(item => item.label).join(', ')}. Corrigez ${primaryCause.label} en premier.`,
      )
    }
    // États durs sans cause commune (ex. redscript manquant + archivexl
    // manquant) : chacun reste listé — pas de cause commune à masquer.
    for (const diagnosis of diagnoses) {
      if (diagnosis === primaryCause || blocked.has(diagnosis.capability)) continue
      if (hardStates.includes(diagnosis.kind)) blockers.push(diagnosis.detail)
    }
  }

  return {
    ordered,
    primaryCause,
    consequences,
    blockers,
    warnings,
    valid: blockers.length === 0,
  }
}

/** Résumé compact pour la carte de diagnostic (ordre §37). */
export function frameworkHierarchySummary(validation: HierarchicalValidation): Array<{
  label: string
  kind: FrameworkDiagnosisKind
  blockedBy?: string
}> {
  return validation.ordered.map(diagnosis => ({
    label: diagnosis.label,
    kind: diagnosis.kind,
    blockedBy: diagnosis.blockedBy,
  }))
}
