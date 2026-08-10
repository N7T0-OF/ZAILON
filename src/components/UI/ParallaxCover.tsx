import { useEffect, useRef, useState } from 'react'
import { PARALLAX_MAX_DEG, PARALLAX_MAX_SCALE, tiltFromPointer } from '../../lib/motion'

/**
 * Parallaxe 3D subtil des cartes de la Bibliothèque (spec « Refonte globale »
 * §16-28, §64-66).
 *
 * - La souris INCLINE la CARTE ENTIÈRE (rotateX/rotateY max 4°, scale max
 *   1.012) — conteneur, couverture, titre, badges et favori bougent ensemble
 *   comme une seule jaquette physique (spec §16-19). Ce n'est PAS un zoom
 *   (spec §24) et l'effet ne porte plus uniquement sur l'image (spec §16, §64 :
 *   le cas « cover uniquement » ne doit plus exister).
 * - Le mouvement est appliqué DIRECTEMENT au style du nœud (ref), jamais un
 *   setState React par déplacement de souris (spec §26) : seul le survol d'une
 *   carte est animé, aucun rerender de la grille, aucune boucle globale.
 * - `perspective` sur le conteneur, `transform-style: preserve-3d` sur la
 *   couche inclinée ; `will-change: transform` UNIQUEMENT pendant le survol.
 * - Retour au repos en 220 ms quand la souris quitte la carte (spec §25).
 * - Menu contextuel (clic droit) : la carte revient au neutre AVANT d'ouvrir le
 *   menu — pas de mouvement 3D pendant le menu (spec §65).
 * - Désactivé (statique) quand `active` est faux : mode réduit, toggle
 *   désactivé ou périphérique tactile (spec §10-13, §27-28). La transformation
 *   ne casse pas les zones de clic : les boutons restent cliquables (spec §21).
 */
export function ParallaxCover({ children, active, className, onContextMenu }: {
  children: React.ReactNode
  active: boolean
  className?: string
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  const layer = useRef<HTMLDivElement>(null)
  const [hovering, setHovering] = useState(false)

  useEffect(() => {
    if (!active && layer.current) {
      layer.current.style.transform = 'none'
    }
  }, [active])

  const reset = () => {
    const node = layer.current
    if (!node) return
    node.style.transition = 'transform 220ms ease-out'
    node.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)'
  }

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
    reset()
  }

  const onMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    // spec §65 : retour au neutre avant l'ouverture du menu contextuel.
    setHovering(false)
    reset()
    onContextMenu?.(event)
  }

  if (!active) {
    return <div className={className} onContextMenu={onContextMenu}>{children}</div>
  }

  return (
    <div className={className} style={{ perspective: 900 }} onMouseEnter={onEnter} onMouseMove={onMove} onMouseLeave={onLeave} onContextMenu={onMenu}>
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
