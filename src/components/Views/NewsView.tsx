import { Gamepad2, Images, Layers3, ShieldCheck, Sparkles } from 'lucide-react'

const RELEASE = [
  { icon: ShieldCheck, color: '#8cc9bc', text: 'Le déploiement TemporaryCopy prépare le profil, résout les conflits, valide les fichiers réellement visibles puis restaure le jeu après sa fermeture.' },
  { icon: Gamepad2, color: '#dbe8e5', text: 'Cyberpunk 2077 bénéficie d’une détection de structure et de diagnostics explicites pour CET, RED4ext, redscript, ArchiveXL, TweakXL, Codeware et REDmod.' },
  { icon: Images, color: '#8cc9bc', text: 'Explorer recherche les vrais jeux GameBanana et affiche leurs captures dans une galerie progressive en parallaxe 3D.' },
  { icon: Layers3, color: '#aebfbc', text: 'Les tâches natives restent dans un historique filtrable, tandis que la bibliothèque propose les vues Grille, Liste illustrée et Compacte.' },
  { icon: Sparkles, color: '#aebfbc', text: 'Liquid Glass, le mode économie d’énergie et la fenêtre Me soutenir enrichissent l’interface sans injection système ni télémétrie de paiement.' },
]

export function NewsView() {
  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <div className="mb-5"><p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold/58">Dernière version</p><h1 className="mt-1 font-display text-2xl font-bold text-white">Notes de version</h1><p className="mt-1 text-[11px] text-white/34">ZAILON Universal Mod Launcher · v1.5.0</p></div>
    <section className="max-w-3xl"><div className="mb-3 flex items-center gap-2"><span className="font-display text-lg font-bold text-gold">1.5.0</span><span className="rounded-full bg-gold/80 px-2 py-0.5 text-[11px] font-semibold text-ink-400">Déploiement vérifiable</span></div><div className="space-y-2">{RELEASE.map(({ icon: Icon, color, text }) => <div key={text} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3"><Icon size={16} className="mt-0.5 shrink-0" style={{ color }} /><p className="text-xs leading-relaxed text-white/68">{text}</p></div>)}</div></section>
    <p className="mt-6 border-t border-white/[0.05] pt-4 text-[11px] text-white/24">github.com/N7T0-OF/ZAILON</p>
  </div>
}
