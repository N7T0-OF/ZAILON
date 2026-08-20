import type { FiveMModEntry } from './native'

/**
 * FiveM Profiles (spec §2, §12) — logique PURE sur le contenu réel de
 * `FiveM.app/mods`. FiveM n'a pas de mods « activables » : ZAILON liste le
 * dossier tel quel et ne détecte que les ajouts/retraits/modifications, sans
 * jamais réinventer un système virtuel d'activation.
 */

export type FiveMModChange = 'added' | 'removed' | 'modified' | 'unchanged'

export interface FiveMModDiff {
  /** Changement par clé (`kind:relativePath`). */
  changes: Record<string, FiveMModChange>
  added: string[]
  removed: string[]
  modified: string[]
}

/** Clé stable d'une entrée (type + chemin relatif). */
export function fiveMModKey(entry: FiveMModEntry): string {
  return `${entry.kind}:${entry.relativePath}`
}

/**
 * Diff entre deux listings (précédent vs courant) — détecte ajout, retrait et
 * modification (taille ou date de modification différente) sans rescanner le
 * contenu : le `fingerprint` natif permet de sauter le listing tant que rien
 * n'a changé, et ce diff ne tourne que lorsque le listing est déjà en main.
 */
export function diffFiveMMods(previous: FiveMModEntry[], current: FiveMModEntry[]): FiveMModDiff {
  const before = new Map(previous.map(entry => [fiveMModKey(entry), entry]))
  const after = new Map(current.map(entry => [fiveMModKey(entry), entry]))
  const added: string[] = []
  const removed: string[] = []
  const modified: string[] = []
  const changes: Record<string, FiveMModChange> = {}

  for (const [key, entry] of after) {
    const prior = before.get(key)
    if (!prior) {
      added.push(key)
      changes[key] = 'added'
    } else if (prior.sizeBytes !== entry.sizeBytes || prior.modifiedAt !== entry.modifiedAt) {
      modified.push(key)
      changes[key] = 'modified'
    } else {
      changes[key] = 'unchanged'
    }
  }
  for (const key of before.keys()) {
    if (!after.has(key)) {
      removed.push(key)
      changes[key] = 'removed'
    }
  }
  return { changes, added, removed, modified }
}

/** Taille lisible en unités françaises (ex. « 428 Mo », « 2,4 Go »). */
export function formatFiveMSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = Math.round(value * 10) / 10
  const number = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
  return `${number} ${units[unit]}`
}

/** Libellé d'une entrée pour l'UI (nom + nature). */
export function fiveMModLabel(entry: FiveMModEntry): string {
  if (entry.kind === 'folder') {
    return entry.fileCount === 1 ? `${entry.name}/ · 1 fichier` : `${entry.name}/ · ${entry.fileCount} fichiers`
  }
  return entry.name
}
