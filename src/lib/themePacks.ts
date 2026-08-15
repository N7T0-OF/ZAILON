/**
 * Packs de thèmes (spec « Finalisation des add-ons » §39).
 *
 * Un pack est un preset combinant couleur d'accent, densité, taille de texte
 * et animations — appliqué d'un clic depuis Paramètres → Apparence. Logique
 * pure et testable (aucun accès DOM/store) : la section UI est fournie par
 * l'add-on `official.zailon.themes` (capacité `themes.packs`).
 */

export interface ThemePack {
  id: string
  name: string
  description: string
  accentColor: string
  uiDensity: 'comfortable' | 'compact'
  textSize: 'small' | 'normal' | 'large' | 'very-large'
  motionMode: 'auto' | 'enabled' | 'reduced'
}

export const THEME_PACKS: ThemePack[] = [
  {
    id: 'zailon-classic',
    name: 'Classique',
    description: 'Le défaut ZAILON : accent clair, densité confortable, texte normal.',
    accentColor: '#f3faf8',
    uiDensity: 'comfortable',
    textSize: 'normal',
    motionMode: 'auto',
  },
  {
    id: 'gold-contrast',
    name: 'Or contrasté',
    description: 'Accent doré, densité compacte — plus d’infos à l’écran.',
    accentColor: '#e8b64c',
    uiDensity: 'compact',
    textSize: 'normal',
    motionMode: 'auto',
  },
  {
    id: 'midnight',
    name: 'Nuit',
    description: 'Bleu profond, densité confortable, animations réduites.',
    accentColor: '#38bdf8',
    uiDensity: 'comfortable',
    textSize: 'normal',
    motionMode: 'reduced',
  },
  {
    id: 'emerald-calm',
    name: 'Émeraude',
    description: 'Vert apaisant, texte agrandi pour le confort de lecture.',
    accentColor: '#2dd4bf',
    uiDensity: 'comfortable',
    textSize: 'large',
    motionMode: 'reduced',
  },
  {
    id: 'compact-crimson',
    name: 'Écarlate compact',
    description: 'Rouge vif, densité compacte, texte minimal.',
    accentColor: '#fb7185',
    uiDensity: 'compact',
    textSize: 'small',
    motionMode: 'reduced',
  },
]

/** Réglages appliqués par un pack. */
export function themePackSettings(pack: ThemePack): Pick<ThemePack, 'accentColor' | 'uiDensity' | 'textSize' | 'motionMode'> {
  return {
    accentColor: pack.accentColor,
    uiDensity: pack.uiDensity,
    textSize: pack.textSize,
    motionMode: pack.motionMode,
  }
}

/** Vrai si l'état courant correspond exactement à un pack (pour la sélection). */
export function isThemePackActive(
  pack: ThemePack,
  current: { accentColor: string; uiDensity: string; textSize: string; motionMode: string },
): boolean {
  return current.accentColor.toLowerCase() === pack.accentColor.toLowerCase()
    && current.uiDensity === pack.uiDensity
    && current.textSize === pack.textSize
    && current.motionMode === pack.motionMode
}
