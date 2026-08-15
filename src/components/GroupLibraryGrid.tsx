import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Clock, FolderPlus, Layers, Pencil, Pin, PinOff, Play, Trash2, Users } from 'lucide-react'
import type { Game, GameGroup } from '../types'
import { useStore } from '../store/useStore'
import { groupLastPlayed, groupMembers, groupModCount, groupProfileCount, groupTotalPlaytime } from '../lib/gameGroups'
import { formatTime, timeAgo } from '../utils'
import { GameGroupDialog } from './GameGroupDialog'

interface Props {
  games: Game[]
  onOpen: (gameId: string) => void
}

/** Grille des groupes de jeux (spec « Groupes de jeux » §8-13) : cartes avec
 * statistiques agrégées (jamais fusionnées par profil) et actions
 * pin / renommer / réordonner / supprimer. La suppression ne touche jamais
 * aux jeux ni à leurs fichiers. */
export function GroupLibraryGrid({ games, onOpen }: Props) {
  const gameGroups = useStore(state => state.gameGroups)
  const createGameGroup = useStore(state => state.createGameGroup)
  const renameGameGroup = useStore(state => state.renameGameGroup)
  const deleteGameGroup = useStore(state => state.deleteGameGroup)
  const toggleGameGroupPinned = useStore(state => state.toggleGameGroupPinned)
  const moveGameGroup = useStore(state => state.moveGameGroup)
  const addGameToGroup = useStore(state => state.addGameToGroup)
  const removeGameFromGroup = useStore(state => state.removeGameFromGroup)

  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; group: GameGroup } | undefined>()

  const ordered = useMemo(() => {
    const pinned = gameGroups.filter(group => group.pinned)
    const rest = gameGroups.filter(group => !group.pinned)
    return [...pinned, ...rest]
  }, [gameGroups])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-white/38">
          Un groupe regroupe plusieurs environnements d'une même famille de jeu. Les profils, mods et statistiques de chaque membre restent <span className="text-white/55">totalement indépendants</span>.
        </p>
        <button type="button" onClick={() => setDialog({ mode: 'create' })} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]"><FolderPlus size={12} />Nouveau groupe</button>
      </div>

      {ordered.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ordered.map((group, index) => {
            const members = groupMembers(games, group)
            const first = members[0]
            const total = groupTotalPlaytime(games, group)
            const profiles = groupProfileCount(games, group)
            const mods = groupModCount(games, group)
            const last = groupLastPlayed(games, group)
            return (
              <div key={group.id} className="group/card relative flex flex-col gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold/18 bg-gold/[0.06] text-gold"><Layers size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold text-white/85">{group.name}</p>
                    <p className="mt-0.5 text-[10px] text-white/34">{members.length} jeu(x) · {profiles} profil(s) · {mods} mod(s)</p>
                  </div>
                  <button type="button" onClick={() => toggleGameGroupPinned(group.id)} title={group.pinned ? 'Désépingler' : 'Épingler en tête de bibliothèque'} className={`rounded-md p-1.5 ${group.pinned ? 'text-gold' : 'text-white/25 hover:bg-white/[0.05] hover:text-white/60'}`}><Pin size={13} fill={group.pinned ? 'currentColor' : 'none'} /></button>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/38">
                  {total > 0 && <span className="flex items-center gap-1"><Play size={10} />{formatTime(total)}</span>}
                  {last && <span className="flex items-center gap-1"><Clock size={10} />{timeAgo(last)}</span>}
                </div>

                {members.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {members.slice(0, 4).map(member => (
                      <span key={member.id} className="max-w-32 truncate rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/50">{member.name}</span>
                    ))}
                    {members.length > 4 && <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/35">+{members.length - 4}</span>}
                  </div>
                )}

                <div className="mt-auto flex items-center gap-1 border-t border-white/[0.05] pt-2">
                  {first && <button type="button" onClick={() => onOpen(first.id)} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1.5 text-[10px] font-semibold text-white/65 hover:bg-white/[0.09]"><Play size={10} />Ouvrir</button>}
                  <button type="button" onClick={() => setDialog({ mode: 'edit', group })} title="Modifier le groupe (nom + membres)" className="rounded-md p-1.5 text-white/30 hover:bg-white/[0.05] hover:text-white/60"><Pencil size={12} /></button>
                  <div className="ml-auto flex items-center gap-0.5">
                    <button type="button" onClick={() => moveGameGroup(group.id, -1)} disabled={index === 0} title="Monter" className="rounded-md p-1 text-white/25 hover:bg-white/[0.05] hover:text-white/55 disabled:opacity-20"><ArrowUp size={12} /></button>
                    <button type="button" onClick={() => moveGameGroup(group.id, 1)} disabled={index === ordered.length - 1} title="Descendre" className="rounded-md p-1 text-white/25 hover:bg-white/[0.05] hover:text-white/55 disabled:opacity-20"><ArrowDown size={12} /></button>
                    <button type="button" onClick={() => { if (window.confirm(`Supprimer le groupe « ${group.name} » ? Les jeux et leurs profils ne sont pas supprimés.`)) deleteGameGroup(group.id) }} title="Supprimer le groupe (les jeux sont conservés)" className="rounded-md p-1 text-white/25 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-[11px] text-white/35">
          <Users size={22} />
          <span>Aucun groupe. Créez-en un pour regrouper plusieurs environnements d'un même jeu.</span>
          <button type="button" onClick={() => setDialog({ mode: 'create' })} className="mt-1 rounded-lg border border-white/[0.1] px-3 py-1.5 text-white/55 hover:bg-white/[0.05]">Créer un groupe</button>
        </div>
      )}

      {dialog && (
        <GameGroupDialog
          mode={dialog.mode}
          group={dialog.mode === 'edit' ? dialog.group : undefined}
          games={games}
          onClose={() => setDialog(undefined)}
          onSubmit={(name, memberGameIds) => {
            if (dialog.mode === 'create') {
              const id = createGameGroup(name, memberGameIds)
              // createGameGroup assigne déjà groupId aux membres fournis.
              void id
            } else {
              renameGameGroup(dialog.group.id, name)
              // Réconcilie les membres : ajoute les manquants, retire les exclus.
              const current = new Set(dialog.group.memberGameIds)
              const next = new Set(memberGameIds)
              for (const gameId of memberGameIds) if (!current.has(gameId)) addGameToGroup(dialog.group.id, gameId)
              for (const gameId of dialog.group.memberGameIds) if (!next.has(gameId)) removeGameFromGroup(gameId)
            }
          }}
        />
      )}
    </div>
  )
}
