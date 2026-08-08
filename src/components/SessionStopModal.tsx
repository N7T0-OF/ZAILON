import { AlertTriangle, X } from 'lucide-react'

/**
 * Confirmation avant X de session (spec « X de session + multi-apps »).
 * Deux variantes :
 * - jeu réellement actif → « Quitter le jeu » (jamais tué brutalement au
 *   premier clic : la fermeture normale est demandée, le processus n'est pas
 *   tué directement) ;
 * - encore en recherche → « Arrêter » le suivi ZAILON SANS fermer le launcher
 *   externe (Steam / launcher officiel peuvent rester ouverts).
 */
export function SessionStopModal({ gameName, searching, onCancel, onConfirm }: {
  gameName: string
  searching: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onCancel}>
      <section role="dialog" aria-modal="true" aria-labelledby="session-stop-title" className="w-full max-w-sm rounded-2xl border border-white/[0.11] bg-[#111414] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200"><AlertTriangle size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="session-stop-title" className="font-display text-base font-bold text-white">{gameName}</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/45">{searching
              ? 'est encore en cours de lancement. Voulez-vous arrêter la recherche et annuler cette session ZAILON ? Le launcher externe (Steam / launcher officiel) peut rester ouvert.'
              : 'est actuellement en cours. Voulez-vous vraiment quitter le jeu ? Toute progression non sauvegardée peut être perdue.'}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Fermer" className="rounded-lg p-2 text-white/36 hover:bg-white/[0.06]"><X size={15} /></button>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.05]">Annuler</button>
          <button type="button" onClick={onConfirm} className="rounded-lg bg-red-300/90 px-3 py-2 text-[11px] font-semibold text-[#160a0a] hover:bg-red-200">{searching ? 'Arrêter la recherche' : 'Quitter le jeu'}</button>
        </div>
      </section>
    </div>
  )
}
