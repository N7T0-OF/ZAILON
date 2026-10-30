/**
 * ZailonSelectionCheckbox — la checkbox de SÉLECTION multiple de ZAILON
 * (spec « Refonte globale des toggles » §6-7).
 *
 * Règle du design system : une sélection d'éléments (20 mods, dossiers à
 * importer…) reste une vraie checkbox — jamais un switch. Les switches sont
 * réservés aux préférences ON/OFF.
 *
 * Utilise la couleur d'accent (`--zailon-accent`) comme le switch, et conserve
 * le rendu natif pour l'accessibilité (focus clavier, état intermédiaire géré
 * par l'appelant).
 */
export function ZailonSelectionCheckbox({ checked, onChange, disabled, className, 'aria-label': ariaLabel, onClick }: {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
  onClick?: (event: React.MouseEvent<HTMLInputElement>) => void
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={event => onChange?.(event.target.checked)}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`h-4 w-4 shrink-0 cursor-pointer accent-[var(--zailon-accent)] disabled:cursor-not-allowed disabled:opacity-30 ${className ?? ''}`}
    />
  )
}
