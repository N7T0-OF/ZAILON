import { AlertTriangle, Check, FolderOpen, Loader2, MonitorDown, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Game } from '../types'
import { native, type ShortcutCreationResult } from '../lib/native'
import { directShortcutViable, shortcutModeLabel, shortcutPlanFor, type ShortcutScope } from '../lib/shortcuts'
import { ZailonSwitch } from './UI/ZailonSwitch'

interface CreatedShortcut {
  profileName: string
  result: ShortcutCreationResult
}

/**
 * Micro-fenêtre « Créer un raccourci bureau » (spec « Fix création de
 * raccourci ») : un VRAI `.lnk` système (cible, arguments, répertoire de
 * démarrage, icône) — jamais un `.url`. Périmètre : profil actuel / profil par
 * défaut / **tous les profils** (un .lnk par profil — « Cyberpunk — Modded.lnk »
 * vs « Cyberpunk — Vanilla.lnk »). Vérification post-création affichée.
 */
export function CreateShortcutDialog({ game, profileId, onClose }: { game: Game; profileId?: string; onClose: () => void }) {
  const directViable = directShortcutViable(game)
  const [scope, setScope] = useState<ShortcutScope>('current')
  const [viaZailon, setViaZailon] = useState(true)
  const [useIcon, setUseIcon] = useState(true)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<CreatedShortcut[]>([])
  const [errors, setErrors] = useState<string[]>([])

  const plan = shortcutPlanFor(game, scope, profileId)
  const effectiveMode = viaZailon ? 'zailon' : 'direct'

  const create = async () => {
    if (!plan.length) return
    setBusy(true)
    setErrors([])
    setResults([])
    const created: CreatedShortcut[] = []
    const failures: string[] = []
    for (const entry of plan) {
      try {
        const result = await native.createDesktopShortcut(game.id, entry.profileId, entry.displayName, {
          iconPath: useIcon ? game.resources?.iconPath : undefined,
          execPath: game.execPath,
          mode: effectiveMode,
        })
        created.push({ profileName: entry.profileName, result })
      } catch (reason) {
        failures.push(`${entry.profileName} : ${String(reason)}`)
      }
    }
    setResults(created)
    setErrors(failures)
    setBusy(false)
  }

  const desktopDir = results[0]?.result.path.replace(/[\\/][^\\/]+$/, '')

  return createPortal(<div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onClick={onClose}>
    <section className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#121414] shadow-[0_28px_80px_rgba(0,0,0,0.6)]" onClick={event => event.stopPropagation()}>
      <header className="flex items-start gap-3 border-b border-white/[0.07] p-4">
        <MonitorDown size={16} className="mt-0.5 text-gold" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-white/85">Créer un raccourci bureau</h2>
          <p className="mt-0.5 truncate text-[11px] text-white/38">{game.name} — vrai raccourci système (.lnk / .desktop), jamais un simple lien.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/35 hover:bg-white/[0.06] hover:text-white" aria-label="Fermer"><X size={15} /></button>
      </header>

      <div className="space-y-3 p-4">
        {/* Périmètre de profil */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="text-[11px] font-semibold text-white/70">Profil cible</p>
          <div className="mt-2 space-y-1.5">
            {([['current', 'Profil actuel'], ['default', 'Profil par défaut'], ['all', `Tous les profils (${game.profiles.length})`]] as Array<[ShortcutScope, string]>).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setScope(value)} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11px] transition-colors ${scope === value ? 'border-gold/40 bg-gold/[0.07] text-white/85' : 'border-white/[0.07] text-white/50 hover:bg-white/[0.03]'}`}>
                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${scope === value ? 'border-gold bg-gold' : 'border-white/25'}`}>{scope === value && <Check size={9} className="text-[var(--zailon-accent-text)]" />}</span>
                <span className="min-w-0">
                  <span className="block font-semibold">{label}</span>
                  <span className="block truncate text-[10px] text-white/34">
                    {value === 'all' ? 'Un raccourci par profil — jamais fusionnés.' : `Un seul .lnk pour ${label.toLocaleLowerCase()}.`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Méthode de lancement */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="text-[11px] font-semibold text-white/70">Méthode de lancement</p>
          <div className="mt-2 space-y-1.5">
            <button type="button" onClick={() => setViaZailon(true)} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11px] transition-colors ${viaZailon ? 'border-gold/40 bg-gold/[0.07] text-white/85' : 'border-white/[0.07] text-white/50 hover:bg-white/[0.03]'}`}>
              <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${viaZailon ? 'border-gold bg-gold' : 'border-white/25'}`}>{viaZailon && <Check size={9} className="text-[var(--zailon-accent-text)]" />}</span>
              <span className="min-w-0">
                <span className="block font-semibold">Via ZAILON</span>
                <span className="block text-[10px] text-white/34">Conserve profil, mods et la chaîne de lancement (Frosty → jeu, FiveM → GTA, NTE → UAC…). Recommandé.</span>
              </span>
            </button>
            <button type="button" disabled={!directViable} onClick={() => setViaZailon(false)} title={!directViable ? 'Ce jeu nécessite une chaîne de lancement — le direct n’est pas compatible.' : undefined} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11px] transition-colors ${!viaZailon ? 'border-gold/40 bg-gold/[0.07] text-white/85' : 'border-white/[0.07] text-white/50 hover:bg-white/[0.03]'} disabled:cursor-not-allowed disabled:opacity-40`}>
              <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${!viaZailon ? 'border-gold bg-gold' : 'border-white/25'}`}>{!viaZailon && <Check size={9} className="text-[var(--zailon-accent-text)]" />}</span>
              <span className="min-w-0">
                <span className="block font-semibold">Lancer directement le jeu</span>
                <span className="block text-[10px] text-white/34">{directViable ? 'Cible = l’exécutable réel du jeu, double-clic direct.' : 'Indisponible : ce jeu nécessite une chaîne de lancement.'}</span>
              </span>
            </button>
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-white/70">Utiliser l’icône du jeu</span>
            <span className="mt-0.5 block text-[10px] text-white/34">Icône de l’exécutable → icône enregistrée → icône ZAILON. Jamais de raccourci blanc.</span>
          </span>
          <ZailonSwitch checked={useIcon} onChange={setUseIcon} />
        </label>

        {results.length > 0 && (
          <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-200/90"><Check size={12} />{results.length} raccourci(s) créé(s) et vérifié(s)</p>
            <ul className="mt-2 space-y-1.5">
              {results.map(({ profileName, result }) => (
                <li key={result.path} className="rounded-lg bg-black/20 px-2.5 py-1.5">
                  <p className="truncate text-[11px] font-semibold text-white/70">{profileName}</p>
                  <p className="break-all font-mono text-[10px] text-white/40">{result.path}</p>
                  <p className="mt-0.5 text-[10px] text-white/34">{shortcutModeLabel(result.mode)}{result.message ? ` — ${result.message}` : ''}</p>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              {desktopDir && <button type="button" onClick={() => void native.openPath(desktopDir)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-1.5 text-[10px] font-semibold text-white/60 hover:bg-white/[0.05]"><FolderOpen size={11} />Ouvrir le dossier</button>}
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[10px] text-white/45 hover:text-white">Fermer</button>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-xl border border-red-300/15 bg-red-300/[0.04] p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-200/90"><AlertTriangle size={12} />Impossible de créer {errors.length} raccourci(s)</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              {errors.map((error, index) => <li key={index} className="text-[11px] leading-relaxed text-red-100/70">{error}</li>)}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex justify-end gap-2 border-t border-white/[0.07] p-4">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-[11px] text-white/50 hover:text-white">Annuler</button>
        <button type="button" onClick={() => void create()} disabled={busy || !plan.length} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:bg-gold/90 disabled:opacity-45">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <MonitorDown size={12} />}{busy ? 'Création…' : `Créer ${plan.length > 1 ? `${plan.length} raccourcis` : 'le raccourci'}`}
        </button>
      </footer>
    </section>
  </div>, document.body)
}
