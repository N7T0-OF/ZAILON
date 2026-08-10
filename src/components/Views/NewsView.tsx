import { Gamepad2, Images, Layers3, ShieldCheck, Sparkles } from 'lucide-react'
import { appVersion } from '../../store/useStore'

const RELEASE = [
  { icon: ShieldCheck, color: '#8cc9bc', text: 'Chaque profil référence maintenant une version et une empreinte SHA-256 immuables. Une mise à jour ne remplace plus silencieusement le contenu attendu.' },
  { icon: Gamepad2, color: '#dbe8e5', text: 'Le diagnostic « Pourquoi ce mod ne fonctionne pas ? » vérifie le paquet, le manifeste, la racine, le profil, la carte virtuelle et le runtime.' },
  { icon: Layers3, color: '#8cc9bc', text: 'La nouvelle Vue ZAILON montre le fichier gagnant, les mods remplacés et la raison exacte du choix.' },
  { icon: Images, color: '#aebfbc', text: 'Les conflits sont expliqués en langage naturel et le mod réellement utilisé peut être choisi pour chaque fichier.' },
  { icon: Sparkles, color: '#aebfbc', text: 'Après une mise à jour, ZAILON compare automatiquement les nombres de jeux, profils et mods avec la sauvegarde préalable.' },
]

export function NewsView() {
  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <div className="mb-5"><p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold/58">Dernière version</p><h1 className="mt-1 font-display text-2xl font-bold text-white">Notes de version</h1><p className="mt-1 text-[11px] text-white/34">ZAILON · v{appVersion}</p></div>
    <section className="max-w-3xl"><div className="mb-3 flex items-center gap-2"><span className="font-display text-lg font-bold text-gold">{appVersion}</span><span className="rounded-full bg-gold/80 px-2 py-0.5 text-[11px] font-semibold text-[var(--zailon-accent-text)]">Import sécurisé</span></div><div className="space-y-2">{RELEASE.map(({ icon: Icon, color, text }) => <div key={text} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3"><Icon size={16} className="mt-0.5 shrink-0" style={{ color }} /><p className="text-xs leading-relaxed text-white/68">{text}</p></div>)}</div></section>
    <p className="mt-6 border-t border-white/[0.05] pt-4 text-[11px] text-white/24">github.com/N7T0-OF/ZAILON</p>
  </div>
}
