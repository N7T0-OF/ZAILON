/**
 * Frosty Editor — Édition EBX (spec §19-22).
 *
 * Représentation moderne d'un asset EBX : arbre de propriétés
 * (Property / Value / Type), validation par type, diff Original/Modified,
 * revert par propriété ou par asset, et gestion PointerRef (§20).
 *
 * Pur (aucun DOM/fs). Les valeurs sont des primitives JSON plus des
 * références typées (TypeRef, ResourceRef, FileRef, PointerRef).
 */

/** Types de propriété EBX supportés (spec §19). */
export type EbxValueType =
  | 'bool'
  | 'int8' | 'int16' | 'int32' | 'int64'
  | 'uint8' | 'uint16' | 'uint32' | 'uint64'
  | 'float32' | 'float64'
  | 'cstring' | 'string'
  | 'enum'
  | 'struct'
  | 'array'
  | 'typeref' | 'resourceref' | 'fileref' | 'pointerref'

/** Valeur EBX sérialisable. */
export type EbxValue =
  | boolean | number | string
  | EbxStruct | EbxValue[]
  | EbxReference

export interface EbxReference {
  kind: 'typeref' | 'resourceref' | 'fileref' | 'pointerref'
  /** ID d'asset cible (PointerRef/ResourceRef) ou type (TypeRef). */
  target?: string
  /** Type de l'asset cible (ex. TextureAsset) — PointerRef filtrable (§20). */
  targetType?: string
  /** Nom lisible de la cible. */
  targetName?: string
}

export interface EbxStruct {
  [field: string]: EbxValue
}

export interface EbxProperty {
  /** Chemin pointé dans l'arbre (ex. "vehicle/0/physics.mass"). */
  path: string
  label: string
  type: EbxValueType
  /** Valeur actuelle (édition). */
  value: EbxValue
  /** Valeur d'origine (pour le diff, §22). */
  original: EbxValue
  /** Range/contraintes quand disponibles (validation §21). */
  min?: number
  max?: number
  enumValues?: string[]
}

export interface EbxAsset {
  id: string
  name: string
  resourceType: string
  properties: EbxProperty[]
}

// ─────────────────────────────── Validation ────────────────────────────

export type EbxValidationIssue = { path: string; message: string }

/** Valide une valeur contre son type (spec §21) — ne jamais accepter une valeur impossible. */
export function validateEbxValue(property: EbxProperty): EbxValidationIssue[] {
  const issues: EbxValidationIssue[] = []
  const { type, path } = property
  const value = property.value

  if (type === 'bool') {
    if (typeof value !== 'boolean') issues.push({ path, message: 'Attendu : booléen.' })
    return issues
  }

  if (type.startsWith('int') || type.startsWith('uint') || type === 'float32' || type === 'float64') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({ path, message: 'Attendu : nombre.' })
      return issues
    }
    if (type.startsWith('uint') && value < 0) issues.push({ path, message: 'Valeur négative pour un entier non signé.' })
    const bits = Number(type.replace(/\D/g, '')) || 0
    if (type.startsWith('int') && bits > 0) {
      const max = 2 ** (bits - 1) - 1
      const min = -(2 ** (bits - 1))
      if (!Number.isInteger(value)) issues.push({ path, message: `Attendu : entier ${type}.` })
      if (value < min || value > max) issues.push({ path, message: `Hors bornes ${type} : [${min}, ${max}].` })
    }
    if (type.startsWith('uint') && bits > 0) {
      const max = 2 ** bits - 1
      if (!Number.isInteger(value)) issues.push({ path, message: `Attendu : entier ${type}.` })
      if (value > max) issues.push({ path, message: `Hors bornes ${type} : [0, ${max}].` })
    }
    if (type === 'float32') {
      // NaN/Infini sont déjà rejetés ; on note les extrêmes float32.
      if (Math.abs(value) > 3.4028235e38) issues.push({ path, message: 'Hors bornes float32.' })
    }
    if (typeof property.min === 'number' && value < property.min) issues.push({ path, message: `Sous le minimum (${property.min}).` })
    if (typeof property.max === 'number' && value > property.max) issues.push({ path, message: `Au-dessus du maximum (${property.max}).` })
    return issues
  }

  if (type === 'cstring' || type === 'string') {
    if (typeof value !== 'string') issues.push({ path, message: 'Attendu : texte.' })
    return issues
  }

  if (type === 'enum') {
    if (typeof value !== 'string') {
      issues.push({ path, message: 'Attendu : valeur d\'énumération.' })
    } else if (property.enumValues && !property.enumValues.includes(value)) {
      issues.push({ path, message: `Valeur hors énumération : ${property.enumValues.join(', ')}.` })
    }
    return issues
  }

  if (type === 'struct') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) issues.push({ path, message: 'Attendu : structure.' })
    return issues
  }

  if (type === 'array') {
    if (!Array.isArray(value)) issues.push({ path, message: 'Attendu : tableau.' })
    return issues
  }

  // Références.
  const ref = value as EbxReference
  if (typeof ref !== 'object' || ref === null || typeof ref.kind !== 'string') {
    issues.push({ path, message: 'Attendu : référence.' })
    return issues
  }
  if (ref.kind !== type) issues.push({ path, message: `Référence ${ref.kind} incompatible avec ${type}.` })
  if ((ref.kind === 'pointerref' || ref.kind === 'resourceref') && !ref.target) {
    issues.push({ path, message: 'Référence sans cible.' })
  }
  return issues
}

/** Valide toutes les propriétés d'un asset. */
export function validateEbxAsset(asset: EbxAsset): EbxValidationIssue[] {
  return asset.properties.flatMap(validateEbxValue)
}

// ─────────────────────────────── Édition ───────────────────────────────

/** Met à jour la valeur d'une propriété (par path) et revalide. */
export function setEbxProperty(asset: EbxAsset, path: string, value: EbxValue): { asset: EbxAsset; issues: EbxValidationIssue[] } {
  const properties = asset.properties.map(property =>
    property.path === path ? { ...property, value } : property)
  const next: EbxAsset = { ...asset, properties }
  return { asset: next, issues: validateEbxAsset(next) }
}

/** Revert d'une propriété vers sa valeur d'origine (spec §22). */
export function revertEbxProperty(asset: EbxAsset, path: string): EbxAsset {
  return {
    ...asset,
    properties: asset.properties.map(property =>
      property.path === path ? { ...property, value: property.original } : property),
  }
}

/** Revert de tout l'asset (spec §22). */
export function revertEbxAsset(asset: EbxAsset): EbxAsset {
  return {
    ...asset,
    properties: asset.properties.map(property => ({ ...property, value: property.original })),
  }
}

// ─────────────────────────────── Diff ──────────────────────────────────

export interface EbxDiffEntry {
  path: string
  label: string
  type: EbxValueType
  original: EbxValue
  modified: EbxValue
}

function valuesEqual(a: EbxValue, b: EbxValue): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

/** Diff Original | Modified : uniquement les propriétés changées (spec §22). */
export function diffEbxAsset(asset: EbxAsset): EbxDiffEntry[] {
  return asset.properties
    .filter(property => !valuesEqual(property.value, property.original))
    .map(property => ({
      path: property.path,
      label: property.label,
      type: property.type,
      original: property.original,
      modified: property.value,
    }))
}

/** Nombre de propriétés modifiées (badge de tab, §70). */
export function modifiedCount(asset: EbxAsset): number {
  return diffEbxAsset(asset).length
}

// ─────────────────────────────── PointerRef (spec §20) ─────────────────

export interface PointerRefAction {
  searchReferenced: string
  goTo: string
  copyReference: string
  openInNewPanel: string
}

/** Actions PointerRef — recherche, aller à, copier, ouvrir dans un nouveau panneau. */
export function pointerRefActions(reference: EbxReference, assetName: string): PointerRefAction | null {
  if (reference.kind !== 'pointerref' || !reference.target) return null
  const id = reference.target
  return {
    searchReferenced: id,
    goTo: id,
    copyReference: `${assetName} → ${id}`,
    openInNewPanel: id,
  }
}

/** Filtre les références pointerref d'un asset (filtrage PointerRef, §20). */
export function pointerRefsOf(asset: EbxAsset): EbxProperty[] {
  return asset.properties.filter(property => property.type === 'pointerref')
}

/** Recherche d'assets référencés (impact analysis, spec §100). */
export function assetReferences(asset: EbxAsset, allAssets: Array<{ id: string; name: string }>): Array<{ id: string; name: string }> {
  const targets = new Set<string>()
  for (const property of asset.properties) {
    const ref = property.value as EbxReference | undefined
    if (ref && typeof ref === 'object' && ref.target) targets.add(ref.target)
  }
  return allAssets.filter(asset => targets.has(asset.id))
}

/** Impact analysis : « cet asset est référencé par N autres assets » (§100). */
export function referencingAssets(assetId: string, assets: Array<{ id: string; name: string; properties: EbxProperty[] }>): Array<{ id: string; name: string }> {
  return assets.filter(item => item.id !== assetId && item.properties.some(property => {
    const ref = property.value as EbxReference | undefined
    return ref && typeof ref === 'object' && ref.target === assetId
  }))
}
