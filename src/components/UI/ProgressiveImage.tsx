/**
 * Image progressive (spec « Passe de correction » §7) : l'image complète n'est
 * jamais chargée tant que la carte n'approche pas du viewport. Pendant ce
 * temps, un repli léger (teinte déterministe / squelette) tient la place — pas
 * de rectangle vide. Une fois l'image décodée, fondu discret.
 *
 * - IntersectionObserver : `src` n'est posé QUE quand l'élément approche
 *   (rootMargin de préchargement) — des centaines de cartes ne déclenchent
 *   aucun décodage d'image hors écran.
 * - `decoding="async"` : le décodage ne bloque jamais le thread UI.
 * - `onError` : repli stable (jamais d'icône cassée).
 * - Réduction de mouvement : le fondu est supprimé, l'image apparaît nette.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface ProgressiveImageProps {
  src?: string | null
  alt?: string
  /** Classes appliquées à l'élément image (object-cover etc. déjà incluses). */
  className?: string
  /** Repli affiché tant que l'image n'est pas décodée (et en cas d'erreur). */
  fallback?: ReactNode
  /** Marge de préchargement (viewport) avant de commencer le décodage. */
  rootMargin?: string
  /** Désactive l'observation (image au premier écran, héros…) : charge immédiatement. */
  eager?: boolean
  /** Opacité finale de l'image (les jaquettes utilisent parfois une teinte). */
  opacity?: number
  /** Remplit un conteneur positionné (`absolute inset-0`) au lieu d'un bloc en flux. */
  absolute?: boolean
}

export function ProgressiveImage({
  src,
  alt = '',
  className = '',
  fallback,
  rootMargin = '240px',
  eager = false,
  opacity = 1,
  absolute = false,
}: ProgressiveImageProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const [inView, setInView] = useState(eager)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (eager) return
    const node = containerRef.current
    if (!node) return
    // Sans IntersectionObserver (environnement minimal), charger immédiatement.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [eager, rootMargin])

  const showImage = Boolean(src) && inView && !failed

  return (
    <span ref={containerRef} className={`${absolute ? 'absolute inset-0' : 'relative block h-full w-full'} overflow-hidden ${className}`}>
      {(!loaded || failed) && (fallback ?? <span aria-hidden className="absolute inset-0 bg-white/[0.03]" />)}
      {showImage && (
        <img
          src={src!}
          alt={alt}
          decoding="async"
          loading={eager ? 'eager' : 'lazy'}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          draggable={false}
          className={`absolute inset-0 h-full w-full object-cover ${loaded ? 'motion-safe:transition-opacity motion-safe:duration-300' : ''} ${loaded ? '' : 'opacity-0'}`}
          style={{ opacity: loaded ? opacity : 0 }}
        />
      )}
    </span>
  )
}
