import { open, save } from '@tauri-apps/plugin-dialog'
import { native } from '../../lib/native'

export const visualBackend = native.visualProfiles

export async function pickVisualProfileFile() {
  if (!native.isDesktop()) return null
  const selected = await open({
    title: 'Importer un profil visuel ZAILON',
    multiple: false,
    filters: [{ name: 'Profil visuel ZAILON', extensions: ['zailon-visual-profile'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export async function saveVisualProfileFile(name: string) {
  if (!native.isDesktop()) return null
  const selected = await save({
    title: 'Exporter le profil visuel',
    defaultPath: `${name.replace(/[^a-z0-9_-]+/gi, '-')}.zailon-visual-profile`,
    filters: [{ name: 'Profil visuel ZAILON', extensions: ['zailon-visual-profile'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export async function pickVisualPreviewImage() {
  if (!native.isDesktop()) return null
  const selected = await open({
    title: 'Choisir une image locale pour l’aperçu',
    multiple: false,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }],
  })
  return typeof selected === 'string' ? selected : null
}
