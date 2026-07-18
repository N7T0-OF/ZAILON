import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Download, FileText, RefreshCw, X } from 'lucide-react'
import { relaunch } from '@tauri-apps/plugin-process'
import { native, type UpdateMetadata } from '../lib/native'
import { appVersion, useStore } from '../store/useStore'

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
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [update, setUpdate] = useState<UpdateMetadata>()
  const [progress, setProgress] = useState<UpdateProgress>(emptyProgress)
  const [error, setError] = useState<string>()
  const automaticCheckStarted = useRef(false)
  const releaseNotesShown = useRef(false)

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
    if (!autoCheckUpdates || automaticCheckStarted.current || !native.isDesktop()) return
    automaticCheckStarted.current = true
    const timer = window.setTimeout(() => void checkUpdates(), 750)
    return () => window.clearTimeout(timer)
  }, [autoCheckUpdates, checkUpdates])

  useEffect(() => {
    if (!lastInstalledUpdate || lastInstalledUpdate.version !== appVersion || releaseNotesShown.current) return
    releaseNotesShown.current = true
    void native.recordUpdateEvent('update-confirmed-after-restart', appVersion, 'Updated version launched successfully.')
    setUpdate({ version: lastInstalledUpdate.version, currentVersion: appVersion, date: lastInstalledUpdate.date, notes: lastInstalledUpdate.notes })
    setStatus('available')
  }, [lastInstalledUpdate])

  const dismiss = () => {
    if (lastInstalledUpdate?.version === appVersion) dismissInstalledUpdate()
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
  const showDialog = status === 'available' || status === 'downloading' || status === 'verifying' || status === 'relaunching' || status === 'error'
  const percentage = progress.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : undefined
  const showingReleaseNotes = lastInstalledUpdate?.version === appVersion

  return (
    <UpdaterContext.Provider value={value}>
      {children}
      {showDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-label="ZAILON update" className="w-full max-w-md rounded-xl border border-gold/25 bg-ink-300 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="font-display text-lg font-bold text-white">{showingReleaseNotes ? 'ZAILON was updated' : 'ZAILON update'}</p><p className="mt-1 text-xs text-white/45">{showingReleaseNotes ? `ZAILON is now running v${appVersion}.` : `v${appVersion} → v${update?.version ?? '—'}`}</p></div>
              {status !== 'downloading' && status !== 'verifying' && status !== 'relaunching' && <button aria-label="Close update dialog" onClick={dismiss} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"><X size={16} /></button>}
            </div>

            {showingReleaseNotes ? (
              <div className="mt-4 rounded-lg bg-white/[0.035] p-3 text-xs leading-relaxed text-white/65 whitespace-pre-wrap">{update?.notes || 'No release notes were supplied for this update.'}</div>
            ) : status === 'available' ? (
              <p className="mt-4 text-xs leading-relaxed text-white/65">A signed package matching this operating system and architecture is ready. Your games, mod folders, profiles and settings are backed up before installation.</p>
            ) : status === 'error' ? (
              <p className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs leading-relaxed text-red-200">{error}</p>
            ) : (
              <div className="mt-4 space-y-2"><div className="flex justify-between text-xs text-white/60"><span>{progress.step}</span><span>{percentage === undefined ? '…' : `${percentage}%`}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full bg-gold transition-all ${percentage === undefined ? 'w-1/3 animate-pulse' : ''}`} style={percentage === undefined ? undefined : { width: `${percentage}%` }} /></div><div className="flex justify-between text-[11px] text-white/35"><span>{formatBytes(progress.downloaded)}{progress.total ? ` / ${formatBytes(progress.total)}` : ''}</span><span>{progress.bytesPerSecond ? `${formatBytes(progress.bytesPerSecond)}/s` : ''}</span></div></div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {status === 'available' && !showingReleaseNotes && <button onClick={() => void installUpdate()} className="flex items-center gap-1.5 rounded bg-gold px-3 py-2 text-xs font-semibold text-ink-400 hover:bg-gold-light"><Download size={13} /> Install update</button>}
              {status === 'error' && <button onClick={() => void checkUpdates()} className="flex items-center gap-1.5 rounded bg-gold px-3 py-2 text-xs font-semibold text-ink-400"><RefreshCw size={13} /> Retry</button>}
              {showingReleaseNotes && <button onClick={dismiss} className="flex items-center gap-1.5 rounded bg-gold px-3 py-2 text-xs font-semibold text-ink-400"><CheckCircle2 size={13} /> Close</button>}
              {(status === 'error' || status === 'available') && <button onClick={() => void openLog()} className="flex items-center gap-1.5 rounded border border-white/10 px-3 py-2 text-xs text-white/65 hover:bg-white/5"><FileText size={13} /> Open log</button>}
            </div>
          </section>
        </div>
      )}
    </UpdaterContext.Provider>
  )
}
