/**
 * Frosty Editor — Bulk Export (spec §44-45, §46).
 *
 * API `BulkExportService` : sélection par types, dossier de sortie,
 * progression en arrière-plan, jamais bloquant. La sélection multiple
 * (Asset Browser, §46) alimente le même pipeline.
 *
 * Pur (aucun fs). L'écriture réelle est déléguée au Worker/runtime Frosty ;
 * ce module fournit le plan, la validation et la progression.
 */

import type { FrostyAsset, FrostyAssetType } from './frostyAssets.ts'

export interface BulkExportPlan {
  id: string
  assets: FrostyAsset[]
  /** Types retenus (coches §45). */
  types: FrostyAssetType[]
  outputFolder: string
  /** Par type d'asset, export autorisé par le backend (sinon retiré du plan). */
  supportedByBackend: Record<FrostyAssetType, boolean>
}

export type BulkExportStage = 'queued' | 'exporting' | 'checksum' | 'done' | 'failed'

export interface BulkExportRun {
  id: string
  stage: BulkExportStage
  progress: number
  current: string
  exported: number
  failed: number
  total: number
  outputFolder: string
  error?: string
}

/** Types d'export réellement supportés par les plugins Frosty (audit §44). */
export const BULK_EXPORT_CAPABLE_TYPES: FrostyAssetType[] = ['texture', 'mesh', 'audio']

/** Construit le plan d'export en filtrant les types non supportés par le backend. */
export function planBulkExport(input: {
  assets: FrostyAsset[]
  types: FrostyAssetType[]
  outputFolder: string
}): BulkExportPlan {
  const supportedByBackend: Record<FrostyAssetType, boolean> = {
    ebx: false,
    res: false,
    chunk: false,
    texture: true,
    mesh: true,
    audio: true,
  }
  const wanted = new Set(input.types)
  const assets = input.assets.filter(asset => wanted.has(asset.type) && supportedByBackend[asset.type])
  return {
    id: `bulk_${Date.now().toString(36)}`,
    assets,
    types: input.types.filter(type => supportedByBackend[type]),
    outputFolder: input.outputFolder,
    supportedByBackend,
  }
}

/** Nom de fichier de sortie pour un asset (dossier de sortie + type + nom). */
export function bulkExportFileName(asset: FrostyAsset): string {
  const base = asset.name.split('/').pop() ?? asset.id
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_')
  const ext = asset.type === 'texture' ? 'dds' : asset.type === 'audio' ? 'ea3' : 'mesh'
  return `${safe}.${ext}`
}

/** Démarre une exécution d'export (progression 0). */
export function startBulkExport(plan: BulkExportPlan): BulkExportRun {
  return {
    id: plan.id,
    stage: 'exporting',
    progress: 0,
    current: '',
    exported: 0,
    failed: 0,
    total: plan.assets.length,
    outputFolder: plan.outputFolder,
  }
}

/** Avance d'un asset exporté (progression = exported/total). */
export function advanceBulkExport(run: BulkExportRun, assetName: string, ok: boolean): BulkExportRun {
  const exported = run.exported + (ok ? 1 : 0)
  const failed = run.failed + (ok ? 0 : 1)
  const done = exported + failed >= run.total
  return {
    ...run,
    stage: done ? 'checksum' : 'exporting',
    progress: run.total === 0 ? 1 : (exported + failed) / run.total,
    current: assetName,
    exported,
    failed,
  }
}

/** Termine l'exécution (checksum des fichiers écrits côté Worker). */
export function finishBulkExport(run: BulkExportRun, error?: string): BulkExportRun {
  return {
    ...run,
    stage: error ? 'failed' : 'done',
    progress: error ? run.progress : 1,
    error,
    current: '',
  }
}

/** Résumé final pour l'UI (§45). */
export function bulkExportSummary(run: BulkExportRun): string {
  if (run.stage === 'failed') return `Échec : ${run.error ?? 'inconnu'}`
  return `${run.exported}/${run.total} exporté(s)${run.failed ? ` · ${run.failed} en échec` : ''} → ${run.outputFolder}`
}
