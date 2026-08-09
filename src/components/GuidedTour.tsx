import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { CURRENT_TOUR_VERSION, TOUR_STEPS } from '../lib/tourSteps'

export { CURRENT_TOUR_VERSION, tourSteps } from '../lib/tourSteps'

/**
 * Tour guidé de première visite (spec §18-24) : une petite fenêtre flottante
 * NON bloquante — l'utilisateur garde accès à l'application derrière. Chaque
 * étape navigue automatiquement vers la bonne page (spec §21). « Passer » est
 * respecté et persisté (spec §54) ; « Revoir la visite guidée » le relance
 * depuis Paramètres > Application.
 */
export function GuidedTour({ onClose }: { onClose?: () => void }) {
  const setView = useStore(state => state.setView)
  const completeTourStep = useStore(state => state.completeTourStep)
  const finishTour = useStore(state => state.finishTour)
  const skipTour = useStore(state => state.skipTour)
  const [stepIndex, setStepIndex] = useState(0)
  const [closed, setClosed] = useState(false)

  const step = TOUR_STEPS[stepIndex]
  const isLast = stepIndex === TOUR_STEPS.length - 1

  // Navigation automatique vers la page de l'étape (spec §21) : si l'élément
  // n'est pas visible, on s'y rend avant de présenter l'étape.
  useEffect(() => {
    setView(TOUR_STEPS[stepIndex].view)
  }, [stepIndex, setView])

  const next = () => {
    completeTourStep(step.id)
    if (isLast) {
      finishTour()
      setClosed(true)
    } else {
      setStepIndex(index => index + 1)
    }
  }

  const previous = () => {
    if (stepIndex > 0) setStepIndex(index => index - 1)
  }

  const skip = () => {
    skipTour()
    setClosed(true)
  }

  const exit = () => {
    finishTour()
    setClosed(true)
  }

  if (closed) return null

  const StepIcon = step.icon
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[300] flex justify-center px-4">
      <section
        role="dialog"
        aria-label="Visite guidée ZAILON"
        className="pointer-events-auto w-full max-w-md rounded-2xl border border-gold/25 bg-[#101414]/97 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/12 text-gold"><StepIcon size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">Étape {stepIndex + 1} / {TOUR_STEPS.length}</p>
            <h2 className="truncate text-sm font-bold text-white/85">{step.title}</h2>
          </div>
          <button type="button" onClick={exit} aria-label="Terminer la visite" className="rounded-lg p-1.5 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={14} /></button>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs leading-relaxed text-white/58">{step.text}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex gap-1">
              {TOUR_STEPS.map((item, index) => (
                <span key={item.id} className={`h-1 rounded-full transition-all ${index === stepIndex ? 'w-5 bg-gold' : 'w-1.5 bg-white/15'}`} />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={skip} className="rounded-lg px-2.5 py-1.5 text-[11px] text-white/40 hover:bg-white/[0.05] hover:text-white/70">Passer</button>
              {stepIndex > 0 && (
                <button type="button" onClick={previous} className="flex items-center gap-1 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-white/55 hover:bg-white/[0.05]"><ChevronLeft size={12} />Précédent</button>
              )}
              <button type="button" onClick={next} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${isLast ? 'bg-emerald-300/90 text-[#101313]' : 'bg-gold text-ink-400'}`}>
                {isLast ? (<><Check size={12} />Terminer</>) : (<>Suivant<ChevronRight size={12} /></>)}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
