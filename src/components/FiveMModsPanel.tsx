import { useEffect, useState } from 'react'
import { File, Folder, FolderOpen, HardDrive, RefreshCw, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { native } from '../lib/native'
import { fiveMModLabel, formatFiveMSize } from '../lib/fivemMods'
import type { Game } from '../types'

/**
 * Contenu RÉEL de `FiveM.app/mods` (spec « FiveM Profiles » §1-4, §11-12).
 * FiveM n'a pas de mods « activables » : ce panneau liste le dossier tel quel,
 * avec « Ouvrir le dossier » et une suppression SÉCURISÉE limitée aux entrées
 * de premier niveau. Jamais de système virtuel d'activation.
 */
export function FiveMModsPanel({ game }: { game: Game }) {
  const loadFiveMMods = useStore(state => state.loadFiveMMods)
  const fiveMModsIndex = useStore(state => state.fiveMModsIndex)
  const recordNotice = useStore(state => state.recordNotice)
  const [busy, setBusy] = useState<string | null>(null)

  const listing = game.installDirectory ? fiveMModsIndex[game.id] : undefined
  const modsPath = listing?.modsPath || null

  useEffect(() => {
    if (game.installDirectory && game.provider === 'FiveM Client') {
      void loadFiveMMods(game.id)
    }
  }, [game.id, game.installDirectory, game.provider, loadFiveMMods])

  if (game.provider !== 'FiveM Client') return null

  const entries = listing?.entries || []

  const removeEntry = async (relativePath: string, name: string) => {
    if (!game.installDirectory) return
    if (!window.confirm(`Supprimer « ${name} » du dossier FiveM.app/mods ?\n\nL'élément sera définitivement effacé du PC.`)) return
    setBusy(relativePath)
    try {
      const result = await native.removeFiveMMod(game.installDirectory, relativePath)
      const freed = formatFiveMSize(result.freedBytes)
      recordNotice(`${name} supprimé (${result.removedFiles} fichier${result.removedFiles !== 1 ? 's' : ''}, ${freed} libérés).`)
      void loadFiveMMods(game.id)
    } catch (error) {
      recordNotice(String(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-sky-300/18 bg-sky-300/[0.035] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <HardDrive size={13} className="text-sky-200/70" />
        <p className="text-[11px] font-semibold text-sky-100/75">Contenu de FiveM.app/mods</p>
        <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/35">
          {entries.length} élément{entries.length !== 1 ? 's' : ''} · {formatFiveMSize(entries.reduce((sum, entry) => sum + entry.sizeBytes, 0))}
        </span>
        <button
          type="button"
          onClick={() => void loadFiveMMods(game.id)}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] text-white/55 hover:bg-white/[0.05]"
          title="Relire le dossier mods"
        >
          <RefreshCw size={12} />Actualiser
        </button>
      </div>

      {modsPath ? (
        <p className="mt-2 truncate font-mono text-[10px] text-white/28" title={modsPath}>{modsPath}</p>
      ) : (
        <p className="mt-2 text-[11px] text-amber-100/60">Dossier mods non détecté — lancez FiveM une première fois pour qu'il génère sa structure.</p>
      )}

      {entries.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {entries.map(entry => (
            <li key={`${entry.kind}:${entry.relativePath}`} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2">
              {entry.kind === 'folder'
                ? <Folder size={14} className="shrink-0 text-sky-200/60" />
                : <File size={14} className="shrink-0 text-white/35" />}
              <span className="min-w-0 flex-1 truncate text-[11px] text-white/70" title={entry.relativePath}>{fiveMModLabel(entry)}</span>
              <span className="shrink-0 text-[10px] text-white/34">{formatFiveMSize(entry.sizeBytes)}</span>
              {entry.modifiedAt !== null && (
                <span className="hidden shrink-0 text-[10px] text-white/22 sm:inline">
                  {new Date(entry.modifiedAt * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </span>
              )}
              {entry.kind === 'folder' && (
                <button
                  type="button"
                  onClick={() => modsPath && void native.openPath(`${modsPath}/${entry.relativePath}`)}
                  className="shrink-0 rounded-md p-1.5 text-white/35 hover:bg-white/[0.06] hover:text-white"
                  title="Ouvrir le dossier"
                >
                  <FolderOpen size={12} />
                </button>
              )}
              <button
                type="button"
                disabled={busy === entry.relativePath}
                onClick={() => void removeEntry(entry.relativePath, entry.name)}
                className="shrink-0 rounded-md p-1.5 text-white/30 hover:bg-red-400/10 hover:text-red-200 disabled:opacity-40"
                title={`Supprimer ${entry.name}`}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : modsPath ? (
        <p className="mt-3 text-[11px] text-white/32">Le dossier mods est vide. Déposez-y vos packs (dossiers ou fichiers) puis actualisez.</p>
      ) : null}

      <p className="mt-3 text-[10px] leading-relaxed text-white/28">
        ZAILON n'active ni ne désactive rien : il organise uniquement ce que vous choisissez de gérer. La suppression est limitée aux éléments de premier niveau du dossier mods.
      </p>
    </div>
  )
}
