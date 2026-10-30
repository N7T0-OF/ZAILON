// ─────────────────────────────────────────────────────────────────────────────
// addonZip.ts — Empaquetage `.zailon-addon` (spec §55-56)
//
// Writer ZIP minimal, sans dépendance : entrées « store » (sans compression),
// ordre trié, horodatage figé → sortie déterministe (même fichier pour les
// mêmes entrées), ce qui rend le SHA-256 et la signature stables et
// vérifiables (§14). Le format produit est un ZIP standard lisible par le
// pipeline natif (crate `zip`) et par n'importe quel décompresseur.
//
// Ce module est volontairement pur (aucun fs, aucun Buffer) : il reste
// importable dans le navigateur. Le CLI `addon-cli.ts` fournit la couche
// fichiers et la validation du manifest.
// ─────────────────────────────────────────────────────────────────────────────

export interface AddonZipEntry {
  /** Chemin relatif dans l'archive (séparateur `/`). */
  name: string
  data: Uint8Array
}

export interface PackAddonResult {
  /** Octets de l'archive (indéfini en dry-run). */
  bytes?: Uint8Array
  /** Nombre d'entrées embarquées. */
  entryCount: number
  /** Taille totale des données embarquées, en octets. */
  totalBytes: number
  /** ID déclaré par le manifest (validé). */
  addonId: string
  version: string
  name: string
}

// Table CRC-32 (IEEE 802.3), générée au chargement.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 d'un tampon. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const TEXT_ENCODER = new TextEncoder()

/**
 * Horodatage DOS figé (1980-01-01 00:00) → sortie déterministe.
 * Les appelants lisent : heure = valeur >>> 16, date = valeur & 0xffff.
 * Date 0x0021 = année 1980, mois 1, jour 1 ; heure 0.
 */
function dosDateTime(): number {
  return 0x0021
}

interface ZipEntry {
  name: string
  nameBytes: Uint8Array
  data: Uint8Array
  crc: number
}

function writeView(target: Uint8Array, view: DataView): void {
  target.set(new Uint8Array(view.buffer))
}

/**
 * Construit un ZIP « store » standard à partir d'entrées.
 * Format : en-têtes locaux + données, puis répertoire central, puis EOCD.
 * Les entrées sont triées par nom ; les champs temporels sont figés, donc
 * deux appels avec les mêmes entrées produisent exactement les mêmes octets.
 */
export function buildZip(entries: AddonZipEntry[]): Uint8Array {
  const sorted = [...entries]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map<ZipEntry>(entry => ({
      name: entry.name,
      nameBytes: TEXT_ENCODER.encode(entry.name),
      data: entry.data,
      crc: crc32(entry.data),
    }))

  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  const offsets: number[] = []
  let offset = 0

  for (const entry of sorted) {
    const nameLen = entry.nameBytes.length
    const dataLen = entry.data.length
    const time = dosDateTime()

    // En-tête local (30 octets + nom).
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true) // signature
    local.setUint16(4, 20, true) // version requise (2.0)
    local.setUint16(6, 0x0800, true) // drapeaux : UTF-8 (bit 11)
    local.setUint16(8, 0, true) // méthode : store
    local.setUint16(10, time >>> 16, true)
    local.setUint16(12, time & 0xffff, true)
    local.setUint32(14, entry.crc, true)
    local.setUint32(18, dataLen, true)
    local.setUint32(22, dataLen, true)
    local.setUint16(26, nameLen, true)
    local.setUint16(28, 0, true) // extra

    const localBytes = new Uint8Array(30)
    writeView(localBytes, local)
    localParts.push(localBytes, entry.nameBytes, entry.data)
    offsets.push(offset)
    offset += 30 + nameLen + dataLen

    // Entrée du répertoire central (46 octets + nom).
    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true) // signature
    central.setUint16(4, 20, true) // version créée
    central.setUint16(6, 20, true) // version requise
    central.setUint16(8, 0x0800, true) // UTF-8
    central.setUint16(10, 0, true) // store
    central.setUint16(12, time >>> 16, true)
    central.setUint16(14, time & 0xffff, true)
    central.setUint32(16, entry.crc, true)
    central.setUint32(20, dataLen, true)
    central.setUint32(24, dataLen, true)
    central.setUint16(28, nameLen, true)
    central.setUint16(30, 0, true) // extra
    central.setUint16(32, 0, true) // commentaire
    central.setUint16(34, 0, true) // disque
    central.setUint16(36, 0, true) // attributs internes
    central.setUint32(38, 0o100644 << 16, true) // attributs externes (fichier)
    central.setUint32(42, offsets[offsets.length - 1], true) // offset local

    const centralBytes = new Uint8Array(46)
    writeView(centralBytes, central)
    centralParts.push(centralBytes, entry.nameBytes)
  }

  const centralStart = offset
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true) // signature
  eocd.setUint16(4, 0, true) // disque
  eocd.setUint16(6, 0, true) // disque du répertoire central
  eocd.setUint16(8, sorted.length, true) // entrées sur ce disque
  eocd.setUint16(10, sorted.length, true) // entrées totales
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, centralStart, true)
  eocd.setUint16(20, 0, true) // commentaire

  const eocdBytes = new Uint8Array(22)
  writeView(eocdBytes, eocd)

  const total = centralStart + centralSize + 22
  const output = new Uint8Array(total)
  let cursor = 0
  for (const part of [...localParts, ...centralParts, eocdBytes]) {
    output.set(part, cursor)
    cursor += part.length
  }
  return output
}

/** Extrait les noms d'entrées d'une archive (lecture minimale, pour tests). */
export function readZipEntryNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocdStart = bytes.length - 22
  const entryCount = view.getUint16(eocdStart + 10, true)
  const centralOffset = view.getUint32(eocdStart + 16, true)
  const names: string[] = []
  let cursor = centralOffset
  for (let i = 0; i < entryCount; i += 1) {
    const sig = view.getUint32(cursor, true)
    if (sig !== 0x02014b50) throw new Error(`Signature centrale invalide à l'octet ${cursor}`)
    const nameLen = view.getUint16(cursor + 28, true)
    const extraLen = view.getUint16(cursor + 30, true)
    const commentLen = view.getUint16(cursor + 32, true)
    const nameStart = cursor + 46
    names.push(new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen)))
    cursor = nameStart + nameLen + extraLen + commentLen
  }
  return names
}
