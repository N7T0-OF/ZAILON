import { Loader2 } from 'lucide-react'

/**
 * ZailonSwitch — le composant UNIQUE des préférences ON/OFF de ZAILON
 * (spec « Refonte globale des toggles » §1-13, §45, §58).
 *
 * Règles du design system :
 * - une préférence binaire = un switch ; une sélection d'éléments = une
 *   checkbox ; une action = un bouton (§ intro) ;
 * - piste arrondie, rond interne, rond à gauche = OFF, rond à droite = ON
 *   (§1, §58 — lisible même sans couleur) ;
 * - ON = couleur d'accent `--zailon-accent`, jamais de couleur hardcodée (§2-3) ;
 * - animation courte (140 ms, uniquement thumb + piste, pas de bounce, §9) ;
 * - focus clavier visible (§10), disabled réduit en opacité (§11), état
 *   loading facultatif (§12) ;
 * - même composant dans Paramètres, Bibliothèque, Quick Panel, Visual Profiles,
 *   Intégrations… (`size="compact"` pour les lignes denses, §45) ;
 * - `role="switch"` + `aria-checked` (§58).
 */
export function ZailonSwitch({ checked, onChange, disabled, loading, size = 'normal', className, 'aria-label': ariaLabel }: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  loading?: boolean
  /** Taille compacte pour les lignes denses (Quick Panel, cartes de jeu). */
  size?: 'normal' | 'compact'
  className?: string
  'aria-label'?: string
}) {
  const compact = size === 'compact'
  const busy = Boolean(loading)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={`zailon-switch relative shrink-0 rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--zailon-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1111] disabled:cursor-not-allowed ${compact ? 'h-[18px] w-[34px]' : 'h-[22px] w-[42px]'} ${disabled || busy ? 'opacity-40' : ''} ${checked ? 'bg-[var(--zailon-accent)]' : 'bg-white/[0.14]'} ${className ?? ''}`}
    >
      <span
        aria-hidden
        className={`zailon-switch-thumb pointer-events-none absolute left-[2px] top-[2px] flex items-center justify-center rounded-full bg-white shadow-md transition-transform duration-150 ${compact ? 'h-[14px] w-[14px]' : 'h-[18px] w-[18px]'} ${checked ? (compact ? 'translate-x-[16px]' : 'translate-x-[20px]') : 'translate-x-0'}`}
      >
        {busy && <Loader2 size={compact ? 8 : 10} className="animate-spin text-[var(--zailon-accent-text)]" />}
      </span>
    </button>
  )
}
