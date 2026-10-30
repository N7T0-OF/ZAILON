/**
 * Test d'addon (spec « Refonte — système addons » §15) : « Tester mon addon »
 * valide manifest → structure → fichiers → compatibilité → installation →
 * désinstallation → rollback, et conclut « Addon prêt à être partagé ».
 *
 * Cette lib est pure (aucun import natif) : le verdict est calculé à partir
 * du résultat de l'analyse native et du test bac à sable, testable partout.
 * Un addon n'est JAMAIS « prêt » tant qu'un contrôle échoue — et un addon
 * dangereux (Zip Slip, archive imbriquée) n'est jamais installé.
 */

export interface AddonTestReportLike {
  installOk: boolean
  installedCount: number
  expectedCount: number
  manifestInstalled: boolean
  uninstallOk: boolean
  residueFree: boolean
  issues: string[]
}

export interface AddonTestVerdictInput {
  /** Manifest généré par le créateur, validé par `validateAddonManifest`. */
  manifestOk: boolean
  /** Problèmes de structure signalés par l'analyse (Zip Slip, archives…). */
  analysisIssues: string[]
  /** Nombre de fichiers détectés par l'analyse de la source. */
  entryCount: number
  /** Compatibilité déclarée vs installation actuelle (`checkAddonCompatibility`). */
  compatOk: boolean
  compatReasons: string[]
  /** Résultat du test natif en bac à sable (installation temporaire). */
  report: AddonTestReportLike
}

export interface AddonTestCheck {
  id: 'manifest' | 'structure' | 'files' | 'compatibility' | 'install' | 'uninstall' | 'rollback'
  label: string
  ok: boolean
  /** Raison d'échec (première), affichée dans le rapport — jamais masquée. */
  detail?: string
}

export interface AddonTestVerdict {
  checks: AddonTestCheck[]
  ready: boolean
  failed: string[]
  summary: string
}

/** Construit le verdict « prêt à être partagé » (spec §15), pur et testé. */
export function addonTestVerdict(input: AddonTestVerdictInput): AddonTestVerdict {
  const countsMatch =
    input.report.expectedCount > 0 &&
    input.report.installedCount === input.report.expectedCount
  const checks: AddonTestCheck[] = [
    {
      id: 'manifest',
      label: 'Manifest',
      ok: input.manifestOk,
      detail: input.manifestOk ? undefined : 'manifest.json invalide ou formulaire incomplet.',
    },
    {
      id: 'structure',
      label: 'Structure',
      ok: input.analysisIssues.length === 0,
      detail: input.analysisIssues[0],
    },
    {
      id: 'files',
      label: 'Fichiers',
      ok: input.entryCount > 0 && countsMatch && input.report.manifestInstalled,
      detail: input.entryCount === 0
        ? 'Aucun fichier dans le dossier source.'
        : !countsMatch
          ? `Fichiers installés (${input.report.installedCount}) ≠ fichiers analysés (${input.report.expectedCount}).`
          : !input.report.manifestInstalled
            ? 'manifest.json absent après installation.'
            : undefined,
    },
    {
      id: 'compatibility',
      label: 'Compatibilité',
      ok: input.compatOk,
      detail: input.compatReasons[0],
    },
    { id: 'install', label: 'Installation (bac à sable)', ok: input.report.installOk },
    { id: 'uninstall', label: 'Désinstallation', ok: input.report.uninstallOk },
    { id: 'rollback', label: 'Rollback / propreté', ok: input.report.residueFree },
  ]

  const failed = [...input.analysisIssues, ...input.report.issues, ...input.compatReasons]
    .filter((value, index, all) => value.trim() && all.indexOf(value) === index)

  const ready = checks.every(check => check.ok)
  const summary = ready
    ? 'Addon prêt à être partagé.'
    : `${checks.filter(check => !check.ok).length} contrôle(s) à corriger avant de partager.`

  return { checks, ready, failed, summary }
}
