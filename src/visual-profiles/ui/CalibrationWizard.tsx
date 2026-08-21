import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useState } from 'react'

const STEPS = [
  ['Éclairage ambiant', 'Stabilisez l’éclairage de la pièce et évitez une source lumineuse dirigée vers l’écran.'],
  ['Sélection de l’écran', 'Vérifiez le nom, la résolution et l’état HDR de l’écran à calibrer.'],
  ['Luminosité', 'Réglez d’abord la luminosité physique du moniteur à un niveau confortable.'],
  ['Noirs', 'Les premières nuances sombres de la mire doivent rester distinctes.'],
  ['Blancs', 'Les dernières nuances claires doivent être visibles sans éblouissement.'],
  ['Gamma', 'Ajustez progressivement le gamma, sans effacer les détails des ombres.'],
  ['Saturation', 'Conservez des couleurs naturelles et des dégradés réguliers.'],
  ['Température', '6 500 K est un point de départ courant ; adaptez-le à votre usage.'],
  ['Mire', 'Contrôlez les gris, couleurs primaires et dégradés dans l’aperçu ZAILON.'],
  ['Sauvegarde', 'Fermez l’assistant puis enregistrez les valeurs comme nouveau profil.'],
]

export function CalibrationWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/72 p-5 backdrop-blur-md">
    <section className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#111515] p-5 shadow-2xl">
      <div className="flex items-center justify-between"><div><p className="text-[11px] uppercase tracking-[0.18em] text-gold/65">Calibration guidée · {step + 1}/{STEPS.length}</p><h2 className="mt-1 text-lg font-bold text-white">{STEPS[step][0]}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-white/40 hover:bg-white/[0.06] hover:text-white"><X size={16} /></button></div>
      <div className="my-5 h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-gold transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
      <p className="min-h-24 text-sm leading-relaxed text-white/58">{STEPS[step][1]}</p>
      <p className="rounded-lg border border-amber-300/12 bg-amber-300/[0.025] p-3 text-[11px] text-amber-100/55">Cette calibration visuelle ne remplace pas une sonde colorimétrique.</p>
      <div className="mt-5 flex justify-between"><button type="button" disabled={step === 0} onClick={() => setStep(value => value - 1)} className="flex items-center gap-1 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/55 disabled:opacity-25"><ChevronLeft size={14} />Précédent</button>{step < STEPS.length - 1 ? <button type="button" onClick={() => setStep(value => value + 1)} className="flex items-center gap-1 rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-[var(--zailon-accent-text)]">Suivant<ChevronRight size={14} /></button> : <button type="button" onClick={onClose} className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-[var(--zailon-accent-text)]">Terminer</button>}</div>
    </section>
  </div>
}
