/**
 * Éditeur sécurisé de `CitizenFX.ini` (FiveM) — spec « Support FiveM avancé »
 * §6, §8-9, §20.
 *
 * Règles absolues :
 * - jamais de réécriture complète du fichier : modification INI ciblée ;
 * - lecture → parse → modification de la SEULE section `[Addons]` → écriture ;
 * - conservation des autres sections, clés, commentaires et de leur ordre ;
 * - aucune suppression de ligne tierce, aucun doublon de `ReShade5` ;
 * - le chemin GTA V (`[Game] IVPath`) n'est jamais modifié, seulement lu.
 *
 * Logique pure et testable (aucun accès disque) — le fichier réel est lu/écrit
 * par le backend natif ; cette lib ne reçoit que du texte.
 */

/** Entrée structurée minimale : le texte + les clés utiles. */
export interface CitizenFxState {
  /** Chemin GTA V déclaré dans `[Game] IVPath=...` (jamais modifié). */
  gamePath?: string
  /** Canal de mise à jour `[Game] UpdateChannel` (lecture seule). */
  updateChannel?: string
  /** Numéro de build sauvegardé `[Game] SavedBuildNumber` (lecture seule). */
  savedBuildNumber?: string
  /** Identifiant ReShade 5 déjà déclaré dans `[Addons] ReShade5=...`. */
  reshade5Id?: string
  /** Texte original (pour comparer avant/après). */
  raw: string
}

const RESHADE5_PREFIX = 'acknowledged that ReShade 5.x has a bug that will lead to game crashes'
export const RESHADE5_KEY = 'ReShade5'

/** Normalise une clé INI pour une comparaison insensible à la casse/espaces. */
function normalizeKey(key: string): string {
  return key.trim().toLowerCase()
}

/** Vrai si la ligne est un en-tête de section `[Nom]`. */
function isSectionHeader(line: string): boolean {
  return /^\s*\[[^\]]+\]\s*$/.test(line)
}

/** Nom de section d'une ligne d'en-tête (sans crochets, sans espaces). */
function sectionName(line: string): string {
  return line.trim().replace(/^\[/, '').replace(/\]\s*$/, '').trim()
}

/** Index de l'en-tête de section (insensible à la casse) ou -1. */
function findSection(lines: string[], name: string): number {
  const wanted = normalizeKey(name)
  for (let index = 0; index < lines.length; index += 1) {
    if (isSectionHeader(lines[index]) && normalizeKey(sectionName(lines[index])) === wanted) return index
  }
  return -1
}

/** Index de fin (exclusif) de la section commençant à `startIndex`. */
function sectionEnd(lines: string[], startIndex: number): number {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (isSectionHeader(lines[index])) return index
  }
  return lines.length
}

/** Renvoie `{ key, value, line }` si la ligne est `clé=valeur`, sinon null. */
function parseKeyValue(line: string): { key: string; value: string } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#') || isSectionHeader(trimmed)) return null
  const eq = trimmed.indexOf('=')
  if (eq <= 0) return null
  return { key: trimmed.slice(0, eq), value: trimmed.slice(eq + 1) }
}

/** Lit une clé dans une section donnée (première occurrence, insensible à la casse). */
function readSectionKey(lines: string[], section: string, key: string): string | undefined {
  const start = findSection(lines, section)
  if (start < 0) return undefined
  const end = sectionEnd(lines, start)
  for (let index = start + 1; index < end; index += 1) {
    const parsed = parseKeyValue(lines[index])
    if (parsed && normalizeKey(parsed.key) === normalizeKey(key)) return parsed.value.trim()
  }
  return undefined
}

/** Extrait l'ID d'une valeur `ID:xxxx acknowledged...` (ou simple `ID:xxxx`). */
export function extractReShade5Id(value: string): string | undefined {
  const match = value.trim().match(/^ID[:=]\s*([A-Za-z0-9_-]+)/i)
  return match ? match[1] : undefined
}

/** Analyse un texte CitizenFX.ini sans jamais le modifier. */
export function parseCitizenFx(text: string): CitizenFxState {
  const lines = text.split(/\r?\n/)
  const reshadeRaw = readSectionKey(lines, 'Addons', RESHADE5_KEY)
  return {
    gamePath: readSectionKey(lines, 'Game', 'IVPath'),
    updateChannel: readSectionKey(lines, 'Game', 'UpdateChannel'),
    savedBuildNumber: readSectionKey(lines, 'Game', 'SavedBuildNumber'),
    reshade5Id: reshadeRaw ? extractReShade5Id(reshadeRaw) : undefined,
    raw: text,
  }
}

/** Vrai si une clé `ReShade5` existe déjà dans `[Addons]`. */
export function hasReShade5Id(text: string): boolean {
  return readSectionKey(text.split(/\r?\n/), 'Addons', RESHADE5_KEY) !== undefined
}

/**
 * Ajoute ou met à jour UNIQUEMENT la ligne `ReShade5=ID:<id> acknowledged…`
 * dans `[Addons]`, en préservant tout le reste (sections, clés, commentaires,
 * ordre). Si `[Addons]` n'existe pas, la section est créée en fin de fichier.
 * Jamais de doublon : une ligne existante est remplacée sur place.
 */
export function setReShade5Id(text: string, id: string): string {
  const cleanId = id.trim()
  if (!cleanId) return text
  const lines = text.split(/\r?\n/)
  const newLine = `${RESHADE5_KEY}=ID:${cleanId} ${RESHADE5_PREFIX}`
  const start = findSection(lines, 'Addons')

  if (start < 0) {
    // Crée la section [Addons] en fin de fichier, avec une ligne vide de
    // séparation si le fichier n'est pas vide.
    const hasTrailingBlank = lines.length > 0 && lines[lines.length - 1].trim() === ''
    const out = [...lines]
    if (out.length > 0 && !hasTrailingBlank) out.push('')
    out.push('[Addons]')
    out.push(newLine)
    return out.join('\n')
  }

  const end = sectionEnd(lines, start)
  // Remplace une ligne ReShade5 existante, sinon insère après le dernier
  // contenu de la section (juste avant la section suivante).
  for (let index = start + 1; index < end; index += 1) {
    const parsed = parseKeyValue(lines[index])
    if (parsed && normalizeKey(parsed.key) === normalizeKey(RESHADE5_KEY)) {
      lines[index] = newLine
      return lines.join('\n')
    }
  }
  const insertAt = end
  lines.splice(insertAt, 0, newLine)
  return lines.join('\n')
}

/**
 * Retire UNIQUEMENT la ligne `ReShade5` (celle gérée par ZAILON) de
 * `[Addons]`. Les autres clés et commentaires de la section sont conservés.
 */
export function removeReShade5Id(text: string): string {
  const lines = text.split(/\r?\n/)
  const start = findSection(lines, 'Addons')
  if (start < 0) return text
  const end = sectionEnd(lines, start)
  for (let index = start + 1; index < end; index += 1) {
    const parsed = parseKeyValue(lines[index])
    if (parsed && normalizeKey(parsed.key) === normalizeKey(RESHADE5_KEY)) {
      lines.splice(index, 1)
      return lines.join('\n')
    }
  }
  return text
}
