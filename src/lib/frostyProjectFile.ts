/**
 * Frosty Editor — Format projet `.zailon-frosty-project` (spec §108, §107, §109).
 *
 * Export/import des SOURCES d'édition d'un projet (assets modifiés, notes,
 * favoris, autosaves, métadonnées) — jamais de caches ni de builds (§109).
 * Un projet partagé ≠ profil partagé : le profil partage le .fbmod final,
 * le projet partage les sources d'édition (§107).
 *
 * Réutilise le writer ZIP pur (`addonZip`) → sortie déterministe, vérifiable.
 * Pur (aucun fs) : l'import « coller un manifest » suit le même modèle que
 * l'import d'add-ons communautaires.
 */

import { buildZip, crc32, type AddonZipEntry } from './addonZip.ts'
import type { FrostyProject } from './frostyEditor.ts'

/** Contenu versionné du manifest projet (spec §108). */
export interface FrostyProjectManifest {
  schema: 1
  kind: 'zailon-frosty-project'
  id: string
  name: string
  gameId: string
  gameName: string
  gameVersion?: string
  frostyRuntimeVersion: string
  createdAt: number
  updatedAt: number
  modifiedAssets: string[]
  addedAssets: string[]
  removedAssets: string[]
  assetNotes: Record<string, string>
  favorites: string[]
  bookmarks: string[]
  autosaves: Array<{ at: number; label: string; assetCount: number }>
  buildCount: number
  lastBuild?: string
}

export function frostyProjectManifest(project: FrostyProject): FrostyProjectManifest {
  const lastBuild = project.buildHistory[project.buildHistory.length - 1]
  return {
    schema: 1,
    kind: 'zailon-frosty-project',
    id: project.id,
    name: project.name,
    gameId: project.gameId,
    gameName: project.gameName,
    gameVersion: project.gameVersion,
    frostyRuntimeVersion: project.frostyRuntimeVersion,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    modifiedAssets: project.modifiedAssets,
    addedAssets: project.addedAssets,
    removedAssets: project.removedAssets,
    assetNotes: project.assetNotes,
    favorites: project.favorites,
    bookmarks: project.bookmarks,
    autosaves: project.autosaves,
    buildCount: project.buildHistory.length,
    lastBuild: lastBuild ? `Build ${lastBuild.buildNumber} · v${lastBuild.version}` : undefined,
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Construit l'archive `.zailon-frosty-project` : project.json + assets.json +
 * checksum (CRC-32 des données) — entrées triées, déterministe.
 */
export function buildFrostyProjectArchive(project: FrostyProject): Uint8Array {
  const manifest = frostyProjectManifest(project)
  const projectBytes = encoder.encode(JSON.stringify(manifest, null, 2))
  const assetsBytes = encoder.encode(JSON.stringify({
    modifiedAssets: project.modifiedAssets,
    addedAssets: project.addedAssets,
    removedAssets: project.removedAssets,
    assetNotes: project.assetNotes,
    favorites: project.favorites,
    bookmarks: project.bookmarks,
  }, null, 2))
  const checksumBytes = encoder.encode(JSON.stringify({ crc32Project: crc32(projectBytes), crc32Assets: crc32(assetsBytes) }))

  const entries: AddonZipEntry[] = [
    { name: 'project.json', data: projectBytes },
    { name: 'assets.json', data: assetsBytes },
    { name: 'checksum.json', data: checksumBytes },
    { name: 'README.txt', data: encoder.encode('ZAILON Frosty Project — sources d\'édition (jamais de caches ni de builds).\nRéimportable via Création Frosty → Importer un projet.') },
  ]
  return buildZip(entries)
}

/**
 * Valide un manifest de projet importé (spec §108, §63 : conversion
 * non destructive — l'original reste inchangé). Retourne les champs utiles
 * pour recréer une copie ZAILON.
 */
export function parseFrostyProjectExport(json: string): { ok: true; manifest: FrostyProjectManifest } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'JSON invalide.' }
  }
  const manifest = parsed as Partial<FrostyProjectManifest>
  if (manifest.schema !== 1 || manifest.kind !== 'zailon-frosty-project') {
    return { ok: false, error: 'Ce fichier n\'est pas un projet ZAILON Frosty (schema/kind invalide).' }
  }
  if (!manifest.id || typeof manifest.id !== 'string') return { ok: false, error: 'ID de projet manquant.' }
  if (!manifest.name || typeof manifest.name !== 'string') return { ok: false, error: 'Nom de projet manquant.' }
  if (!manifest.gameName || typeof manifest.gameName !== 'string') return { ok: false, error: 'Jeu manquant.' }
  if (typeof manifest.frostyRuntimeVersion !== 'string') return { ok: false, error: 'Version du runtime manquante.' }
  const full: FrostyProjectManifest = {
    schema: 1,
    kind: 'zailon-frosty-project',
    id: manifest.id,
    name: manifest.name,
    gameId: manifest.gameId ?? 'unknown',
    gameName: manifest.gameName,
    gameVersion: manifest.gameVersion,
    frostyRuntimeVersion: manifest.frostyRuntimeVersion,
    createdAt: manifest.createdAt ?? Date.now(),
    updatedAt: manifest.updatedAt ?? Date.now(),
    modifiedAssets: Array.isArray(manifest.modifiedAssets) ? manifest.modifiedAssets : [],
    addedAssets: Array.isArray(manifest.addedAssets) ? manifest.addedAssets : [],
    removedAssets: Array.isArray(manifest.removedAssets) ? manifest.removedAssets : [],
    assetNotes: manifest.assetNotes && typeof manifest.assetNotes === 'object' ? manifest.assetNotes : {},
    favorites: Array.isArray(manifest.favorites) ? manifest.favorites : [],
    bookmarks: Array.isArray(manifest.bookmarks) ? manifest.bookmarks : [],
    autosaves: Array.isArray(manifest.autosaves) ? manifest.autosaves : [],
    buildCount: manifest.buildCount ?? 0,
    lastBuild: manifest.lastBuild,
  }
  return { ok: true, manifest: full }
}

/** Manifest sérialisé pour l'affichage « Aperçu avant import ». */
export function frostyProjectArchiveText(project: FrostyProject): string {
  return JSON.stringify(frostyProjectManifest(project), null, 2)
}

/** Taille estimée de l'archive exportée (affichage). */
export function estimateFrostyProjectExportBytes(project: FrostyProject): number {
  const text = frostyProjectArchiveText(project)
  return encoder.encode(text).length + 1_024 // + README + en-têtes ZIP
}

/** Décodage utilitaire (extraction des entrées par un futur import natif). */
export function decodeText(bytes: Uint8Array): string {
  return decoder.decode(bytes)
}
