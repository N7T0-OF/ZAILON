import { ReactNode, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Grid2X2, LayoutList, RotateCcw } from 'lucide-react'
import type { ExploreColumns, ExploreSort } from '../../types'

export function ProviderExplorerToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 lg:flex-row lg:items-center">{children}</div>
}

export function ProviderViewModeToggle({ grid, onChange }: { grid: boolean; onChange: (grid: boolean) => void }) {
  return <div className="flex items-center gap-1" role="group" aria-label="Mode d’affichage">
    <button type="button" onClick={() => onChange(true)} title="Affichage en grille" aria-label="Affichage en grille" aria-pressed={grid} className={`flex h-9 w-9 items-center justify-center rounded-lg ${grid ? 'bg-gold text-[var(--zailon-accent-text)]' : 'border border-white/[0.08] text-white/38 hover:text-white'}`}><Grid2X2 size={14} /></button>
    <button type="button" onClick={() => onChange(false)} title="Affichage en liste" aria-label="Affichage en liste" aria-pressed={!grid} className={`flex h-9 w-9 items-center justify-center rounded-lg ${!grid ? 'bg-gold text-[var(--zailon-accent-text)]' : 'border border-white/[0.08] text-white/38 hover:text-white'}`}><LayoutList size={15} /></button>
  </div>
}

export function GridColumnCycleButton({ currentColumnCount, onChange }: { currentColumnCount: ExploreColumns; onChange: (columns: ExploreColumns) => void }) {
  const [effective, setEffective] = useState<2 | 3>(() => currentColumnCount === '3' && window.innerWidth >= 1280 ? 3 : 2)
  useEffect(() => {
    const update = () => setEffective(currentColumnCount === '3' && window.innerWidth >= 1280 ? 3 : 2)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [currentColumnCount])
  const next: ExploreColumns = currentColumnCount === '2' ? '3' : '2'
  const fallback = currentColumnCount === '3' && effective === 2
  const title = fallback
    ? '3 colonnes choisies · 2 affichées temporairement faute d’espace'
    : `Affichage actuel : ${currentColumnCount} colonnes · cliquez pour passer à ${next}`
  return <button type="button" onClick={() => onChange(next)} title={title} aria-label={title} className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] px-2.5 text-[11px] font-semibold text-white/56 hover:bg-white/[0.05] hover:text-white">
    <span aria-hidden="true" className={`grid h-3.5 w-4 gap-[2px] ${currentColumnCount === '3' ? 'grid-cols-3' : 'grid-cols-2'}`}>{Array.from({ length: Number(currentColumnCount) }).map((_, index) => <i key={index} className="rounded-[1px] bg-current" />)}</span>
    <span>{currentColumnCount}</span>
  </button>
}

export function ProviderSortControl({ value, onChange }: { value: ExploreSort; onChange: (value: ExploreSort) => void }) {
  return <label className="text-[11px] text-white/45">Trier par <select value={value} onChange={event => onChange(event.target.value as ExploreSort)} className="ml-1 rounded border border-white/[0.08] bg-[#101313] px-2 py-1.5 text-[11px] text-white/75"><option value="recent">Récent</option><option value="updated">Récemment mis à jour</option><option value="popular">Popularité</option><option value="downloaded">Téléchargements</option></select></label>
}

export function ProviderFilters({ onReset }: { onReset: () => void }) {
  return <button type="button" onClick={onReset} className="flex items-center gap-1.5 rounded border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-white/50 hover:text-white"><RotateCcw size={12} />Réinitialiser les filtres</button>
}

export function ProviderPagination({ provider, page, hasNextPage, loading, onPageChange, pageCount }: { provider: string; page: number; hasNextPage: boolean; loading: boolean; onPageChange: (page: number) => void; pageCount?: number }) {
  const pages = pageCount && pageCount > 1 ? Array.from({ length: pageCount }, (_, index) => index + 1).filter(value => value === 1 || value === pageCount || Math.abs(value - page) <= 1) : []
  return <nav className="mt-4 flex items-center justify-center gap-2" aria-label={`Pagination ${provider}`}>
    <button type="button" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)} className="flex h-9 items-center gap-1 rounded-lg border border-white/[0.08] px-3 text-[11px] text-white/65 hover:bg-white/[0.05] disabled:opacity-25"><ChevronLeft size={14} /> Précédent</button>
    {pages.length ? pages.map((value, index) => <span key={`${value}-${index}`} className="contents">{index > 0 && value - pages[index - 1] > 1 && <span className="text-white/28">…</span>}<button type="button" onClick={() => onPageChange(value)} aria-current={value === page ? 'page' : undefined} className={`flex h-9 min-w-9 items-center justify-center rounded-lg text-[11px] font-bold ${value === page ? 'bg-gold text-[var(--zailon-accent-text)]' : 'border border-white/[0.08] text-white/55 hover:bg-white/[0.05]'}`}>{value}</button></span>) : <span className="flex h-9 items-center justify-center rounded-lg bg-gold px-3 text-[11px] font-bold text-[var(--zailon-accent-text)]">Page {page}</span>}
    <button type="button" disabled={!hasNextPage || loading} onClick={() => onPageChange(page + 1)} className="flex h-9 items-center gap-1 rounded-lg border border-white/[0.08] px-3 text-[11px] text-white/65 hover:bg-white/[0.05] disabled:opacity-25">Suivant <ChevronRight size={14} /></button>
  </nav>
}

export function ProviderSearchResults({ grid, columns, loading, empty, loadingFallback, emptyFallback, children }: { grid: boolean; columns: ExploreColumns; loading: boolean; empty: boolean; loadingFallback: ReactNode; emptyFallback: ReactNode; children: ReactNode }) {
  if (loading) return <>{loadingFallback}</>
  if (empty) return <>{emptyFallback}</>
  return <div className={grid ? `grid gap-3 md:grid-cols-2 ${columns === '3' ? 'xl:grid-cols-3' : ''}` : 'space-y-2'}>{children}</div>
}
