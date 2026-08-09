import { useEffect, useRef, useState } from 'react'
import { PARALLAX_MAX_DEG, PARALLAX_MAX_SCALE, tiltFromPointer } from '../../lib/motion'

/**
 * Parallaxe 3D subtil des couvertures (spec « Library Polish » §4-9, §48, §58-59).
 *
 * - La souris INCLINE la carte (rotateX/rotateY max 4°, scale max 1.012) — ce
 *   n'est pas un zoom, la taille reste quasi identique (spec §5).
 * - Le mouvement est appliqué DIRECTEMENT au style du nœud (ref), jamais un
 *   setState React par déplacement de souris (spec §8, §48) : seul le survol
 *   d'une carte est animé, aucun rerender de la grille.
 * - `perspective` sur le conteneur, `transform-style: preserve-3d` sur la
 *   couche inclinée (spec §6) ; `will-change: transform` UNIQUEMENT pendant le
 *   survol (spec §59).
 * - Retour au repos en 220 ms quand la souris quitte la carte (spec §9).
 * - Désactivé (statique) quand `active` est faux : mode réduit, toggle
 *   désactivé ou périphérique tactile (spec §10-13). La transformation ne
 *   s'applique qu'à la couche visuelle : les boutons restent dans une couche
 *   non transformée, leur zone de clic n'est jamais déformée (spec §25).
 */
export function ParallaxCover({ children, active, className }: {
  children: React.ReactNode
  active: boolean
  className?: string
}) {
  const layer = useRef<HTMLDivElement>(null)
  const [hovering, setHovering] = useState(false)

  useEffect(() => {
    if (!active && layer.current) {
      layer.current.style.transform = 'none'
    }
  }, [active])

  const onEnter = () => {
    setHovering(true)
    if (layer.current) layer.current.style.transition = 'none'
  }

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const node = layer.current
    if (!node || !active) return
    const rect = node.getBoundingClientRect()
    const { x, y } = tiltFromPointer(event.clientX, event.clientY, rect)
    const rotateX = (-y * PARALLAX_MAX_DEG).toFixed(2)
    const rotateY = (x * PARALLAX_MAX_DEG).toFixed(2)
    node.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${PARALLAX_MAX_SCALE})`
  }

  const onLeave = () => {
    setHovering(false)
    if (layer.current) {
      layer.current.style.transition = 'transform 220ms ease-out'
      layer.current.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)'
    }
  }

  if (!active) {
    return <div className={className}>{children}</div>
  }

  return (
    <div className={className} style={{ perspective: 900 }} onMouseEnter={onEnter} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div ref={layer} className="h-full w-full" style={{
        transformStyle: 'preserve-3d',
        transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)',
        willChange: hovering ? 'transform' : undefined,
      }}>
        {children}
      </div>
    </div>
  )
}
