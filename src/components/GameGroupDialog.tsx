import { useMemo, useState } from 'react'
import { Search, Users, X } from 'lucide-react'
import type { Game, GameGroup } from '../types'

interface Props {
  mode: 'create' | 'edit'
  group?: GameGroup
  games: Game[]
  onClose: () => void
  onSubmit: (name: string, memberGameIds: string[]) => void
}

/** Dialogue de création / édition d'un groupe de jeux (spec « Groupes de
 * jeux » §12) : nom + sélection des membres. Jamais de déplacement de fichiers,
 * jamais de fusion de profils — purement organisationnel. */
export function GameGroupDialog({ mode, group, games, onClose, onSubmit }: Props) {
  const [name, setName] = useState(group?.name ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set(group?.memberGameIds ?? []))
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    const list = q
      ? games.filter(game => `${game.name} ${game.execPath ?? ''} ${game.provider ?? ''}`.toLocaleLowerCase().includes(q))
      : games
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [games, query])

  const toggle = (gameId: string) => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(gameId)) next.delete(gameId)
      else next.add(gameId)
      return next
    })
  }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed, [...selected])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#141818] shadow-[0_24px_70px_rgba(0,0,0,0.6)]" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-white/78"><Users size={14} className="text-gold" />{mode === 'create' ? 'Nouveau groupe' : `Modifier ${group?.name ?? ''}`}</p>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white" aria-label="Fermer"><X size={14} /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') submit() }}
            placeholder="Nom du groupe (ex. FiveM, Need for Speed…)"
            autoFocus
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] text-white/80 outline-none focus:border-gold/30"
          />

          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2.5 text-white/30" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filtrer les jeux…" className="w-full rounded-lg border border-white/[0.07] bg-white/[0.03] py-2 pl-7 pr-2 text-[11px] text-white/70 outline-none focus:border-gold/30" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/[0.06] bg-white/[0.015] p-1.5">
            {filtered.length ? filtered.map(game => (
              <label key={game.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.04]">
                <input type="checkbox" checked={selected.has(game.id)} onChange={() => toggle(game.id)} className="h-3.5 w-3.5 accent-[var(--zailon-accent)]" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-white/70">{game.name}</span>
                {game.itemKind === 'software' && <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/40">app</span>}
              </label>
            )) : <p className="px-2 py-6 text-center text-[11px] text-white/35">Aucun jeu ne correspond.</p>}
          </div>
          <p className="text-[10px] leading-relaxed text-white/32">{selected.size} jeu(x) sélectionné(s) · un groupe est purement organisationnel : profils, mods et statistiques restent indépendants.</p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] text-white/55 hover:bg-white/[0.05]">Annuler</button>
          <button type="button" onClick={submit} disabled={!name.trim()} className="rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] disabled:opacity-40">{mode === 'create' ? 'Créer le groupe' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}
