import { Gamepad2, Monitor } from 'lucide-react'

/** Hash déterministe (FNV-1a) → teinte stable pour chaque jeu. */
function nameHue(name: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % 360
}

/**
 * Couverture automatique (spec « Library Polish » §2-3) : quand aucun artwork
 * n'est disponible, ZAILON génère une carte propre — teinte déterministe du
 * jeu (accent), léger dégradé, icône centrée, titre — jamais un rectangle gris.
 *
 * Le rendu est un composant déterministe (même entrée → même carte) : le
 * « FallbackArtworkGenerator » de la spec est donc sans état, recalculé zéro
 * fois par image disque — aucun fichier à écrire, aucun cache à invalider.
 */
export function FallbackArtwork({ name, kind, className }: {
  name: string
  kind?: string
  className?: string
}) {
  const hue = nameHue(name)
  const Icon = kind === 'software' ? Monitor : Gamepad2
  return (
    <div
      aria-hidden="true"
      className={`relative flex h-full w-full flex-col items-center justify-center gap-2.5 overflow-hidden ${className ?? ''}`}
      style={{ background: `linear-gradient(165deg, hsl(${hue} 38% 52%) 0%, hsl(${hue} 34% 30%) 55%, hsl(${hue} 30% 16%) 100%)` }}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-black/25 text-white/85 backdrop-blur-sm">
        <Icon size={22} strokeWidth={1.6} />
      </span>
      <span className="w-4/5 truncate text-center text-[11px] font-semibold text-white/85" title={name}>{name}</span>
      <span className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 55%)' }} />
    </div>
  )
}
