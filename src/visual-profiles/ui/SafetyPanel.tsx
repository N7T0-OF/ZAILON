import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import type { VisualSafetyReport } from '../domain/types'

export function SafetyPanel({ report }: { report?: VisualSafetyReport }) {
  if (!report) return <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4 text-xs text-white/40">Le diagnostic de sécurité apparaîtra ici pour un jeu associé.</section>
  const safeFacts = [
    ['Fichiers du jeu modifiés', report.changesGameFiles],
    ['DLL ou code injecté', report.injectsCode],
    ['API graphique accrochée', report.hooksGraphicsApi],
    ['Mémoire du jeu lue/écrite', report.readsGameMemory || report.writesGameMemory],
    ['Overlay ou pilote noyau', report.usesOverlay || report.usesKernelDriver],
  ]
  return <section className={`rounded-xl border p-4 ${report.compatibleWithGamePolicy ? 'border-emerald-300/15 bg-emerald-300/[0.025]' : 'border-red-300/20 bg-red-300/[0.035]'}`}>
    <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-200/70" /><h3 className="text-xs font-semibold text-white/78">Mode affichage système</h3></div>
    <div className="mt-3 grid gap-1.5 sm:grid-cols-2">{safeFacts.map(([label, unsafe]) => <div key={String(label)} className="flex items-center gap-2 text-[11px] text-white/48">{unsafe ? <AlertTriangle size={12} className="text-red-300" /> : <CheckCircle2 size={12} className="text-emerald-300/70" />}{label} : {unsafe ? 'oui' : 'non'}</div>)}</div>
    {report.rustPolicy && <p className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.035] p-2.5 text-[11px] leading-relaxed text-amber-100/65">Rust interdit les outils d’injection graphique comme ReShade. Visual Profiles n’utilise jamais cette méthode. La décision finale sur les outils autorisés appartient toutefois à l’éditeur et peut évoluer.</p>}
    {report.detectedComponents.length > 0 && <div className="mt-3 rounded-lg border border-red-300/18 bg-red-300/[0.035] p-2.5"><p className="text-xs font-semibold text-red-100/75">Composant graphique incompatible détecté</p><p className="mt-1 break-all text-[11px] text-red-100/50">{report.detectedComponents.join(' · ')}</p><p className="mt-1 text-[11px] text-white/35">ZAILON ne supprime jamais ces fichiers automatiquement.</p></div>}
    {report.warnings.map(warning => <p key={warning} className="mt-2 text-[11px] leading-relaxed text-white/38">{warning}</p>)}
  </section>
}
