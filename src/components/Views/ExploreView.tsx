import { Archive, CheckCircle2, DatabaseZap, Download, PlugZap, ShieldCheck } from 'lucide-react'

const roadmap = [
  { icon: PlugZap, title: 'Connecteurs séparés', text: 'Un adaptateur par fournisseur, avec erreurs et quotas propres.' },
  { icon: DatabaseZap, title: 'Résultats persistants', text: 'Cache local, recherche et filtres sans contenu de démonstration.' },
  { icon: Download, title: 'Téléchargements fiables', text: 'Progression réelle, reprise, vérification et historique.' },
  { icon: ShieldCheck, title: 'Installation contrôlée', text: 'Validation des archives et choix explicite du profil cible.' },
]

export function ExploreView() {
  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <header className="max-w-3xl">
      <div className="flex items-center gap-2 text-gold/64"><Archive size={13} /><p className="font-mono text-[8px] uppercase tracking-[0.24em]">Section archivée temporairement</p></div>
      <h1 className="mt-2 font-display text-3xl font-bold text-white">Explorer sera reconstruit sur des sources réelles.</h1>
      <p className="mt-2 text-[11px] leading-relaxed text-white/40">L’ancienne intégration GameBanana/Nexus a été retirée de l’interface car elle ne garantissait ni résultats cohérents, ni téléchargement fiable. ZAILON n’affiche donc plus de faux catalogue ni de bouton d’installation trompeur.</p>
    </header>

    <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {roadmap.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4"><Icon size={15} className="text-gold/68" /><h2 className="mt-3 text-xs font-semibold text-white/76">{title}</h2><p className="mt-1 text-[10px] leading-relaxed text-white/34">{text}</p></article>)}
    </section>

    <section className="mt-4 rounded-xl border border-emerald-400/12 bg-emerald-400/[0.025] p-4">
      <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-300/72" /><h2 className="text-xs font-semibold text-white/72">Ce qui reste disponible</h2></div>
      <p className="mt-2 text-[10px] leading-relaxed text-white/36">L’ajout manuel, la détection locale, la gestion des profils, l’analyse des conflits et le lancement de jeux continuent de fonctionner sans dépendre d’un catalogue en ligne.</p>
    </section>
  </div>
}
