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

  const coreAvailable = (relative: string) =>
    suppliedBy(enabled, relative) || Boolean(onDisk?.(relative))

  if (hasPlugin && !coreAvailable('red4ext/red4ext.dll')) {
    blockers.push(
      'RED4ext est requis par au moins un plugin sous red4ext/plugins/ mais son loader (red4ext/red4ext.dll) n’est pas dans le déploiement. Activez le mod du framework RED4ext ou désactivez les plugins concernés.',
    )
  }
  if (hasScripts && !coreAvailable('engine/tools/scc.exe')) {
    blockers.push(
      'redscript est requis par un ou plusieurs fichiers sous r6/scripts/ mais son compilateur (engine/tools/scc.exe) n’est pas dans le déploiement.',
    )
  }
  if (hasTweaks && !coreAvailable('red4ext/plugins/TweakXL')) {
    blockers.push(
      'TweakXL est requis par un ou plusieurs fichiers sous r6/tweaks/ mais n’est pas dans le déploiement.',
    )
  }
  if (hasXl && !coreAvailable('red4ext/plugins/ArchiveXL')) {
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
