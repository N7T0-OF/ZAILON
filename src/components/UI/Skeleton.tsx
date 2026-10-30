/**
 * Squelettes de chargement (spec Startup §5 : « skeletons nécessaires »).
 *
 * Une page s'affiche instantanément avec des blocs pulsés aux dimensions de
 * son contenu final, puis ses données arrivent — jamais d'écran vide ou de
 * spinner plein écran au premier accès.
 */
import type { ReactNode } from 'react'
import { skeletonCount } from '../../lib/lazyPages'

/** Bloc de base : rectangle pulsé. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-white/[0.05] ${className}`} />
}

/** Carte squelette (couverture + lignes), utilisée dans les grilles. */
export function SkeletonCard({ ratio = 'aspect-[16/7]' }: { ratio?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015]">
      <Skeleton className={`${ratio} rounded-none bg-white/[0.035]`} />
      <div className="space-y-2 p-4">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-2.5 w-1/3" />
      </div>
    </div>
  )
}

/** Grille de cartes squelette. */
export function SkeletonGrid({ count = 6, columns = 'md:grid-cols-2 2xl:grid-cols-3' }: { count?: number; columns?: string }) {
  const items = skeletonCount(count)
  return (
    <div className={`grid gap-3 ${columns}`}>
      {Array.from({ length: items }, (_, index) => <SkeletonCard key={index} />)}
    </div>
  )
}

/** Liste de lignes squelette (tableaux, historiques). */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  const items = skeletonCount(rows)
  return (
    <div className="space-y-2">
      {Array.from({ length: items }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.012] p-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** Rangée d'indicateurs squelette (les « cartes stats » des pages). */
export function SkeletonIndicators({ count = 6 }: { count?: number }) {
  const items = skeletonCount(count, 3, 12)
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: items }, (_, index) => (
        <div key={index} className="rounded-xl border border-white/[0.065] bg-white/[0.018] px-3 py-2.5">
          <Skeleton className="h-2.5 w-1/2" />
          <Skeleton className="mt-1.5 h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

/**
 * PageSkeleton : squelette complet (en-tête + indicateurs + contenu) affiché
 * pendant le premier chargement d'une page, avant que ses données arrivent.
 */
export function PageSkeleton({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string
  title?: string
  children: ReactNode
}) {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6" aria-busy="true" aria-label="Chargement de la page">
      <header>
        {eyebrow ? <Skeleton className="h-2.5 w-24" /> : null}
        {title ? <Skeleton className="mt-2 h-7 w-52" /> : null}
        <Skeleton className="mt-2 h-3 w-3/4 max-w-xl" />
      </header>
      {children}
    </div>
  )
}
