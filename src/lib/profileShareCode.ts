import type { ProfileArchiveManifest } from '../types'

/**
 * Code de partage de profil ZAILON (spec partage §51-53).
 *
 * Format : `ZAILON-PROFILE-V1:<base64url(JSON)>`
 * - Aucune exécution de code arbitraire : uniquement un manifeste strict validé.
 * - Taille plafonnée : les profils lourds passent par l'export fichier.
 * - Pas de serveur, pas de compte : le code est autonome.
 */

export const PROFILE_CODE_PREFIX = 'ZAILON-PROFILE-V1:'
export const MAX_PROFILE_CODE_BYTES = 256 * 1024

export function isProfileCode(text: string): boolean {
  return text.trim().startsWith(PROFILE_CODE_PREFIX)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** Validation stricte de la forme d'un manifeste (§52-53 : format manifeste uniquement). */
export function validateManifestShape(value: unknown): value is ProfileArchiveManifest {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (candidate.schemaVersion !== 1) return false
  if (candidate.app !== 'ZAILON') return false
  if (typeof candidate.exportedAt !== 'string') return false
  if (candidate.exportMode !== 'light' && candidate.exportMode !== 'complete') return false
  const game = candidate.game
  if (typeof game !== 'object' || game === null || typeof (game as Record<string, unknown>).name !== 'string') return false
  const profile = candidate.profile
  if (typeof profile !== 'object' || profile === null) return false
  const profileRecord = profile as Record<string, unknown>
  if (typeof profileRecord.name !== 'string') return false
  if (typeof profileRecord.modStates !== 'object' || profileRecord.modStates === null) return false
  if (!Array.isArray(candidate.mods)) return false
  return true
}

/** Encode un manifeste en code compact. Échoue si le manifeste dépasse la limite. */
export function encodeProfileCode(manifest: ProfileArchiveManifest): string {
  const json = JSON.stringify(manifest)
  const bytes = new TextEncoder().encode(json)
  if (bytes.length > MAX_PROFILE_CODE_BYTES) {
    throw new Error(`Manifeste trop volumineux pour un code (${bytes.length} octets, maximum ${MAX_PROFILE_CODE_BYTES}). Utilisez l'export fichier.`)
  }
  return PROFILE_CODE_PREFIX + bytesToBase64Url(bytes)
}

/** Décode un code de profil. Retourne null pour tout contenu non conforme. */
export function decodeProfileCode(text: string): ProfileArchiveManifest | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith(PROFILE_CODE_PREFIX)) return null
  const payload = trimmed.slice(PROFILE_CODE_PREFIX.length).trim()
  if (!payload) return null
  try {
    const bytes = base64UrlToBytes(payload)
    if (bytes.length > MAX_PROFILE_CODE_BYTES) return null
    const json = new TextDecoder().decode(bytes)
    const value: unknown = JSON.parse(json)
    return validateManifestShape(value) ? value : null
  } catch {
    return null
  }
}

/** Petit extrait lisible du code pour l'affichage UI (jamais le code complet). */
export function summarizeProfileCode(code: string, maxChars = 56): string {
  if (code.length <= maxChars) return code
  return `${code.slice(0, maxChars)}…`
}
