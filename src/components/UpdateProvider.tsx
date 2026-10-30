import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Download, FileText, RefreshCw, X } from 'lucide-react'
import { relaunch } from '@tauri-apps/plugin-process'
import { native, type UpdateMetadata } from '../lib/native'
import { appVersion, useStore } from '../store/useStore'
import { countListItems, parseMarkdown, summarizeBlocks } from '../lib/safeMarkdown'
import { parseSemver, shouldShowReleaseNotes } from '../lib/releaseNotes'
import { SafeMarkdown } from './UI/SafeMarkdown'
import { ScrollableModal } from './UI/ScrollableModal'
import { ZailonSwitch } from './UI/ZailonSwitch'

type UpdateStatus = 'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'verifying' | 'relaunching' | 'error'

interface UpdateProgress {
  downloaded: number
  total?: number
  bytesPerSecond?: number
  step: string
}

interface UpdaterContextValue {
  status: UpdateStatus
  update?: UpdateMetadata
  progress: UpdateProgress
  error?: string
  checkUpdates: () => Promise<void>
  installUpdate: () => Promise<void>
  dismiss: () => void
  openLog: () => Promise<void>
}

const UpdaterContext = createContext<UpdaterContextValue | undefined>(undefined)

const emptyProgress: UpdateProgress = { downloaded: 0, step: 'Ready' }

const GITHUB_RELEASES_URL = 'https://github.com/N7T0-OF/ZAILON/releases'

function formatBytes(bytes?: number) {
  if (!bytes) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index < 2 ? 0 : 1)} ${units[index]}`
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/network|fetch|connect|timeout/i.test(message)) return 'Unable to contact the ZAILON update service. Check your Internet connection and try again.'
  if (/No update is ready/i.test(message)) return 'This update is no longer ready. Check for updates again.'
  return message
}

/** Un patch (x.y.z → x.y.z+1) est une mise à jour mineure : toast plutôt que modale. */
function isPatchUpdate(previous: string | undefined, current: string) {
  const before = parseSemver(previous ?? '')
  const after = parseSemver(current)
  return Boolean(before && after && before.major === after.major && before.minor === after.minor)
}


export function useUpdater() {
  const context = useContext(UpdaterContext)
  if (!context) throw new Error('useUpdater must be used inside UpdateProvider.')
  return context
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const autoCheckUpdates = useStore(state => state.autoCheckUpdates)
  const autoInstallUpdates = useStore(state => state.autoInstallUpdates)
  const updateChannel = useStore(state => state.updateChannel)
  const recordUpdateCheck = useStore(state => state.recordUpdateCheck)
  const prepareInstalledUpdate = useStore(state => state.prepareInstalledUpdate)
  const lastInstalledUpdate = useStore(state => state.lastInstalledUpdate)
  const dismissInstalledUpdate = useStore(state => state.dismissInstalledUpdate)
  const lastSeenReleaseNotesVersion = useStore(state => state.lastSeenReleaseNotesVersion)
  const showReleaseNotesOnUpdate = useStore(state => state.showReleaseNotesOnUpdate)
  const setLastSeenReleaseNotes = useStore(state => state.setLastSeenReleaseNotes)
  const setShowReleaseNotesOnUpdate = useStore(state => state.setShowReleaseNotesOnUpdate)
  const installedAddons = useStore(state => state.addons)
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [update, setUpdate] = useState<UpdateMetadata>()
  const [progress, setProgress] = useState<UpdateProgress>(emptyProgress)
  const [error, setError] = useState<string>()
  const [integrity, setIntegrity] = useState<Awaited<ReturnType<typeof native.verifyUpdateState>>>()
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesFull, setNotesFull] = useState(false)
  const [patchToast, setPatchToast] = useState(false)
  const [startupNotesUnavailable, setStartupNotesUnavailable] = useState(false)
  const automaticCheckStarted = useRef(false)
  const releaseNotesHandled = useRef(false)

  const installUpdate = useCallback(async (candidate = update) => {
    if (!candidate || !native.isDesktop()) return
    setError(undefined)
    setStatus('downloading')
    setProgress({ downloaded: 0, step: 'Preparing a local backup' })
    try {
      const snapshot = window.localStorage.getItem('zailon-v1') ?? '{}'
      await native.prepareUpdateBackup(snapshot, appVersion, candidate.version)
      prepareInstalledUpdate({ version: candidate.version, notes: candidate.notes, date: candidate.date })
      void native.recordUpdateEvent('download-started', candidate.version, `Channel: ${updateChannel}`)

      let downloaded = 0
      let total: number | undefined
      let startedAt = 0
      await native.installUpdate(event => {
        if (event.event === 'Started') {
          total = event.data.contentLength
          startedAt = Date.now()
          setProgress({ downloaded, total, step: 'Downloading the signed update' })
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          const elapsed = Math.max(1, Date.now() - startedAt)
          setProgress({ downloaded, total, bytesPerSecond: downloaded / (elapsed / 1_000), step: 'Downloading the signed update' })
        } else {
          setStatus('verifying')
          setProgress({ downloaded, total, step: 'Verifying signature and package' })
        }
      })
      setStatus('relaunching')
      setProgress({ downloaded, total, step: 'Restarting ZAILON' })
      await native.recordUpdateEvent('install-finished', candidate.version, 'The updater handed the package to the operating system.')
      await relaunch()
    } catch (caught) {
      const message = errorMessage(caught)
      void native.recordUpdateEvent('install-failed', candidate.version, message)
      setError(message)
      setStatus('error')
    }
  }, [prepareInstalledUpdate, update, updateChannel])

  const checkUpdates = useCallback(async () => {
    if (!native.isDesktop()) {
      setError('Updates are available only in the installed ZAILON desktop application.')
      setStatus('error')
      return
    }
    setStatus('checking')
    setError(undefined)
    setProgress({ downloaded: 0, step: 'Checking for updates' })
    try {
      const candidate = await native.checkForUpdate(updateChannel)
      recordUpdateCheck(candidate?.version)
      if (!candidate) {
        setUpdate(undefined)
        setStatus('upToDate')
        return
      }
      setUpdate(candidate)
      setStatus('available')
      if (autoInstallUpdates) void installUpdate(candidate)
    } catch (caught) {
      const message = errorMessage(caught)
      recordUpdateCheck(undefined, message)
      setError(message)
      setStatus('error')
    }
  }, [autoInstallUpdates, installUpdate, recordUpdateCheck, updateChannel])

  useEffect(() => {
    // Mode Minimal (spec §42) : aucune vérification automatique de mise à jour.
    const minimalMode = useStore.getState().minimalMode
    if (!autoCheckUpdates || minimalMode || automaticCheckStarted.current || !native.isDesktop()) return
    automaticCheckStarted.current = true
    const timer = window.setTimeout(() => void checkUpdates(), 750)
    return () => window.clearTimeout(timer)
  }, [autoCheckUpdates, checkUpdates])

  // Après redémarrage : afficher les nouveautés (une seule fois par session),
  // après le chargement de l'interface — jamais pendant le boot.
  useEffect(() => {
    if (!lastInstalledUpdate || lastInstalledUpdate.version !== appVersion || releaseNotesHandled.current) return
    releaseNotesHandled.current = true
    if (!showReleaseNotesOnUpdate || lastSeenReleaseNotesVersion === appVersion) {
      dismissInstalledUpdate()
      return
    }
    void native.recordUpdateEvent('update-confirmed-after-restart', appVersion, 'Updated version launched successfully.')
    const snapshot = window.localStorage.getItem('zailon-v1') ?? '{}'
    void native.verifyUpdateState(snapshot, appVersion).then(setIntegrity).catch(() => setIntegrity(undefined))
    setUpdate({ version: lastInstalledUpdate.version, currentVersion: appVersion, date: lastInstalledUpdate.date, notes: lastInstalledUpdate.notes })
    setStatus('available')
    setNotesFull(false)
    // Patch (x.y.z → x.y.z+1) : toast discret plutôt qu'une grosse modale.
    if (isPatchUpdate(lastInstalledUpdate.previousVersion, appVersion)) {
      setPatchToast(true)
      window.setTimeout(() => setPatchToast(false), 9000)
    } else {
      setNotesOpen(true)
    }
  }, [lastInstalledUpdate, lastSeenReleaseNotesVersion, showReleaseNotesOnUpdate, dismissInstalledUpdate])

  // Après une mise à jour installée HORS de l'updater interne (installeur
  // téléchargé), `lastInstalledUpdate` n'est jamais renseigné. On compare donc
  // la version installée à la dernière version dont les notes ont été vues
  // (spec « Fix changelog » §1) : si `appVersion` > `lastSeenReleaseNotesVersion`,
  // on récupère les notes de la release GitHub et on les affiche une seule fois.
  // En cas d'échec réseau, la fenêtre s'ouvre quand même avec un repli « Voir
  // sur GitHub » (jamais de blocage).
  useEffect(() => {
    if (releaseNotesHandled.current) return
    if (!native.isDesktop()) return
    if (!shouldShowReleaseNotes({ installedVersion: appVersion, lastSeenVersion: lastSeenReleaseNotesVersion, enabled: showReleaseNotesOnUpdate })) return
    releaseNotesHandled.current = true
    void (async () => {
      const fetched = await native.fetchReleaseNotes(appVersion).catch(() => null)
      setUpdate({ version: appVersion, currentVersion: appVersion, notes: fetched ?? undefined })
      setStartupNotesUnavailable(fetched === null)
      setNotesFull(false)
      setNotesOpen(true)
    })()
  }, [appVersion, lastSeenReleaseNotesVersion, showReleaseNotesOnUpdate])

  const closeReleaseNotes = () => {
    setNotesOpen(false)
    setLastSeenReleaseNotes(appVersion)
    dismissInstalledUpdate()
  }

  const dismiss = () => {
    if (lastInstalledUpdate?.version === appVersion) {
      setLastSeenReleaseNotes(appVersion)
      dismissInstalledUpdate()
    }
    if (status !== 'downloading' && status !== 'verifying' && status !== 'relaunching') setStatus('idle')
    setError(undefined)
  }

  const openLog = async () => {
    try {
      await native.openUpdateLog()
    } catch (caught) {
      setError(errorMessage(caught))
      setStatus('error')
    }
  }

  const value: UpdaterContextValue = { status, update, progress, error, checkUpdates, installUpdate, dismiss, openLog }
  // Après un redémarrage de mise à jour, jamais le dialogue « Install update » :
  // on affiche les nouveautés (modale ou toast), pas une offre de réinstallation.
  const afterRestart = lastInstalledUpdate?.version === appVersion
  const showDialog = (status === 'available' || status === 'downloading' || status === 'verifying' || status === 'relaunching' || status === 'error') && !notesOpen && !afterRestart
  const percentage = progress.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : undefined
  const notes = update?.notes || ''
  const parsed = useMemo(() => {
    try {
      return parseMarkdown(notes)
    } catch {
      return []
    }
  }, [notes])
  const notesFailed = startupNotesUnavailable || (notes.trim() !== '' && parsed.length === 0)
  const summary = summarizeBlocks(parsed, 8)

  return (
    <UpdaterContext.Provider value={value}>
      {children}

      {/* Notes de mise à jour : modale scrollable — header et footer fixes, le
          corps défile. La modale ne dépasse jamais la fenêtre. §23-24 : le
          changelog sépare ZAILON Core des add-ons réellement installés. */}
      {notesOpen && (
        <ScrollableModal
          title={`ZAILON Core ${appVersion}`}
          subtitle={lastInstalledUpdate?.date ? `Mise à jour du ${new Date(lastInstalledUpdate.date).toLocaleDateString()}` : 'Cette version apporte des changements importants.'}
          footer={
            <>
              <label className="mr-auto flex cursor-pointer items-center gap-2 text-[11px] text-white/45">
                <ZailonSwitch checked={!showReleaseNotesOnUpdate} onChange={next => setShowReleaseNotesOnUpdate(!next)} />
                Ne plus afficher automatiquement les nouveautés
              </label>
              {summary.truncated && !notesFull && (
                <button type="button" onClick={() => setNotesFull(true)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.06]">
                  Voir tous les changements
                </button>
              )}
              <button type="button" onClick={closeReleaseNotes} className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)] hover:bg-gold/90">
                <CheckCircle2 size={13} /> Fermer
              </button>
            </>
          }
          onClose={closeReleaseNotes}
        >
          {installedAddons.length > 0 && (
            <div className="mb-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Add-ons installés</p>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {installedAddons.map(addon => (
                  <li key={addon.manifest.id} className="flex items-center gap-1.5 text-[11px] text-white/62">
                    <span className="h-1 w-1 rounded-full bg-gold/70" />
                    {addon.manifest.name} <span className="font-mono text-[10px] text-white/30">v{addon.manifest.version}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {notesFailed ? (
            <div className="flex flex-col items-start gap-3 py-2">
              <p className="text-xs leading-relaxed text-white/55">Impossible d’afficher les notes de cette version.</p>
              <button type="button" onClick={() => void native.openExternalUrl(GITHUB_RELEASES_URL)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/[0.06]"><FileText size={12} /> Voir sur GitHub</button>
            </div>
          ) : notesFull ? (
            <SafeMarkdown text={notes} />
          ) : (
            <>
              <SafeMarkdown blocks={summary.blocks} />
              {summary.truncated && <p className="mt-2 border-t border-white/[0.06] pt-2 text-[10px] uppercase tracking-widest text-white/30">↓ Faire défiler ou ouvrir tous les changements</p>}
            </>
          )}
          {integrity && (
            <div className={`mt-3 rounded-lg border p-3 text-xs ${integrity.ok ? 'border-emerald-300/15 bg-emerald-300/[0.04] text-emerald-100/70' : 'border-red-300/15 bg-red-300/[0.04] text-red-100/70'}`}>
              <p className="font-semibold">{integrity.ok ? 'Configuration vérifiée après mise à jour' : 'Incohérence détectée après mise à jour'}</p>
              <p className="mt-1">Jeux : {integrity.current.games}/{integrity.before.games} · Profils : {integrity.current.profiles}/{integrity.before.profiles} · Mods : {integrity.current.mods}/{integrity.before.mods}</p>
              {integrity.issues.length > 0 && <p className="mt-2">{integrity.issues.join(' ')}</p>}
            </div>
          )}
        </ScrollableModal>
      )}

      {/* Toast discret pour les mises à jour mineures (patch). */}
      {patchToast && !notesOpen && (
        <div className="fixed bottom-4 right-4 z-[210] flex max-w-sm items-start gap-3 rounded-xl border border-white/[0.1] bg-[#141818]/95 p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.5)] backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/85"><CheckCircle2 size={12} className="text-emerald-300/80" /> ZAILON {appVersion} installé</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/50">{countListItems(parsed)} changement(s) appliqué(s).</p>
            <button type="button" onClick={() => { setPatchToast(false); setNotesFull(true); setNotesOpen(true) }} className="mt-2 text-[11px] font-semibold text-gold hover:text-gold-light">Voir les changements</button>
          </div>
          <button type="button" aria-label="Fermer" onClick={() => setPatchToast(false)} className="text-white/40 hover:text-white"><X size={13} /></button>
        </div>
      )}

      {/* Dialogue de mise à jour classique (téléchargement / vérification / erreur). */}
      {showDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-label="ZAILON update" className="w-full max-w-md rounded-xl border border-gold/25 bg-ink-300 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="font-display text-lg font-bold text-white">{status === 'available' ? 'ZAILON update' : status === 'error' ? 'Update failed' : 'Installing update'}</p><p className="mt-1 text-xs text-white/45">v{appVersion} → v{update?.version ?? '—'}</p></div>
              {status !== 'downloading' && status !== 'verifying' && status !== 'relaunching' && <button aria-label="Close update dialog" onClick={dismiss} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"><X size={16} /></button>}
            </div>

            {status === 'available' ? (
              <p className="mt-4 text-xs leading-relaxed text-white/65">A signed package matching this operating system and architecture is ready. Your games, mod folders, profiles and settings are backed up before installation.</p>
            ) : status === 'error' ? (
              <p className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs leading-relaxed text-red-200">{error}</p>
            ) : (
              <div className="mt-4 space-y-2"><div className="flex justify-between text-xs text-white/60"><span>{progress.step}</span><span>{percentage === undefined ? '…' : `${percentage}%`}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full bg-gold transition-all ${percentage === undefined ? 'w-1/3 animate-pulse' : ''}`} style={percentage === undefined ? undefined : { width: `${percentage}%` }} /></div><div className="flex justify-between text-[11px] text-white/35"><span>{formatBytes(progress.downloaded)}{progress.total ? ` / ${formatBytes(progress.total)}` : ''}</span><span>{progress.bytesPerSecond ? `${formatBytes(progress.bytesPerSecond)}/s` : ''}</span></div></div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {status === 'available' && <button onClick={() => void installUpdate()} className="flex items-center gap-1.5 rounded bg-gold px-3 py-2 text-xs font-semibold text-[var(--zailon-accent-text)] hover:bg-gold-light"><Download size={13} /> Install update</button>}
              {status === 'error' && <button onClick={() => void checkUpdates()} className="flex items-center gap-1.5 rounded bg-gold px-3 py-2 text-xs font-semibold text-[var(--zailon-accent-text)]"><RefreshCw size={13} /> Retry</button>}
              {(status === 'error' || status === 'available') && <button onClick={() => void openLog()} className="flex items-center gap-1.5 rounded border border-white/10 px-3 py-2 text-xs text-white/65 hover:bg-white/5"><FileText size={13} /> Open log</button>}
            </div>
          </section>
        </div>
      )}
    </UpdaterContext.Provider>
  )
}


