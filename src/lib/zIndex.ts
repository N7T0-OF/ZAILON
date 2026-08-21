/**
 * Échelle de z-index centralisée (spec « z-index centralisé »).
 *
 * Toute nouvelle couche doit utiliser ces constantes — jamais de valeurs
 * arbitraires type `z-[999999]` :
 *
 *   content      0     contenu de page
 *   sticky     100     en-têtes, barres collantes
 *   dropdown   500     menus déroulants dans la page
 *   popover   1000     popovers en portal au-dessus de toute l'interface
 *   modal     2000     fenêtres modales
 *   toast     3000     notifications
 *   quick-panel       fenêtre native (hors DOM)
 */
export const Z = {
  content: 0,
  sticky: 100,
  dropdown: 500,
  popover: 1000,
  modal: 2000,
  toast: 3000,
} as const

export type ZLayer = keyof typeof Z
