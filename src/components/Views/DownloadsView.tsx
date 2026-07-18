import { Download, FolderOpen } from 'lucide-react'

export function DownloadsView() {
  return <div className="h-full overflow-y-auto p-5 sm:p-7">
    <header><p className="font-mono text-[11px] uppercase tracking-[0.24em] text-gold/58">Activité locale</p><h1 className="mt-1 font-display text-2xl font-bold text-white">Téléchargements</h1><p className="mt-1 max-w-2xl text-[11px] text-white/38">Les transferts réellement lancés par ZAILON apparaîtront ici. Aucun téléchargement fictif n’est injecté.</p></header>
    <section className="mt-6 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.018] text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/28"><Download size={19} /></div>
      <h2 className="mt-3 text-sm font-semibold text-white/66">Aucun transfert actif</h2>
      <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-white/32">Les installations directes sont disponibles depuis Explorer. Cette vue accueillera ensuite l’historique persistant, la progression et la reprise des transferts.</p>
      <span className="mt-3 flex items-center gap-1 text-[11px] text-white/24"><FolderOpen size={10} /> Les fichiers ne sont jamais simulés.</span>
    </section>
  </div>
}
