import { ArrowUp, Package, ShieldCheck, Type } from 'lucide-react'

const RELEASE = [
  { icon: Package, color: '#dbe8e5', text: 'Explorer charge maintenant les nouveautés réelles de GameBanana et permet de rechercher dans les pages récentes.' },
  { icon: ArrowUp, color: '#8cc9bc', text: 'Le téléchargement vise explicitement le dossier Mods du jeu sélectionné, avec analyse des fichiers proposés.' },
  { icon: ShieldCheck, color: '#8cc9bc', text: 'Les liens externes sont limités aux sources approuvées et les résultats adultes restent masqués par défaut.' },
  { icon: Type, color: '#aebfbc', text: 'Tous les textes visibles utilisent désormais une taille minimale de 11 px.' },
]

export function NewsView() {
  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <div className="mb-5"><p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold/58">Dernière version</p><h1 className="mt-1 font-display text-2xl font-bold text-white">Notes de version</h1><p className="mt-1 text-[11px] text-white/34">ZAILON Universal Mod Launcher · v1.2.3</p></div>
    <section className="max-w-3xl"><div className="mb-3 flex items-center gap-2"><span className="font-display text-lg font-bold text-gold">1.2.3</span><span className="rounded-full bg-gold/80 px-2 py-0.5 text-[11px] font-semibold text-ink-400">Explorer réel</span></div><div className="space-y-2">{RELEASE.map(({ icon: Icon, color, text }) => <div key={text} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3"><Icon size={14} className="mt-0.5 shrink-0" style={{ color }} /><p className="text-xs leading-relaxed text-white/68">{text}</p></div>)}</div></section>
    <p className="mt-6 border-t border-white/[0.05] pt-4 text-[11px] text-white/24">github.com/N7T0-OF/ZAILON</p>
  </div>
}
