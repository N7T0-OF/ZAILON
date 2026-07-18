import { FolderSearch, Globe2, Layers3, ShieldCheck } from 'lucide-react'

const RELEASE = [
  { icon: Layers3, color: '#dbe8e5', text: 'Les profils de mods sont maintenant légers, duplicables et importables ou exportables au format .zailon-profile.' },
  { icon: FolderSearch, color: '#8cc9bc', text: 'L’analyse multi-dossiers détecte les installations Generic, Cyberpunk, Bethesda, Unreal Pak, XXMI et BepInEx avant import.' },
  { icon: Globe2, color: '#8cc9bc', text: 'Explorer recherche dynamiquement les jeux GameBanana, mémorise les jeux récents et épinglés, et masque le contenu adulte par défaut.' },
  { icon: ShieldCheck, color: '#aebfbc', text: 'Les archives sont extraites sans écrasement après contrôle des chemins, liens symboliques, exécutables et limites de taille.' },
]

export function NewsView() {
  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <div className="mb-5"><p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold/58">Dernière version</p><h1 className="mt-1 font-display text-2xl font-bold text-white">Notes de version</h1><p className="mt-1 text-[11px] text-white/34">ZAILON Universal Mod Launcher · v1.3.0</p></div>
    <section className="max-w-3xl"><div className="mb-3 flex items-center gap-2"><span className="font-display text-lg font-bold text-gold">1.3.0</span><span className="rounded-full bg-gold/80 px-2 py-0.5 text-[11px] font-semibold text-ink-400">Profils & imports</span></div><div className="space-y-2">{RELEASE.map(({ icon: Icon, color, text }) => <div key={text} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3"><Icon size={14} className="mt-0.5 shrink-0" style={{ color }} /><p className="text-xs leading-relaxed text-white/68">{text}</p></div>)}</div></section>
    <p className="mt-6 border-t border-white/[0.05] pt-4 text-[11px] text-white/24">github.com/N7T0-OF/ZAILON</p>
  </div>
}
