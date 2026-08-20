import type { GameInputProfile, GameKeyboardLayout, GameKeyMapping } from '../types'

/** Touches proposées dans l'éditeur (lettres + ponctuation des rangées physiques). */
export const KEY_OPTIONS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  ';', ',', '.', '/', ':', '!',
]

/** Preset « Déplacement uniquement » : uniquement les 4 touches de déplacement (recommandé pour le gameplay). */
export const MOVEMENT_ONLY_MAPPING: GameKeyMapping[] = [
  { physical: 'Z', gameKey: 'W' },
  { physical: 'Q', gameKey: 'A' },
  { physical: 'W', gameKey: 'Z' },
  { physical: 'A', gameKey: 'Q' },
]

/** AZERTY → QWERTY : la touche physique Z doit être envoyée W au jeu, etc. */
export const AZERTY_TO_QWERTY: GameKeyMapping[] = [
  ...MOVEMENT_ONLY_MAPPING,
  { physical: 'M', gameKey: ';' },
]

/** QWERTY → AZERTY : inverse exact de la liste précédente. */
export const QWERTY_TO_AZERTY: GameKeyMapping[] = AZERTY_TO_QWERTY.map(({ physical, gameKey }) => ({
  physical: gameKey,
  gameKey: physical,
}))

/** QWERTZ → QWERTY : Z et Y échangés. */
export const QWERTZ_TO_QWERTY: GameKeyMapping[] = [
  { physical: 'Z', gameKey: 'Y' },
  { physical: 'Y', gameKey: 'Z' },
]

export interface InputPreset {
  label: string
  layout: GameKeyboardLayout
  mapping: GameKeyMapping[]
}

/** Groupes de presets : « Déplacement uniquement » (safe pour le gameplay) puis « Clavier complet ». */
export const PRESET_GROUPS: Array<{ label: string; presets: InputPreset[] }> = [
  {
    label: 'Déplacement uniquement',
    presets: [
      { label: 'AZERTY → QWERTY', layout: 'azerty', mapping: MOVEMENT_ONLY_MAPPING },
      { label: 'QWERTY → AZERTY', layout: 'custom', mapping: MOVEMENT_ONLY_MAPPING.map(({ physical, gameKey }) => ({ physical: gameKey, gameKey: physical })) },
    ],
  },
  {
    label: 'Clavier complet',
    presets: [
      { label: 'AZERTY → QWERTY', layout: 'azerty', mapping: AZERTY_TO_QWERTY },
      { label: 'QWERTY → AZERTY', layout: 'custom', mapping: QWERTY_TO_AZERTY },
      { label: 'QWERTZ → QWERTY', layout: 'qwertz', mapping: QWERTZ_TO_QWERTY },
    ],
  },
]

export const LAYOUT_LABELS: Record<GameKeyboardLayout, string> = {
  qwerty: 'QWERTY',
  azerty: 'AZERTY',
  qwertz: 'QWERTZ',
  custom: 'Personnalisée',
}

export function presetForLayout(layout: GameKeyboardLayout): GameKeyMapping[] {
  switch (layout) {
    case 'azerty': return AZERTY_TO_QWERTY
    case 'qwertz': return QWERTZ_TO_QWERTY
    case 'qwerty': return []
    case 'custom': return []
  }
}

/** Valeur effective pour un profil de mods : profil mods > jeu > défaut (vide). */
export function effectiveInputProfile(game: { keyboardProfiles?: GameInputProfile[] }, profileId?: string): GameInputProfile | undefined {
  const profiles = game.keyboardProfiles || []
  const profileMatch = profiles.find(profile => profile.enabled && profile.profileId === profileId)
  if (profileMatch) return profileMatch
  return profiles.find(profile => profile.enabled && !profile.profileId)
}

export function effectiveLayout(game: { keyboardLayout?: GameKeyboardLayout; keyboardProfiles?: GameInputProfile[] }, profileId?: string): GameKeyboardLayout {
  return effectiveInputProfile(game, profileId)?.layout || game.keyboardLayout || 'qwerty'
}
