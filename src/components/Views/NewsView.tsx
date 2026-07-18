import { Gamepad2, Images, Layers3, ShieldCheck, Wifi } from 'lucide-react'

const RELEASE = [
  { icon: Layers3, color: '#dbe8e5', text: 'Importez en arrière-plan un dossier racine contenant autant de mods que nécessaire, suivez la progression et annulez proprement la tâche.' },
  { icon: ShieldCheck, color: '#8cc9bc', text: 'Les mods passent par un staging persistant avec manifeste, contrôle des conflits et déploiement Direct Copy sans écrasement.' },
  { icon: Wifi, color: '#8cc9bc', text: 'Nexus est connecté depuis le backend sécurisé : validation de la clé, quotas, catalogue et liens source, sans exposer le secret au frontend.' },
  { icon: Images, color: '#aebfbc', text: 'Les illustrations officielles Steam peuvent être recherchées, prévisualisées et mises en cache pour les jeux détectés.' },
  { icon: Gamepad2, color: '#aebfbc', text: 'Raccourcis zailon://, suivi du jeu lancé et présence Discord locale complètent le vrai parcours de lancement.' },
]

export function NewsView() {
  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <div className="mb-5"><p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold/58">Dernière version</p><h1 className="mt-1 font-display text-2xl font-bold text-white">Notes de version</h1><p className="mt-1 text-[11px] text-white/34">ZAILON Universal Mod Launcher · v1.4.0</p></div>
    <section className="max-w-3xl"><div className="mb-3 flex items-center gap-2"><span className="font-display text-lg font-bold text-gold">1.4.0</span><span className="rounded-full bg-gold/80 px-2 py-0.5 text-[11px] font-semibold text-ink-400">Natif & sécurisé</span></div><div className="space-y-2">{RELEASE.map(({ icon: Icon, color, text }) => <div key={text} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3"><Icon size={16} className="mt-0.5 shrink-0" style={{ color }} /><p className="text-xs leading-relaxed text-white/68">{text}</p></div>)}</div></section>
    <p className="mt-6 border-t border-white/[0.05] pt-4 text-[11px] text-white/24">github.com/N7T0-OF/ZAILON</p>
  </div>
}
