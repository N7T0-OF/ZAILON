/**
 * Frosty Editor — Parser du catalogue Frostbite `.cat` (spec §16).
 *
 * Format vérifié contre la source auditée `FrostySdk/IO/CatReader.cs`
 * (docs/frosty-source-audit.md) — jamais deviné :
 *
 * - Magic : « NyanNyanNyanNyan » (16 octets) ;
 * - Ancien format (NFS 2015, NFS Rivals, Dragon Age Inquisition, BF4) :
 *   pas d'en-tête de compteurs ; chaque entrée = Sha1(20) + Offset(u32) +
 *   Size(u32) + ArchiveIndex(i32 & 0xFF) → 32 octets ;
 * - Format moderne : ResourceCount(u32) + PatchCount(u32) [+ EncryptedCount(u32)
 *   + 12 octets pour MEA/FIFA17/FIFA18, remis à 0 pour SWBF2/NFS Payback/Madden
 *   19/BF5/SWSquadrons] ; chaque entrée ajoute LogicalOffset(u32) → 36 octets ;
 * - Entrées chiffrées (EncryptedCount > 0) : 80 octets chacune.
 *
 * Le parseur auto-valide : les tailles d'en-tête × nombre d'entrées doivent
 * tenir dans le fichier, sinon rejet honnête.
 */

/** Magic exact du catalogue Frostbite. */
export const FROSTY_CAT_MAGIC = 'NyanNyanNyanNyan'

export interface FrostyCatEntry {
  /** SHA-1 de la ressource, hex minuscule (20 octets). */
  sha1: string
  offset: number
  size: number
  logicalOffset: number | null
  archiveIndex: number
  encrypted: boolean
}

export type FrostyCatParseResult =
  | { ok: true; format: 'legacy' | 'modern'; resourceCount: number; patchCount: number; encryptedCount: number; entries: FrostyCatEntry[] }
  | { ok: false; error: string }

const encoder = new TextEncoder()

/** Lit un u32 big-endian. */
function readU32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

/** SHA-1 hex (20 octets) depuis le buffer. */
function readSha1Hex(bytes: Uint8Array, offset: number): string {
  let hex = ''
  for (let i = 0; i < 20; i += 1) hex += bytes[offset + i].toString(16).padStart(2, '0')
  return hex
}

const MAGIC_BYTES = encoder.encode(FROSTY_CAT_MAGIC)

function hasMagic(bytes: Uint8Array): boolean {
  if (bytes.length < MAGIC_BYTES.length) return false
  for (let i = 0; i < MAGIC_BYTES.length; i += 1) {
    if (bytes[i] !== MAGIC_BYTES[i]) return false
  }
  return true
}

/** Parse les entrées au format legacy (32 octets, compteur dérivé de la longueur). */
function parseLegacyEntries(bytes: Uint8Array, offset: number): FrostyCatEntry[] {
  const entries: FrostyCatEntry[] = []
  const count = Math.floor((bytes.length - offset) / 32)
  for (let i = 0; i < count; i += 1) {
    const base = offset + i * 32
    entries.push({
      sha1: readSha1Hex(bytes, base),
      offset: readU32BE(bytes, base + 20),
      size: readU32BE(bytes, base + 24),
      logicalOffset: null,
      archiveIndex: (readU32BE(bytes, base + 28) & 0xff),
      encrypted: false,
    })
  }
  return entries
}

/** Parse les entrées au format moderne (36 octets + LogicalOffset). */
function parseModernEntries(bytes: Uint8Array, offset: number, resourceCount: number, encryptedCount: number): FrostyCatEntry[] {
  const entries: FrostyCatEntry[] = []
  const plainSize = 36
  const encryptedSize = 80
  for (let i = 0; i < resourceCount; i += 1) {
    const base = offset + i * plainSize
    if (base + plainSize > bytes.length) break
    entries.push({
      sha1: readSha1Hex(bytes, base),
      offset: readU32BE(bytes, base + 20),
      size: readU32BE(bytes, base + 24),
      logicalOffset: readU32BE(bytes, base + 28),
      archiveIndex: readU32BE(bytes, base + 32) & 0xff,
      encrypted: false,
    })
  }
  const afterPlain = offset + resourceCount * plainSize
  for (let i = 0; i < encryptedCount; i += 1) {
    const base = afterPlain + i * encryptedSize
    if (base + encryptedSize > bytes.length) break
    entries.push({
      sha1: readSha1Hex(bytes, base),
      offset: readU32BE(bytes, base + 20),
      size: readU32BE(bytes, base + 24),
      logicalOffset: readU32BE(bytes, base + 28),
      archiveIndex: readU32BE(bytes, base + 32) & 0xff,
      encrypted: true,
    })
  }
  return entries
}

/**
 * Parse un fichier `.cat`. Chaque variante d'en-tête est tentée et validée par
 * la longueur exacte attendue (entrées 36 octets + éventuelles entrées
 * chiffrées 80 octets + correctifs 60 octets) ; sinon le format legacy
 * (32 octets/entrée, compteur dérivé de la longueur) est essayé.
 */
export function parseFrostyCat(bytes: Uint8Array): FrostyCatParseResult {
  if (!hasMagic(bytes)) return { ok: false, error: 'Magic « NyanNyanNyanNyan » absent — fichier non Frostbite.' }
  if (bytes.length < 16) return { ok: false, error: 'Fichier trop court.' }

  const resourceCount = readU32BE(bytes, 16)
  const patchCount = readU32BE(bytes, 20)

  // Variante moderne sans EncryptedCount : entrées à 24.
  const modernAt = (headerSize: number, encryptedCount: number): FrostyCatParseResult | null => {
    const plainEnd = headerSize + resourceCount * 36
    const total = plainEnd + encryptedCount * 80 + patchCount * 60
    if (resourceCount >= 1_000_000 || total !== bytes.length) return null
    return {
      ok: true,
      format: 'modern',
      resourceCount,
      patchCount,
      encryptedCount,
      entries: parseModernEntries(bytes, headerSize, resourceCount, encryptedCount),
    }
  }
  const modern24 = modernAt(24, 0)
  if (modern24) return modern24
  // Variante moderne avec EncryptedCount (MEA/FIFA17/FIFA18…) : entrées à 40.
  const encryptedCount = readU32BE(bytes, 24)
  const modern40 = modernAt(40, encryptedCount)
  if (modern40) return modern40

  // Format legacy : compteur dérivé de la longueur, entrées de 32 octets.
  const legacyCount = Math.floor((bytes.length - 16) / 32)
  if (legacyCount > 0 && 16 + legacyCount * 32 === bytes.length) {
    return {
      ok: true,
      format: 'legacy',
      resourceCount: legacyCount,
      patchCount: 0,
      encryptedCount: 0,
      entries: parseLegacyEntries(bytes, 16),
    }
  }

  return { ok: false, error: 'Aucun format de catalogue reconnu (entrées illisibles).' }
}

/** Ressources → assets d'index (spec §16) : chaque ressource = un chunk réel. */
export function catEntriesToAssets(catName: string, entries: FrostyCatEntry[]): Array<{
  id: string
  name: string
  path: string
  type: 'chunk'
  resourceType: string
  size: number
  bundle: string
}> {
  return entries.map(entry => ({
    id: `cat:${entry.sha1}`,
    name: `${catName}/${entry.sha1.slice(0, 12)}`,
    path: `${catName}/${entry.sha1.slice(0, 12)}`,
    type: 'chunk' as const,
    resourceType: `Cas#${entry.archiveIndex}${entry.encrypted ? ' · chiffré' : ''}`,
    size: entry.size,
    bundle: catName.replace(/\.(bin|cat)$/i, ''),
  }))
}

/** Résumé d'un catalogue pour l'UI. */
export function catSummary(entries: FrostyCatEntry[]): { count: number; bytes: number; archives: number } {
  let bytes = 0
  const archives = new Set<number>()
  for (const entry of entries) {
    bytes += entry.size
    archives.add(entry.archiveIndex)
  }
  return { count: entries.length, bytes, archives: archives.size }
}
