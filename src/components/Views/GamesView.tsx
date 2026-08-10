import { AlertTriangle, Archive, Boxes, CheckSquare2, ChevronDown, ChevronLeft, Copy, Download, ExternalLink, FolderInput, FolderOpen, FolderPlus, Gamepad2, Image as ImageIcon, Loader2, Lock, Monitor, Pause, Play, Plus, Radar, RefreshCw, RotateCcw, Search, ShieldAlert, Star, Tag, Trash2, Unlock, Wrench, X } from 'lucide-react'
import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { appVersion, getSelectedGame, getSelectedProfile, resolveProfileMods, useStore } from '../../store/useStore'
import { BackgroundTaskSnapshot, CollectionInstallPlan, Mo2ImportOptions, Mo2ImportPreview, Mo2ImportResult, ProfileDeploymentAudit, native, pickExecutable, pickFolder, pickFolders, pickProfileArchive, resourceUrl, saveProfileArchive } from '../../lib/native'
import { ModCard } from '../UI/ModCard'
import { FallbackArtwork } from '../UI/FallbackArtwork'
import { ParallaxCover } from '../UI/ParallaxCover'
import { ZailonSelectionCheckbox } from '../UI/ZailonSelectionCheckbox'
import { ZailonSwitch } from '../UI/ZailonSwitch'
import { isTouchDevice, motionReduced, parallaxActive, systemReducedMotion } from '../../lib/motion'
import { animationsReducedDuringGame, effectivePerformance } from '../../lib/performanceProfiles'
import { pickPrioritySession } from '../../lib/sessionPriority'
import { useWorkspaceCache } from '../../lib/workspaceCache'
import { formatTime, timeAgo } from '../../utils'
import { SteamDetectionDialog } from '../SteamDetectionDialog'
import type { Game, GameSession, GameTab, Mod, ModImportCandidate, Profile, ProfileArchiveManifest, SensitiveFileAssessment, SensitiveImportAction } from '../../types'
import { VisualGamePanel } from '../../visual-profiles/ui/VisualGamePanel'
import { GameConfigurationPanel } from './GameConfigurationPanel'
import { GameDiagnosticPanel, GameHealthBar, type SubSection } from './GameDiagnosticPanel'
import { GameResourcesDialog } from '../GameResourcesDialog'
import { ProfileSwitcherPopover } from '../UI/ProfileSwitcherPopover'

const TABS: Array<{ id: GameTab; label: string }> = [
  { id: 'overview', label: 'Aperçu' },
  { id: 'mods', label: 'Mods' },
  { id: 'profiles', label: 'Profils' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'diagnostic', label: 'État & Diagnostic' },
  { id: 'downloads', label: 'Téléchargements' },
  { id: 'visuals', label: 'Visuels' },
]

interface ModDiagnosticCheck {
  label: string
  ok: boolean
  unknown?: boolean
  evidence: string
}

interface ModDiagnosticView {
  mod: Mod
  audit?: ProfileDeploymentAudit
  packageId: string
  checks: ModDiagnosticCheck[]
  confidence: 'Confirmé' | 'Probable' | 'Possible' | 'Inconnu'
  cause: string
  winningFiles: number
  overriddenFiles: number
}

export function GamesView() {
  const games = useStore(state => state.games)
  const selectedGame = useStore(getSelectedGame)
  const selectedProfile = useStore(getSelectedProfile)
  const tab = useStore(state => state.activeGameTab)
  const setTab = useStore(state => state.setActiveGameTab)
  const setSelectedGame = useStore(state => state.setSelectedGame)
  const setSelectedProfile = useStore(state => state.setSelectedProfile)
  const setView = useStore(state => state.setView)
  const gamesBrowsing = useStore(state => state.gamesBrowsing)
  const setGamesBrowsing = useStore(state => state.setGamesBrowsing)
  const backgroundTasks = useStore(state => state.backgroundTasks)
  const activeSession = useStore(state => state.gameSessions.find(session => session.gameId === state.selectedGameId && session.state !== 'Ended' && session.state !== 'Failed'))
  const runtimeActivity = useStore(state => state.runtimeActivity)
  const launchSelectedGame = useStore(state => state.launchSelectedGame)
  const isLaunching = useStore(state => state.isLaunching)
  const launchProgress = useStore(state => state.launchProgress)
  const endSession = useStore(state => state.endSession)
  const addGameFromExecutable = useStore(state => state.addGameFromExecutable)
  const importDetectedGames = useStore(state => state.importDetectedGames)
  const removeGame = useStore(state => state.removeGame)
  const setGamePath = useStore(state => state.setGamePath)
  const setModsPath = useStore(state => state.setModsPath)
  const setGameResources = useStore(state => state.setGameResources)
  const addProfile = useStore(state => state.addProfile)
  const duplicateProfile = useStore(state => state.duplicateProfile)
  const importProfileManifest = useStore(state => state.importProfileManifest)
  const renameProfile = useStore(state => state.renameProfile)
  const removeProfile = useStore(state => state.removeProfile)
  const scanMods = useStore(state => state.scanMods)
  const toggleMod = useStore(state => state.toggleMod)
  const moveMod = useStore(state => state.moveMod)
  const setModNote = useStore(state => state.setModNote)
  const setConflictWinner = useStore(state => state.setConflictWinner)
  const libraryViewMode = useStore(state => state.libraryViewMode)
  const setLibraryViewMode = useStore(state => state.setLibraryViewMode)
  const bulkSetEnabled = useStore(state => state.bulkSetEnabled)
  const bulkTransferMods = useStore(state => state.bulkTransferMods)
  const bulkDeleteMods = useStore(state => state.bulkDeleteMods)
  const bulkAddTag = useStore(state => state.bulkAddTag)
  const undoLastBulkOperation = useStore(state => state.undoLastBulkOperation)
  const bulkHistory = useStore(state => state.bulkHistory)
  const toggleProfileLock = useStore(state => state.toggleProfileLock)
  const openProfileDirectory = useStore(state => state.openProfileDirectory)
  const checkProfileIntegrity = useStore(state => state.checkProfileIntegrity)
  const repairProfileStorage = useStore(state => state.repairProfileStorage)
  const deduplicateStagedMods = useStore(state => state.deduplicateStagedMods)
  const purgeUnreferencedStagedMods = useStore(state => state.purgeUnreferencedStagedMods)
  const completeMo2Import = useStore(state => state.completeMo2Import)
  const [search, setSearch] = useState('')
  const [modsVisible, setModsVisible] = useState(120)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'games' | 'apps' | 'favorites' | 'recent'>('all')
  const libraryScrollRef = useRef<HTMLDivElement>(null)
  const [profileName, setProfileName] = useState('')
  const [steamDialogOpen, setSteamDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const [mo2ImportOpen, setMo2ImportOpen] = useState(false)
  const [selectedModIds, setSelectedModIds] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>()
  const [bulkDialog, setBulkDialog] = useState<'move' | 'copy' | 'delete' | 'tag'>()
  const [tagFilter, setTagFilter] = useState('')
  const [deploymentToolBusy, setDeploymentToolBusy] = useState(false)
  const [diagSection, setDiagSection] = useState<SubSection>('resume')
  const [modDiagnostic, setModDiagnostic] = useState<ModDiagnosticView>()
  const modsListRef = useRef<HTMLDivElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const sessionRunning = activeSession?.state === 'GameRunning'
  const sessionWaiting = Boolean(activeSession && (activeSession.state === 'WaitingForGame' || activeSession.state === 'WaitingForElevation' || activeSession.state === 'LauncherStarted'))
  const sessionFailed = activeSession?.state === 'GameLost'
  const playBusy = isLaunching || sessionWaiting
  const launchPercent = launchProgress?.total
    ? Math.min(100, Math.round((launchProgress.current / launchProgress.total) * 100))
    : undefined
  const summaries = useWorkspaceCache()
  const profileMods = useMemo(() => resolveProfileMods(selectedGame, selectedProfile), [selectedGame, selectedProfile])
  const filteredMods = profileMods.filter(mod => mod.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (!tagFilter || mod.categoryTags?.some(tag => tag.id === tagFilter)))
  const availableTags = [...new Map(profileMods.flatMap(mod => mod.categoryTags || []).map(tag => [tag.id, tag])).values()].sort((left, right) => left.label.localeCompare(right.label))
  const conflictMods = profileMods.filter(mod => mod.conflict && mod.conflict !== 'none')
  const recentActivity = [...backgroundTasks].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 5)
  const resolvedConflicts = useMemo(() => {
    const files = new Map<string, { path: string; owners: typeof profileMods }>()
    profileMods.filter(mod => mod.enabled).forEach(mod => (mod.files || []).forEach(path => {
      const key = path.replace(/\\/g, '/').toLocaleLowerCase()
      const current = files.get(key) || { path: path.replace(/\\/g, '/'), owners: [] }
      current.owners.push(mod)
      files.set(key, current)
    }))
    return [...files.values()].filter(item => item.owners.length > 1).map(item => {
      const rule = selectedProfile?.conflictRules?.find(candidate => candidate.path.toLocaleLowerCase() === item.path.toLocaleLowerCase())
      return { ...item, winner: item.owners.find(owner => owner.id === rule?.winnerModId) || item.owners[item.owners.length - 1] }
    })
  }, [profileMods, selectedProfile])
  const visibleGames = games
    .filter(game => {
      const cover = game.resources?.coverPath || game.resources?.bannerPath || game.resources?.backgroundPath || game.backgroundArt
      const matchesQuery = game.name.toLocaleLowerCase().includes(librarySearch.trim().toLocaleLowerCase())
      const isApp = game.itemKind === 'software'
      const matchesFilter = libraryFilter === 'all'
        || (libraryFilter === 'games' && !isApp)
        || (libraryFilter === 'apps' && isApp)
        || (libraryFilter === 'favorites' && game.favorite)
        || (libraryFilter === 'recent' && game.lastPlayed !== undefined)
      return matchesQuery && matchesFilter
    })
    .sort((left, right) => {
      if (libraryFilter === 'recent') return (right.lastPlayed || 0) - (left.lastPlayed || 0)
      const leftFavorite = left.favorite ? 1 : 0
      const rightFavorite = right.favorite ? 1 : 0
      if (leftFavorite !== rightFavorite) return rightFavorite - leftFavorite
      return (right.lastPlayed || 0) - (left.lastPlayed || 0)
    })

  const selectedVisible = filteredMods.filter(mod => selectedModIds.has(mod.id)).length
  const allVisibleSelected = filteredMods.length > 0 && selectedVisible === filteredMods.length
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedVisible > 0 && !allVisibleSelected
  }, [allVisibleSelected, selectedVisible])
  useEffect(() => {
    setSelectedModIds(current => new Set([...current].filter(id => profileMods.some(mod => mod.id === id))))
  }, [selectedGame?.id, selectedProfile?.id, profileMods.length])
  useEffect(() => {
    setModsVisible(120)
  }, [selectedGame?.id, selectedProfile?.id, search, tagFilter])
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el || modsVisible >= filteredMods.length) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setModsVisible(value => Math.min(filteredMods.length, value + 120))
    }, { root: modsListRef.current, rootMargin: '500px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [filteredMods.length, modsVisible])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (tab !== 'mods' || !modsListRef.current?.contains(document.activeElement)) return
      const target = event.target as HTMLElement
      if (target.matches('input[type="text"], input[type="search"], textarea, select')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'a') {
        event.preventDefault(); setSelectedModIds(new Set(filteredMods.map(mod => mod.id)))
      }
      if (event.key === 'Escape') setSelectedModIds(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filteredMods, tab])

  const selectMod = (index: number, event: ReactMouseEvent<HTMLInputElement>) => {
    setSelectedModIds(current => {
      const next = new Set((event.ctrlKey || event.metaKey || event.shiftKey) ? current : [])
      if (event.shiftKey && lastSelectedIndex !== undefined) {
        const [start, end] = [lastSelectedIndex, index].sort((a, b) => a - b)
        filteredMods.slice(start, end + 1).forEach(mod => next.add(mod.id))
      } else if (next.has(filteredMods[index].id)) next.delete(filteredMods[index].id)
      else next.add(filteredMods[index].id)
      return next
    })
    setLastSelectedIndex(index)
  }

  const clearBulkSelection = () => setSelectedModIds(new Set())

  if (!selectedGame || !selectedProfile) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><p className="text-sm text-white/50">Ajoutez un jeu pour gérer ses fichiers de mods.</p><button onClick={() => void addGameFromExecutable()} className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-ink-400">Ajouter un jeu</button></div>
  }

  const browseExecutable = async () => {
    const path = await pickExecutable()
    if (path) await setGamePath(selectedGame.id, path)
  }
  const browseModsFolder = async () => {
    const path = await pickFolder()
    if (path) setModsPath(selectedGame.id, path)
  }

  const exportProfile = async (complete: boolean) => {
    const destination = await saveProfileArchive(`${selectedGame.name}-${selectedProfile.name}`)
    if (!destination) return
    const { mods: _legacy, ...profile } = selectedProfile
    const sanitizedMods = profileMods.map(mod => {
      const { path: _path, ...safe } = mod
      return safe
    })
    const manifest: ProfileArchiveManifest = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: 'ZAILON',
      appVersion,
      exportMode: complete ? 'complete' : 'light',
      game: { name: selectedGame.name, provider: selectedGame.provider, providerGameId: selectedGame.providerGameId },
      profile,
      mods: sanitizedMods,
    }
    const sources = profileMods.flatMap(mod => mod.path ? [{ id: mod.id, name: mod.name, path: mod.path }] : [])
    await native.exportProfile(destination, manifest, complete, sources)
  }

  const importProfile = async () => {
    const archivePath = await pickProfileArchive()
    if (!archivePath) return
    const preview = await native.previewProfileImport(archivePath)
    const message = [
      `Profil : ${preview.manifest.profile.name}`,
      `Jeu source : ${preview.manifest.game.name}`,
      `${preview.manifest.mods.length} référence(s), ${preview.embeddedFiles} fichier(s) intégré(s).`,
      ...preview.warnings,
      'Importer ce profil sans écraser les profils existants ?',
    ].join('\n')
    if (!window.confirm(message)) return
    importProfileManifest(preview.manifest)
    if (preview.embeddedFiles && selectedGame.modsPath && window.confirm('Extraire aussi les fichiers intégrés dans le dossier Mods de ce jeu ?')) {
      await native.extractProfileArchive(archivePath, selectedGame.modsPath)
      await scanMods(selectedGame.id)
    }
  }

  const deploymentArguments = () => {
    const enabledModIds = profileMods
      .filter(mod => mod.enabled)
      .map(mod => mod.stageId || (mod.storage === 'staged' ? mod.id : undefined))
      .filter((id): id is string => Boolean(id))
    const executableRoot = selectedGame.name.toLocaleLowerCase().includes('cyberpunk')
      && /[\\/]bin[\\/]x64(?:[\\/]|$)/i.test(selectedGame.execPath || '')
      ? selectedGame.execPath?.split(/[\\/]bin[\\/]x64/i)[0]
      : selectedGame.execPath?.replace(/[\\/][^\\/]+$/, '')
    const gameRoot = selectedGame.installDirectory
      || executableRoot
      || undefined
    return {
      enabledModIds,
      conflictRules: selectedProfile.conflictRules || [],
      gameRoot,
    }
  }

  const diagnoseMod = async (mod: Mod) => {
    setDeploymentToolBusy(true)
    try {
      const input = deploymentArguments()
      const audit = await native.auditProfileDeployment(
        selectedGame.id,
        selectedProfile.id,
        input.enabledModIds,
        input.conflictRules,
        input.gameRoot,
      )
      const packageId = mod.stageId || selectedProfile.modStates[mod.id]?.packageId || mod.id
      const packageStatus = audit.packages.find(item => item.packageId === packageId)
      const winningFiles = audit.virtualFiles.filter(file => file.packageId === packageId)
      const overriddenFiles = audit.virtualFiles.filter(file => file.overriddenPackageIds.includes(packageId))
      const runtimeVisible = mod.deploymentStatus === 'runtime-visible' || mod.deploymentStatus === 'loaded-by-game'
      const checks: ModDiagnosticCheck[] = [
        { label: 'Paquet physique', ok: Boolean(packageStatus?.exists), evidence: packageStatus?.packageDirectory || 'Dossier du paquet introuvable.' },
        { label: 'Manifeste', ok: Boolean(packageStatus?.manifestExists), evidence: packageStatus?.manifestExists ? `${packageStatus.fileCount} fichier(s) déployable(s).` : 'Manifeste absent ou incomplet.' },
        { label: 'Version immuable', ok: packageStatus?.identityMatches !== false, evidence: packageStatus?.identityMatches === false ? 'Le hash ou la version physique diffère de la référence du profil.' : `Version ${packageStatus?.versionId || mod.version || 'identifiée par hash'}.` },
        { label: 'Racine du mod', ok: Boolean(packageStatus?.normalized), evidence: packageStatus?.normalized ? 'Les chemins sont relatifs à la racine du jeu.' : 'Une racine de stockage incorrecte subsiste.' },
        { label: 'Profil', ok: Object.prototype.hasOwnProperty.call(selectedProfile.modStates, mod.id), evidence: `Profil « ${selectedProfile.name} » · ${mod.enabled ? 'activé' : 'désactivé'}.` },
        { label: 'Carte virtuelle', ok: winningFiles.length > 0, evidence: winningFiles.length ? `${winningFiles.length} fichier(s) gagnant(s).` : `${overriddenFiles.length} fichier(s) remplacé(s), aucun gagnant.` },
        { label: 'Visibilité runtime', ok: runtimeVisible, unknown: !runtimeVisible && mod.deploymentStatus !== 'failed', evidence: runtimeVisible ? 'Le dernier déploiement a confirmé la copie visible par le jeu.' : mod.deploymentStatus === 'failed' ? 'Le dernier déploiement a échoué.' : 'Non confirmée tant que le jeu n’est pas lancé avec ce profil.' },
      ]
      const failed = checks.filter(check => !check.ok && !check.unknown)
      const confidence: ModDiagnosticView['confidence'] = failed.length ? 'Confirmé' : checks.some(check => check.unknown) ? 'Possible' : 'Confirmé'
      const cause = failed[0]?.evidence || (checks.some(check => check.unknown)
        ? 'Le paquet est prêt, mais son chargement par le runtime du jeu n’a pas encore été confirmé.'
        : 'Aucune anomalie détectée dans le stockage, le profil ou la carte virtuelle.')
      setModDiagnostic({ mod, audit, packageId, checks, confidence, cause, winningFiles: winningFiles.length, overriddenFiles: overriddenFiles.length })
    } catch (error) {
      setModDiagnostic({ mod, packageId: mod.stageId || mod.id, checks: [], confidence: 'Inconnu', cause: String(error), winningFiles: 0, overriddenFiles: 0 })
    } finally {
      setDeploymentToolBusy(false)
    }
  }

  const repairMo2Deployment = async () => {
    const sourcePath = await pickFolder('Sélectionnez la racine Mod Organizer 2 utilisée pour cet import')
    if (!sourcePath) return
    setDeploymentToolBusy(true)
    try {
      const input = deploymentArguments()
      const before = await native.auditProfileDeployment(
        selectedGame.id,
        selectedProfile.id,
        input.enabledModIds,
        input.conflictRules,
        input.gameRoot,
      )
      const confirmation = [
        `Réparer le profil « ${selectedProfile.name} » depuis cette instance MO2 ?`,
        '',
        `${before.referencedPackages} paquet(s) actif(s), ${before.virtualFileCount} fichier(s) actuellement déployables.`,
        `${before.brokenReferences} référence(s) cassée(s), ${before.providers.length} fournisseur(s) complet(s).`,
        '',
        'ZAILON créera un snapshot, restaurera seulement les fichiers runtime dont le fournisseur est confirmé par plusieurs signatures, reconstruira les manifestes et recalculera la carte virtuelle.',
        'La source MO2 restera strictement en lecture seule.',
      ].join('\n')
      if (!window.confirm(confirmation)) return
      const result = await native.repairMo2ProfileDeployment(
        selectedGame.id,
        selectedProfile.id,
        sourcePath,
        selectedGame.name,
        input.enabledModIds,
        input.conflictRules,
        input.gameRoot,
      )
      await scanMods(selectedGame.id)
      const providers = result.providers.length
        ? result.providers.map(provider => provider.frameworkId).join(', ')
        : 'aucun'
      window.alert([
        result.deployable ? 'Réparation terminée : le profil est prêt pour le bouton Jouer.' : 'Réparation terminée, mais le profil reste non déployable.',
        '',
        `${result.packagesAudited} paquet(s) audité(s), ${result.packagesRestaged} fournisseur(s) restagé(s).`,
        `${result.manifestsRebuilt} manifeste(s) reconstruit(s), ${result.virtualFileCount} fichier(s) dans la carte virtuelle.`,
        `${result.brokenReferences} référence(s) cassée(s). Frameworks complets : ${providers}.`,
        '',
        `Rapport : ${result.reportPath}`,
        `Snapshot : ${result.snapshotPath}`,
        '',
        ...result.diagnostics.slice(0, 6),
      ].join('\n'))
    } catch (error) {
      window.alert(`Réparation MO2 annulée : ${String(error)}`)
    } finally {
      setDeploymentToolBusy(false)
    }
  }

  const repairStagedImports = async () => {
    try {
      const staged = profileMods.filter(mod => mod.storage === 'staged' && mod.stageId)
      if (!staged.length) {
        window.alert('Aucun paquet importé (staged) à réparer.')
        return
      }
      const reports = await native.repairStagedImports(selectedGame.id, selectedGame.name, staged.map(mod => mod.stageId as string))
      const repaired = reports.filter(report => report.repaired)
      const failed = reports.filter(report => !report.repaired)
      const moved = repaired.reduce((sum, report) => sum + Math.max(0, report.files_after - report.files_before), 0)
      const lines = [`${repaired.length}/${reports.length} paquet(s) re-stagé(s) depuis leur source.`]
      if (moved > 0) lines.push(`${moved} fichier(s) replacé(s) selon leur vraie racine de jeu.`)
      if (failed.length) {
        lines.push('', 'Échecs (source absente ou manifeste illisible) :')
        failed.slice(0, 5).forEach(report => lines.push(`- ${report.name} : ${report.error ?? 'erreur inconnue'}`))
        if (failed.length > 5) lines.push(`- … ${failed.length - 5} autre(s)`)
      }
      lines.push('', 'Un backup du contenu précédent est conservé dans chaque paquet.')
      await scanMods(selectedGame.id)
      window.alert(lines.join('\n'))
    } catch (error) {
      window.alert(`Réparation des imports annulée : ${String(error)}`)
    }
  }

  const repairCyberpunkStructure = async () => {
    try {
      const preview = await native.previewCyberpunkStructureRepair(selectedGame.id)
      if (!preview.items.length) {
        window.alert(`Aucune structure Cyberpunk mal imbriquée détectée dans ${preview.packagesScanned} paquet(s).`)
        return
      }
      const examples = preview.items.slice(0, 8).flatMap(item =>
        item.moves.slice(0, 2).map(move => `${item.name}\n  ${move.from}\n  → ${move.to}`),
      )
      const conflicts = preview.items.reduce((sum, item) => sum + item.conflicts.length, 0)
      const message = [
        `${preview.items.length} paquet(s), ${preview.filesAffected} chemin(s) à réparer.`,
        conflicts ? `${conflicts} collision(s) bloquent la réparation automatique.` : 'Aucune collision détectée.',
        '',
        ...examples,
        preview.items.length > 8 ? `… ${preview.items.length - 8} paquet(s) supplémentaire(s)` : '',
        '',
        'Un snapshot complet sera créé avant toute modification. Appliquer cette réparation ?',
      ].filter(Boolean).join('\n')
      if (conflicts || !window.confirm(message)) return
      const result = await native.applyCyberpunkStructureRepair(selectedGame.id, preview.items.map(item => item.stageId))
      await scanMods(selectedGame.id)
      window.alert([
        `${result.packagesRepaired} paquet(s) réparé(s), ${result.filesMoved} fichier(s) replacé(s).`,
        `Snapshot : ${result.snapshotPath}`,
        `Identifiant de rollback : ${result.repairId}`,
      ].join('\n'))
    } catch (error) {
      window.alert(`Réparation Cyberpunk annulée : ${String(error)}`)
    }
  }

  // Refonte « vitrine Steam » : la Bibliothèque est une grille plein écran.
  // Clic sur un jeu → page du jeu (hero + onglets) avec « ← Bibliothèque ».
  if (gamesBrowsing) {
    return <LibraryShowcase
      games={games}
      visibleGames={visibleGames}
      summaries={summaries}
      search={librarySearch}
      onSearch={setLibrarySearch}
      filter={libraryFilter}
      onFilter={setLibraryFilter}
      viewMode={libraryViewMode}
      onViewMode={setLibraryViewMode}
      scrollRef={libraryScrollRef}
      onOpen={gameId => { setSelectedGame(gameId); setGamesBrowsing(false) }}
      onAddGame={() => void addGameFromExecutable()}
      onDetect={() => setSteamDialogOpen(true)}
    />
  }

  const heroImage = resourceUrl(selectedGame.resources?.heroPath || selectedGame.resources?.bannerPath || selectedGame.resources?.backgroundPath || selectedGame.resources?.coverPath || selectedGame.backgroundArt)

  return <div className="flex h-full">
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="relative overflow-hidden border-b border-white/[0.05]">
        {heroImage && <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover object-top opacity-45" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-[#0a0c0c]" />
        <div className="relative px-4 pb-3 pt-3">
          <button type="button" onClick={() => { setGamesBrowsing(true); if (libraryScrollRef.current) libraryScrollRef.current.scrollTop = 0 }} className="mb-2 flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-[11px] font-semibold text-white/60 backdrop-blur hover:bg-white/[0.06] hover:text-white"><ChevronLeft size={13} />Bibliothèque</button>
          <div className="flex items-start justify-between gap-3">
          <div><h1 className="font-display text-lg font-bold text-white">{selectedGame.name}</h1>{selectedGame.lastPlayed && <p className="text-[11px] text-white/30">Joué {timeAgo(selectedGame.lastPlayed)}</p>}</div>
          <div className="flex gap-1.5"><button onClick={() => void scanMods(selectedGame.id)} title="Analyser le dossier Mods" className="rounded-lg border border-white/[0.07] p-2 text-white/40 hover:bg-white/[0.06] hover:text-gold"><RefreshCw size={13} /></button><button onClick={() => void browseModsFolder()} title="Choisir le dossier Mods" className="rounded-lg border border-white/[0.07] p-2 text-white/40 hover:bg-white/[0.06] hover:text-gold"><FolderOpen size={13} /></button><button onClick={() => { if (window.confirm(`Retirer ${selectedGame.name} de ZAILON ?`)) removeGame(selectedGame.id) }} title="Retirer de la bibliothèque" className="rounded-lg border border-white/[0.07] p-2 text-white/40 hover:bg-red-400/10 hover:text-red-300"><Trash2 size={13} /></button></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-white/34">Profil actif :</span>
          <div className="relative">
            <button ref={profileButtonRef} type="button" onClick={() => setProfileMenuOpen(open => !open)} className="flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1.5 text-[11px] font-semibold text-gold hover:bg-gold/20">{selectedProfile.name}<ChevronDown size={12} className={`transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`} /></button>
          </div>
          <ProfileSwitcherPopover
            open={profileMenuOpen}
            anchorRef={profileButtonRef}
            profiles={selectedGame.profiles}
            selectedProfileId={selectedProfile.id}
            running={sessionRunning}
            countFor={profile => summaries[selectedGame.id]?.profileCounts[profile.id]?.active ?? resolveProfileMods(selectedGame, profile).filter(mod => mod.enabled).length}
            onSelect={profileId => void setSelectedProfile(profileId)}
            onCreate={name => addProfile(name)}
            onManage={() => setTab('profiles')}
            onClose={() => setProfileMenuOpen(false)}
          />
          {selectedProfile.locked && <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.05] px-2.5 py-1 text-[10px] text-emerald-200">● Stable</span>}
          <span className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[10px] text-white/45">{profileMods.filter(mod => mod.enabled).length} mods actifs</span>
          {profileMods.some(mod => mod.updateStatus === 'available') && <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.04] px-2.5 py-1 text-[10px] text-amber-100/80">{profileMods.filter(mod => mod.updateStatus === 'available').length} mise(s) à jour</span>}
          <button type="button" onClick={() => setTab('profiles')} className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[10px] text-white/38 hover:border-gold/25 hover:text-gold">{selectedGame.profiles.length} profil(s)</button>
          <button type="button" disabled={playBusy} title={sessionRunning ? 'Le jeu est en cours. Cliquez pour l’arrêter.' : playBusy ? 'En attente du jeu…' : 'Préparer les mods et lancer le jeu'} onClick={sessionRunning ? () => { if (window.confirm(`Arrêter la session de ${selectedGame.name} ?`)) endSession(selectedGame.id) } : () => void launchSelectedGame()} className={`ml-auto flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-2 font-display text-[10px] font-bold uppercase tracking-[0.11em] transition-all min-w-[140px] ${playBusy ? 'cursor-not-allowed bg-emerald-200/18 text-emerald-100/72' : sessionRunning ? 'bg-emerald-300/90 text-[#0c1212] hover:-translate-y-0.5 hover:bg-emerald-200' : 'bg-[#dbe8e5] text-[#0d1111] hover:-translate-y-0.5 hover:bg-white'}`}>{playBusy ? <Loader2 size={12} className="animate-spin" /> : sessionRunning ? <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-900/60" /> : <Play size={10} fill="currentColor" />}{isLaunching ? `Préparation${launchPercent === undefined ? '…' : ` ${launchPercent}%`}` : sessionRunning ? 'En cours' : sessionWaiting ? (activeSession?.state === 'WaitingForGame' ? 'Recherche du jeu…' : 'Lancement…') : sessionFailed ? 'Réessayer' : 'Jouer'}</button>
        </div>
        <GameHealthBar game={selectedGame} profile={selectedProfile} profileMods={profileMods} onVerify={() => setTab('diagnostic')} />
        {activeSession && activeSession.state !== 'GameRunning' && (
          <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-[11px] ${activeSession.state === 'GameLost' ? 'border-red-300/15 bg-red-300/[0.04]' : activeSession.state === 'WaitingForElevation' ? 'border-sky-300/15 bg-sky-300/[0.04]' : 'border-amber-300/15 bg-amber-300/[0.04]'}`}>
            <span className={`font-semibold ${activeSession.state === 'GameLost' ? 'text-red-200/85' : activeSession.state === 'WaitingForElevation' ? 'text-sky-200/85' : 'text-amber-100/85'}`}>{activeSession.state === 'GameLost' ? 'Jeu non détecté' : activeSession.state === 'WaitingForElevation' ? 'Élévation Windows en cours' : 'Launcher en cours — en attente du jeu'}</span>
            <span className="min-w-0 flex-1 text-white/38">{activeSession.state === 'GameLost' ? 'Le jeu n’a pas été détecté. ZAILON continue de chercher automatiquement — le déploiement reste actif.' : activeSession.state === 'WaitingForElevation' ? 'Le launcher officiel demande une élévation Windows. ZAILON continue de surveiller la chaîne — le jeu sera reconnu automatiquement dès qu’il démarre, aucune confirmation n’est nécessaire.' : 'Le launcher officiel a pris le relais. Le rattachement est automatique : QWERTY, le profil visuel et le compteur s’activent dès que le jeu est détecté.'}</span>
          </div>
        )}
        </div>
      </header>

      <nav className="flex min-h-10 items-center overflow-x-auto border-b border-white/[0.05] px-3 thin-scroll"><div className="flex min-w-max gap-1">{TABS.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`border-b-2 px-2.5 py-2.5 text-[11px] ${tab === item.id ? 'border-gold text-gold' : 'border-transparent text-white/38 hover:text-white/70'}`}>{item.id === 'visuals' && selectedGame.name.toLocaleLowerCase().includes('rust') ? 'Visuels système' : item.label}</button>)}</div></nav>

      {tab === 'overview' && <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto p-4 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Mods partagés" value={String(selectedGame.installedMods.length)} /><Metric label="Mods actifs" value={String(profileMods.filter(mod => mod.enabled).length)} /><Metric label="Conflits détectés" value={String(conflictMods.length)} /><Metric label="Profils" value={String(selectedGame.profiles.length)} /><Metric label="Temps de jeu" value={formatTime(selectedGame.totalPlaytime)} /><Metric label="Dossier Mods" value={selectedGame.modsPath || 'Non configuré'} wide /><div className="sm:col-span-2 xl:col-span-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><div className="flex items-center justify-between"><p className="text-[11px] uppercase tracking-widest text-white/30">Activité récente</p><button type="button" onClick={() => setView('downloads')} className="text-[11px] font-semibold text-gold">Voir toute l’activité</button></div>{recentActivity.length ? <ul className="mt-3 space-y-1.5">{recentActivity.map(task => <li key={task.id} className="flex items-center gap-2 text-[11px] text-white/45"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold/60" /><span className="min-w-0 flex-1 truncate">{task.title}</span><span className="shrink-0 font-mono text-[10px] text-white/28">{timeAgo(task.updatedAt * (task.updatedAt < 10_000_000_000 ? 1000 : 1))}</span></li>)}</ul> : <p className="mt-3 text-[11px] text-white/34">Aucune activité récente. Lancez un scan, un import ou un téléchargement.</p>}</div></div>}

      {tab === 'mods' && <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.05] p-3">
          <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-ink-400"><FolderInput size={13} /> Importer des dossiers</button>
          <button onClick={() => void scanMods(selectedGame.id)} disabled={!!activeSession && runtimeActivity.scans !== 'normal'} title={activeSession && runtimeActivity.scans !== 'normal' ? 'En pause — jeu actif (profil Performance). Reprenez après la fermeture du jeu.' : 'Analyser le dossier Mods'} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"><RefreshCw size={13} /> Analyser</button>
          <button onClick={() => void deduplicateStagedMods(selectedGame.id)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.05]"><Boxes size={13} /> Nettoyer les doublons</button>
          <button onClick={() => void purgeUnreferencedStagedMods(selectedGame.id)} className="flex items-center gap-1.5 rounded-lg border border-red-300/12 px-3 py-2 text-[11px] text-red-100/58 hover:bg-red-300/[0.05]"><Trash2 size={13} /> Purger les paquets retirés</button>
          <button onClick={() => void repairStagedImports()} title="Re-stager chaque paquet importé depuis sa source enregistrée (racines de jeu corrigées)" className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.05]"><RotateCcw size={13} />Réparer les racines des imports</button>
          {selectedGame.name.toLocaleLowerCase().includes('cyberpunk') && <button onClick={() => void repairCyberpunkStructure()} className="flex items-center gap-1.5 rounded-lg border border-amber-300/18 bg-amber-300/[0.035] px-3 py-2 text-[11px] text-amber-100/68 hover:bg-amber-300/[0.07]"><Wrench size={13} />Réparer les racines Cyberpunk</button>}
          {bulkHistory.some(operation => operation.gameId === selectedGame.id && operation.undoable) && <button onClick={() => void undoLastBulkOperation()} title="Annuler la dernière opération groupée" className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/55 hover:bg-white/[0.05]"><RotateCcw size={13} />Annuler</button>}
          <label className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-2.5 text-[11px] text-white/55"><input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedModIds(current => { const next = new Set(current); if (allVisibleSelected) filteredMods.forEach(mod => next.delete(mod.id)); else filteredMods.forEach(mod => next.add(mod.id)); return next })} className="accent-gold" />Tout visible <span className="text-white/30">{selectedVisible}/{filteredMods.length}</span></label>
          {availableTags.length > 0 && <select value={tagFilter} onChange={event => setTagFilter(event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#101313] px-2 py-2 text-[11px] text-white/58"><option value="">Toutes les étiquettes</option>{availableTags.map(tag => <option key={tag.id} value={tag.id}>{tag.label}</option>)}</select>}
          <div className="relative ml-auto"><Search size={12} className="absolute left-2.5 top-2.5 text-white/30" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher" className="w-44 rounded-lg border border-white/[0.07] bg-white/[0.03] py-2 pl-7 pr-2 text-[11px] text-white/70 outline-none focus:border-gold/30" /></div>
        </div>
        <div ref={modsListRef} tabIndex={-1} className="relative flex-1 overflow-y-auto p-3 outline-none"><p className="mb-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[11px] text-amber-100/65">Le store de paquets est partagé entre les profils. Un retrait simple conserve les fichiers ; « Supprimer définitivement du PC » les efface réellement. Chaque profil référence précisément une version et un hash immuables.</p>{selectedGame.provider === 'FiveM Client' && <p className="mb-2 rounded-lg border border-sky-300/18 bg-sky-300/[0.04] px-3 py-2 text-[11px] leading-relaxed text-sky-100/68">Adaptateur FiveM client : plugins et fichiers client uniquement. Tout paquet contenant <code>fxmanifest.lua</code>, <code>__resource.lua</code> ou <code>server.cfg</code> est refusé afin de ne jamais mélanger ressources serveur et profil client. Les règles des serveurs restent applicables.</p>}<div className="space-y-1.5 pb-20">{filteredMods.length ? filteredMods.slice(0, modsVisible).map((mod, index) => <ModCard key={mod.id} mod={mod} selected={selectedModIds.has(mod.id)} onSelect={event => selectMod(index, event)} onToggle={() => void toggleMod(mod.id)} onDelete={() => { setSelectedModIds(new Set([mod.id])); setBulkDialog('delete') }} onDiagnose={() => void diagnoseMod(mod)} onMoveUp={index > 0 ? () => moveMod(mod.id, -1) : undefined} onMoveDown={index < filteredMods.length - 1 ? () => moveMod(mod.id, 1) : undefined} onNoteChange={note => setModNote(mod.id, note)} />) : <div className="flex h-40 flex-col items-center justify-center gap-2 text-[11px] text-white/35"><FolderPlus size={20} /><span>Aucun mod. Importez un dossier ou analysez le dossier Mods.</span></div>}</div>{modsVisible < filteredMods.length && <p className="mt-2 text-center text-[11px] text-white/28">{modsVisible} mod(s) affiché(s) sur {filteredMods.length} — défilez pour charger la suite.</p>}<div ref={loadMoreRef} className="h-6" aria-hidden="true" />{selectedModIds.size > 0 && <div className="sticky bottom-2 mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-gold/25 bg-[#101313]/95 p-2.5 shadow-2xl backdrop-blur-xl"><span className="flex items-center gap-1.5 pr-1 text-xs font-semibold text-white/72"><CheckSquare2 size={15} className="text-gold" />{selectedModIds.size} sélectionné(s)</span><button onClick={() => void bulkSetEnabled([...selectedModIds], true)} className="rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58 hover:bg-white/[0.05]">Activer</button><button onClick={() => void bulkSetEnabled([...selectedModIds], false)} className="rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58 hover:bg-white/[0.05]">Désactiver</button><button onClick={() => setBulkDialog('move')} className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-[var(--zailon-accent-text)]">Transférer</button><button onClick={() => setBulkDialog('copy')} className="rounded-lg border border-gold/25 px-3 py-2 text-xs text-gold">Copier</button><button onClick={() => setBulkDialog('tag')} className="flex items-center gap-1 rounded-lg border border-white/[0.09] px-3 py-2 text-xs text-white/58"><Tag size={13} />Étiquette</button><button onClick={() => setBulkDialog('delete')} className="rounded-lg border border-red-300/15 px-3 py-2 text-xs text-red-200/70">Retirer / supprimer</button><button onClick={clearBulkSelection} className="ml-auto rounded p-2 text-white/35 hover:bg-white/[0.05]" aria-label="Effacer la sélection"><X size={14} /></button></div>}</div>
      </div>}

      {tab === 'profiles' && <div className="mx-4 mt-4 flex flex-wrap gap-2"><button onClick={() => toggleProfileLock(selectedProfile.id)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${selectedProfile.locked ? 'border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-200' : 'border-gold/25 text-gold'}`}>{selectedProfile.locked ? <Unlock size={13} /> : <Lock size={13} />}{selectedProfile.locked ? 'Déverrouiller le profil stable' : 'Marquer comme stable'}</button><button onClick={() => void repairProfileStorage(selectedGame.id)} className="rounded-lg border border-gold/25 px-3 py-2 text-xs font-semibold text-gold">Réparer et séparer les profils existants</button></div>}

      {tab === 'profiles' && <div className="flex-1 space-y-4 overflow-y-auto p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] text-white/34">Les profils sont isolés par défaut — « Dupliquer » recopie explicitement un état existant.</p><button type="button" onClick={() => setMo2ImportOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/58 hover:border-gold/25 hover:text-gold"><Archive size={13} />Importer depuis Mod Organizer 2…</button></div><div className="rounded-xl border border-gold/15 bg-gold/[0.035] p-3"><p className="text-xs font-semibold text-white/72">Profils réellement isolés</p><p className="mt-1 text-xs leading-relaxed text-white/45">« Créer vide » produit toujours 0 mod actif, sans ordre, réglage ni overwrite hérité. « Dupliquer » est la seule action qui recopie explicitement l’état du profil source. Les paquets restent dans le store immuable commun.</p></div><div className="space-y-2">{selectedGame.profiles.map(profile => <div key={profile.id} className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-3 ${profile.id === selectedProfile.id ? 'border-gold/20 bg-gold/[0.04]' : 'border-white/[0.07] bg-white/[0.02]'}`}><input value={profile.name} disabled={profile.locked} onChange={event => renameProfile(profile.id, event.target.value)} className="min-w-40 flex-1 bg-transparent text-xs font-medium text-white/78 outline-none disabled:opacity-55" /><span className="rounded-full bg-white/[0.035] px-2 py-1 text-[11px] text-white/38">{Object.keys(profile.modStates).length} référencé(s) · {resolveProfileMods(selectedGame, profile).filter(mod => mod.enabled).length} actif(s)</span>{profile.clonedFromProfileId && <span className="text-[11px] text-white/28">copie explicite</span>}<button onClick={() => void openProfileDirectory(profile.id)} title="Ouvrir le dossier racine du profil" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><FolderOpen size={13} /></button><button onClick={() => void checkProfileIntegrity(profile.id)} title="Vérifier l’intégrité" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><ShieldAlert size={13} /></button><button onClick={() => toggleProfileLock(profile.id)} title={profile.locked ? 'Déverrouiller' : 'Verrouiller'} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white">{profile.locked ? <Lock size={13} /> : <Unlock size={13} />}</button><button onClick={() => duplicateProfile(profile.id)} title="Dupliquer explicitement" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><Copy size={13} /></button><button onClick={() => removeProfile(profile.id)} disabled={selectedGame.profiles.length < 2 || profile.isDefault || profile.locked} title="Placer le profil dans la corbeille ZAILON" className="rounded-lg p-2 text-white/30 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-20"><Trash2 size={13} /></button></div>)}</div><div className="flex gap-2"><input value={profileName} onChange={event => setProfileName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { addProfile(profileName); setProfileName('') } }} placeholder="Nom du nouveau profil vide" className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] text-white/70 outline-none focus:border-gold/30" /><button onClick={() => { addProfile(profileName); setProfileName('') }} className="rounded-lg bg-gold px-3 text-[11px] font-semibold text-[var(--zailon-accent-text)]">Créer vide</button></div><div className="grid gap-2 sm:grid-cols-3"><button onClick={() => void openProfileDirectory(selectedProfile.id, 'root')} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/55">Ouvrir la racine</button><button onClick={() => void openProfileDirectory(selectedProfile.id, 'overwrite')} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/55">Ouvrir overwrite</button><button onClick={() => void openProfileDirectory(selectedProfile.id, 'generated')} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/55">Ouvrir generated</button></div>{selectedProfile.installHistory?.length ? <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[11px] font-semibold text-white/68">Historique d’installations — {selectedProfile.name}</p><ul className="mt-2 space-y-1">{selectedProfile.installHistory.slice(0, 10).map((entry, index) => <li key={index} className="flex items-center gap-2 text-[11px] text-white/45"><span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] ${entry.action === 'added' ? 'bg-emerald-300/10 text-emerald-200/80' : 'bg-amber-300/10 text-amber-100/80'}`}>{entry.action === 'added' ? 'Ajouté' : 'Mis à jour'}</span><span className="min-w-0 flex-1 truncate">{entry.name}</span><span className="shrink-0 font-mono text-[10px] text-white/28">{new Date(entry.at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span></li>)}</ul></div> : null}</div>}

      {tab === 'downloads' && <CollectionDownloadsPanel gameId={selectedGame.id} gameName={selectedGame.name} onOpenProfile={profileId => { void setSelectedProfile(profileId); setTab('profiles') }} />}
      {tab === 'visuals' && <VisualGamePanel game={selectedGame} zailonProfile={selectedProfile} />}
      {tab === 'configuration' && <GameConfigurationPanel game={selectedGame} profile={selectedProfile} onBrowseExecutable={() => void browseExecutable()} onBrowseModsFolder={() => void browseModsFolder()} onExportProfile={complete => void exportProfile(complete)} onImportProfile={() => void importProfile()} onSaveResources={resources => setGameResources(selectedGame.id, resources)} onOpenVisuals={() => setTab('visuals')} />}
      {tab === 'diagnostic' && <GameDiagnosticPanel game={selectedGame} profile={selectedProfile} profileMods={profileMods} onOpenConfiguration={() => setTab('configuration')} onRepairMo2={selectedGame.name.toLocaleLowerCase().includes('cyberpunk') ? () => void repairMo2Deployment() : undefined} repairBusy={deploymentToolBusy} conflicts={resolvedConflicts} onSetWinner={(path, winnerId) => setConflictWinner(path, winnerId)} initialSection={diagSection} />}
    </section>

    {steamDialogOpen && <SteamDetectionDialog onClose={() => setSteamDialogOpen(false)} onImport={importDetectedGames} />}
    {importOpen && <ModImportDialog gameId={selectedGame.id} profileId={selectedProfile.id} gameName={selectedGame.name} destination={selectedGame.modsPath} onClose={() => setImportOpen(false)} onImported={() => void scanMods(selectedGame.id)} />}
    {mo2ImportOpen && <Mo2ImportDialog gameId={selectedGame.id} gameName={selectedGame.name} onClose={() => setMo2ImportOpen(false)} onImported={async result => completeMo2Import(selectedGame.id, result)} />}
    {bulkDialog && <BulkActionDialog mode={bulkDialog} count={selectedModIds.size} source={selectedProfile} profiles={selectedGame.profiles} onClose={() => setBulkDialog(undefined)} onConfirm={async value => {
      const ids = [...selectedModIds]
      if (bulkDialog === 'move' || bulkDialog === 'copy') await bulkTransferMods(ids, value, bulkDialog)
      else if (bulkDialog === 'delete') {
        if (value === 'permanent' && !window.confirm(`SUPPRESSION DÉFINITIVE\n\n${ids.length} mod(s) seront retirés de tous les profils et leurs fichiers seront effacés du PC. Cette action n’est pas annulable.\n\nContinuer ?`)) return
        await bulkDeleteMods(ids, value === 'permanent' ? 'permanent' : value === 'all' ? 'all' : 'current')
      }
      else await bulkAddTag(ids, value)
      clearBulkSelection(); setBulkDialog(undefined)
    }} />}
    {modDiagnostic && <ModDiagnosticDialog diagnostic={modDiagnostic} onClose={() => setModDiagnostic(undefined)} onOpenFiles={() => { setModDiagnostic(undefined); setDiagSection('files'); setTab('diagnostic') }} />}
  </div>
}

function LibraryShowcase({ games, visibleGames, summaries, search, onSearch, filter, onFilter, viewMode, onViewMode, scrollRef, onOpen, onAddGame, onDetect }: {
  games: Game[]
  visibleGames: Game[]
  summaries: ReturnType<typeof useWorkspaceCache>
  search: string
  onSearch: (value: string) => void
  filter: 'all' | 'games' | 'apps' | 'favorites' | 'recent'
  onFilter: (value: typeof filter) => void
  viewMode: 'grid' | 'illustrated' | 'compact'
  onViewMode: (mode: typeof viewMode) => void
  scrollRef: React.RefObject<HTMLDivElement>
  onOpen: (gameId: string) => void
  onAddGame: () => void
  onDetect: () => void
}) {
  const sessions = useStore(state => state.gameSessions)
  const anyGameRunning = useStore(state => state.gameSessions.some(session => session.state === 'GameRunning'))
  const runtimeActivity = useStore(state => state.runtimeActivity)
  const pinnedPriorityGameId = useStore(state => state.pinnedPriorityGameId)
  const foregroundGameId = useStore(state => state.foregroundGameId)
  const setGameFavorite = useStore(state => state.setGameFavorite)
  const setGameResources = useStore(state => state.setGameResources)
  const searchRef = useRef<HTMLInputElement>(null)
  const [context, setContext] = useState<{ gameId: string; x: number; y: number }>()
  const [resourcesGameId, setResourcesGameId] = useState<string>()
  const resourcesGame = resourcesGameId ? games.find(item => item.id === resourcesGameId) : undefined

  const activeByGame = useMemo(() => {
    const map = new Map<string, GameSession>()
    sessions.forEach(session => {
      if (session.state !== 'Ended' && session.state !== 'Failed' && session.state !== 'GameLost' && !map.has(session.gameId)) {
        map.set(session.gameId, session)
      }
    })
    return map
  }, [sessions])
  const priorityGameId = useMemo(() => pickPrioritySession(sessions, pinnedPriorityGameId, foregroundGameId), [sessions, pinnedPriorityGameId, foregroundGameId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'l') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filters: Array<{ id: typeof filter; label: string }> = [
    { id: 'all', label: 'Tous' },
    { id: 'games', label: 'Jeux' },
    { id: 'apps', label: 'Applications' },
    { id: 'favorites', label: 'Favoris' },
    { id: 'recent', label: 'Installés récemment' },
  ]
  const densities: Array<{ id: typeof viewMode; label: string }> = [
    { id: 'compact', label: 'Petit' },
    { id: 'grid', label: 'Normal' },
    { id: 'illustrated', label: 'Grand' },
  ]
  const counts = {
    all: games.length,
    games: games.filter(game => game.itemKind !== 'software').length,
    apps: games.filter(game => game.itemKind === 'software').length,
    favorites: games.filter(game => game.favorite).length,
    recent: games.filter(game => game.lastPlayed !== undefined).length,
  }
  const columns = viewMode === 'compact'
    ? 'grid-cols-[repeat(auto-fill,minmax(106px,1fr))]'
    : viewMode === 'illustrated'
      ? 'grid-cols-[repeat(auto-fill,minmax(196px,1fr))]'
      : 'grid-cols-[repeat(auto-fill,minmax(148px,1fr))]'

  return <div className="flex h-full flex-col">
    <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.05] px-4 py-3">
      <div className="min-w-0"><h1 className="font-display text-lg font-bold text-white">Bibliothèque</h1><p className="mt-0.5 text-[11px] text-white/34">{counts.all} élément(s) · {counts.games} jeu(x) · {counts.apps} application(s)</p></div>
      <div className="relative ml-auto w-full max-w-md"><Search size={13} className="absolute left-3 top-2.5 text-white/30" /><input ref={searchRef} value={search} onChange={event => onSearch(event.target.value)} placeholder="Rechercher un jeu ou une application" className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-2 pl-8 pr-2 text-[11px] text-white/70 outline-none focus:border-gold/30" /></div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onDetect} disabled={anyGameRunning && runtimeActivity.scans !== 'normal'} title={anyGameRunning && runtimeActivity.scans !== 'normal' ? 'En pause — jeu actif (profil Performance). Reprenez après la fermeture du jeu.' : 'Détecter les jeux installés'} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/55 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"><Radar size={12} />Détecter</button>
        <button type="button" onClick={onAddGame} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-ink-400"><Plus size={12} />Ajouter un jeu</button>
      </div>
    </header>
    <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.05] px-4 py-2">
      <div className="flex gap-1">{filters.map(item => <button key={item.id} type="button" onClick={() => onFilter(item.id)} className={`rounded-full px-3 py-1.5 text-[11px] ${filter === item.id ? 'bg-gold text-ink-400' : 'text-white/42 hover:bg-white/[0.04] hover:text-white/70'}`}>{item.label} <span className={filter === item.id ? 'text-ink-400/55' : 'text-white/22'}>{counts[item.id]}</span></button>)}</div>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-white/[0.07] p-0.5">{densities.map(item => <button key={item.id} type="button" onClick={() => onViewMode(item.id)} className={`rounded-md px-2.5 py-1 text-[11px] ${viewMode === item.id ? 'bg-white/[0.09] text-white/80' : 'text-white/35 hover:text-white/60'}`}>{item.label}</button>)}</div>
      </div>
    </div>
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
      {visibleGames.length ? <div className={`grid gap-3 ${columns}`}>{visibleGames.map(game => <LibraryCard key={game.id} game={game} active={Boolean(activeByGame.get(game.id))} priority={priorityGameId === game.id} activeMods={game.profiles[0]?.id !== undefined ? summaries[game.id]?.profileCounts[game.profiles[0].id]?.active : undefined} onOpen={() => onOpen(game.id)} onFavorite={() => setGameFavorite(game.id)} onContextMenu={(x, y) => setContext({ gameId: game.id, x, y })} />)}</div> : <div className="flex h-48 flex-col items-center justify-center gap-2 text-[11px] text-white/35"><Search size={20} /><span>{search.trim() ? 'Aucun résultat pour cette recherche.' : 'Aucun élément dans ce filtre.'}</span><button type="button" onClick={onAddGame} className="mt-1 rounded-lg border border-white/[0.1] px-3 py-1.5 text-white/55 hover:bg-white/[0.05]">Ajouter un jeu</button></div>}
    </div>
    {context && <div className="fixed z-[300]" style={{ left: Math.min(context.x, window.innerWidth - 220), top: Math.min(context.y, window.innerHeight - 160) }}>
      <div className="fixed inset-0 z-[-1]" onClick={() => setContext(undefined)} onContextMenu={event => { event.preventDefault(); setContext(undefined) }} />
      <div className="w-52 rounded-xl border border-white/[0.1] bg-[#111414]/98 p-1.5 shadow-2xl backdrop-blur-xl">
        {(() => { const game = games.find(item => item.id === context.gameId); if (!game) return null; return <>
          <button type="button" onClick={() => { setGameFavorite(game.id); setContext(undefined) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-white/68 hover:bg-white/[0.05]"><Star size={12} className={game.favorite ? 'fill-gold text-gold' : 'text-white/35'} />{game.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}</button>
          <button type="button" onClick={() => { onOpen(game.id); setContext(undefined) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-white/68 hover:bg-white/[0.05]"><Play size={12} className="text-white/35" />Ouvrir</button>
          <button type="button" onClick={() => { setResourcesGameId(game.id); setContext(undefined) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-white/68 hover:bg-white/[0.05]"><ImageIcon size={12} />Changer l’apparence…</button>
        </> })()}
      </div>
    </div>}
    {resourcesGame && <GameResourcesDialog game={resourcesGame} onClose={() => setResourcesGameId(undefined)} onChange={resources => setGameResources(resourcesGame.id, resources)} />}
  </div>
}

function LibraryCard({ game, active, priority, activeMods, onOpen, onFavorite, onContextMenu }: {
  game: Game
  active: boolean
  priority: boolean
  activeMods?: number
  onOpen: () => void
  onFavorite: () => void
  onContextMenu: (x: number, y: number) => void
}) {
  const cover = resourceUrl(game.resources?.coverPath || game.resources?.bannerPath || game.resources?.backgroundPath || game.backgroundArt)
  // Parallaxe 3D subtil (spec §4-13) : uniquement si le toggle Apparence est
  // actif, les animations ne sont pas réduites et l'appareil n'est pas tactile.
  const coverParallax = useStore(state => state.coverParallax)
  const motionMode = useStore(state => state.motionMode)
  const gameSessions = useStore(state => state.gameSessions)
  const performanceModes = useStore(state => state.performanceModes)
  const performanceCustom = useStore(state => state.performanceCustom)
  const pinnedPriorityGameId = useStore(state => state.pinnedPriorityGameId)
  const foregroundGameId = useStore(state => state.foregroundGameId)
  // Parallaxe coupé pendant le jeu quand un profil Performance/Équilibré réduit
  // les animations (spec §14, §36) — les bibliothèques restent statiques.
  const parallax = useMemo(() => {
    if (isTouchDevice()) return false
    if (!parallaxActive(coverParallax, motionReduced(motionMode, systemReducedMotion()))) return false
    const effective = effectivePerformance(performanceModes, performanceCustom, gameSessions, pickPrioritySession(gameSessions, pinnedPriorityGameId, foregroundGameId))
    return !animationsReducedDuringGame(effective.animations)
  }, [coverParallax, motionMode, gameSessions, performanceModes, performanceCustom, pinnedPriorityGameId, foregroundGameId])
  // Spec §16-19 : le parallaxe incline la CARTE ENTIÈRE (conteneur, couverture,
  // titre, badges, favori) comme une seule jaquette — plus jamais uniquement
  // l'image. Le clic droit ramène la carte au neutre avant d'ouvrir le menu
  // (spec §65).
  const openMenu = (event: React.MouseEvent) => { event.preventDefault(); onContextMenu(event.clientX, event.clientY) }
  return (
    <div className="group relative">
      <ParallaxCover active={parallax} className="h-full w-full" onContextMenu={openMenu}>
        <div className="h-full overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] transition-colors group-hover:border-gold/25 group-hover:bg-white/[0.04]">
          <button type="button" onClick={onOpen} className="block w-full text-left">
            <span className="relative block aspect-[3/4] w-full overflow-hidden bg-black/30">
              {cover
                ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                : <FallbackArtwork name={game.name} kind={game.itemKind} />}
              <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100"><span className="mb-3 flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-[11px] font-semibold text-ink-400"><Play size={11} />Ouvrir</span></span>
              {active && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-400/95 px-2 py-0.5 text-[9px] font-bold text-emerald-950"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-950" />En cours</span>}
              {priority && <span className="absolute left-2 top-8 flex items-center gap-1 rounded-full bg-gold/95 px-2 py-0.5 text-[9px] font-bold text-ink-400"><Star size={8} className="fill-ink-400" />Prioritaire</span>}
            </span>
            <span className="block p-2.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/75">{game.itemKind === 'software' ? <Monitor size={11} className="shrink-0 text-white/30" /> : <Gamepad2 size={11} className="shrink-0 text-white/30" />}<span className="truncate">{game.name}</span></span>
              <span className="mt-1 block text-[10px] text-white/34">{activeMods !== undefined ? `${activeMods} mod(s) actif(s)` : game.installedMods.length ? `${game.installedMods.length} mods` : game.itemKind === 'software' ? 'Application locale' : 'Jeu'}</span>
            </span>
          </button>
          <button type="button" onClick={event => { event.stopPropagation(); onFavorite() }} title={game.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} className={`absolute right-2 top-2 rounded-full border p-1.5 backdrop-blur transition-colors ${game.favorite ? 'border-gold/40 bg-gold/15 text-gold' : 'border-white/[0.14] bg-black/35 text-white/40 opacity-0 hover:text-gold group-hover:opacity-100'}`}><Star size={11} className={game.favorite ? 'fill-gold text-gold' : ''} /></button>
        </div>
      </ParallaxCover>
    </div>
  )
}

function ModDiagnosticDialog({ diagnostic, onClose, onOpenFiles }: { diagnostic: ModDiagnosticView; onClose: () => void; onOpenFiles: () => void }) {
  const failed = diagnostic.checks.filter(check => !check.ok && !check.unknown).length
  return <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm"><section className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#111414] shadow-2xl">
    <header className="flex items-start gap-3 border-b border-white/[0.07] p-4"><Radar size={18} className="mt-0.5 text-gold" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white/82">Pourquoi « {diagnostic.mod.name} » ne fonctionne pas ?</h2><p className="mt-1 text-[11px] text-white/36">Diagnostic local ciblé · paquet {diagnostic.packageId}</p></div><button onClick={onClose} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06]"><X size={15} /></button></header>
    <div className="space-y-3 p-4"><div className={`rounded-xl border p-3 ${failed ? 'border-red-300/15 bg-red-300/[0.04]' : 'border-amber-300/15 bg-amber-300/[0.04]'}`}><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-white/72">Cause {diagnostic.confidence.toLocaleLowerCase()}</span><span className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] text-white/48">Confiance : {diagnostic.confidence}</span></div><p className="mt-2 text-xs leading-relaxed text-white/58">{diagnostic.cause}</p></div>
      <div className="grid gap-2 sm:grid-cols-2">{diagnostic.checks.map(check => <div key={check.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${check.ok ? 'bg-emerald-300' : check.unknown ? 'bg-amber-300' : 'bg-red-300'}`} /><span className="text-xs font-semibold text-white/65">{check.label}</span><span className="ml-auto text-[11px] text-white/32">{check.ok ? 'Confirmé' : check.unknown ? 'Inconnu' : 'Échec'}</span></div><p className="mt-2 break-words text-[11px] leading-relaxed text-white/40">{check.evidence}</p></div>)}</div>
      <p className="rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2 text-[11px] text-white/38">{diagnostic.winningFiles} fichier(s) gagnant(s) · {diagnostic.overriddenFiles} fichier(s) remplacé(s). ZAILON n’attribue jamais un crash à ce mod sans preuve runtime.</p>
    </div><footer className="flex justify-end gap-2 border-t border-white/[0.07] p-4"><button onClick={onClose} className="rounded-lg px-3 py-2 text-xs text-white/45">Fermer</button><button onClick={onOpenFiles} className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-[#101313]">Voir la carte des fichiers</button></footer>
  </section></div>
}

function CollectionDownloadsPanel({ gameId, gameName, onOpenProfile }: { gameId: string; gameName: string; onOpenProfile: (profileId: string) => void }) {
  const installCollectionDownloads = useStore(state => state.installCollectionDownloads)
  const [plans, setPlans] = useState<CollectionInstallPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState<string>()
  const knownStatuses = useRef<Map<string, string>>(new Map())
  const openedEntry = useRef<string>()

  const rememberStatuses = useCallback((items: CollectionInstallPlan[]) => {
    const next = new Map<string, string>()
    items.forEach(plan => plan.entries.forEach(entry => next.set(`${plan.installId}:${entry.collectionEntryId}`, entry.status)))
    knownStatuses.current = next
  }, [])

  const loadPlans = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const items = await native.listCollectionInstallPlans(gameId)
      setPlans(items)
      rememberStatuses(items)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [gameId, rememberStatuses])

  useEffect(() => {
    void loadPlans()
    let disposed = false
    let unlisten: (() => void) | undefined
    void listen<CollectionInstallPlan>('collection-install-changed', event => {
      const plan = event.payload
      if (plan.gameId !== gameId) return
      const completedNow = plan.entries.some(entry => {
        const key = `${plan.installId}:${entry.collectionEntryId}`
        return entry.status === 'Downloaded' && knownStatuses.current.get(key) !== 'Downloaded'
      })
      setPlans(current => {
        const next = [plan, ...current.filter(item => item.installId !== plan.installId)]
          .sort((left, right) => right.updatedAt - left.updatedAt)
        rememberStatuses(next)
        return next
      })
      if (completedNow && plan.openNextRequiredPage && !plan.automaticExecution) {
        const nextEntry = plan.entries.find(entry => entry.status === 'WaitingForUser' && entry.sourceUrl)
        const key = nextEntry ? `${plan.installId}:${nextEntry.collectionEntryId}` : undefined
        if (nextEntry && key && openedEntry.current !== key) {
          openedEntry.current = key
          void native.openExternalUrl(nextEntry.sourceUrl)
        }
      }
    }).then(listener => {
      if (disposed) listener()
      else unlisten = listener
    }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [gameId, loadPlans, rememberStatuses])

  const runAction = async (plan: CollectionInstallPlan, action: 'pause' | 'resume' | 'cancel' | 'start') => {
    if (action === 'cancel' && !window.confirm(`Annuler l’installation de « ${plan.collectionName} » ? Les fichiers déjà téléchargés resteront dans le cache.`)) return
    setBusyId(plan.installId)
    setError(undefined)
    try {
      const updated = action === 'start'
        ? await native.startCollectionInstall(gameId, plan.installId)
        : await native.updateCollectionInstall(gameId, plan.installId, action)
      setPlans(current => [updated, ...current.filter(item => item.installId !== updated.installId)].sort((left, right) => right.updatedAt - left.updatedAt))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyId(undefined)
    }
  }

  const installDownloadedFiles = async (plan: CollectionInstallPlan) => {
    setBusyId(plan.installId)
    setError(undefined)
    const installed = await installCollectionDownloads(gameId, plan.installId, gameName)
    if (!installed) setError('Le staging de la Collection a échoué. Consultez le Centre d’activité pour le détail.')
    await loadPlans()
    setBusyId(undefined)
  }

  if (loading) return <EmptyPanel icon={Download} title="Chargement des téléchargements" detail="Lecture des plans persistants de Collections…" />
  if (!plans.length && !error) return <EmptyPanel icon={Download} title="Aucune Collection en attente" detail="Installez une Collection depuis Explorer > Nexus. Son plan et sa progression resteront disponibles après un redémarrage." />

  return <div className="min-h-0 flex-1 overflow-y-auto p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-sm font-semibold text-white/78">Installations de Collections</h2><p className="mt-1 text-[11px] text-white/38">File persistante, téléchargement Nexus officiel et reprise après fermeture.</p></div>
      <button type="button" onClick={() => void loadPlans()} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/55 hover:bg-white/[0.05]"><RefreshCw size={13} />Actualiser</button>
    </div>
    {error && <p className="mb-3 rounded-lg border border-red-300/15 bg-red-300/[0.035] p-3 text-[11px] text-red-100/70">{error}</p>}
    <div className="space-y-3">{plans.map(plan => {
      const completed = plan.entries.filter(entry => matchesCollectionStatus(entry.status, ['Downloaded', 'Installed', 'Skipped'])).length
      const waiting = plan.entries.filter(entry => entry.status === 'WaitingForUser').length
      const failed = plan.entries.filter(entry => entry.status === 'Failed' || entry.status === 'Unavailable').length
      const queued = plan.entries.filter(entry => entry.status === 'Queued').length
      const downloaded = plan.entries.filter(entry => entry.status === 'Downloaded').length
      const nextEntry = plan.entries.find(entry => entry.status === 'WaitingForUser' && entry.sourceUrl)
      const progress = plan.entries.length ? Math.round(completed / plan.entries.length * 100) : 0
      const premium = plan.accountCapabilities.supportsAutomaticCollectionDownloads === true
      const running = plan.profileState === 'Downloading' && plan.automaticExecution
      const paused = plan.profileState === 'Paused'
      return <article key={plan.installId} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white/78">{plan.collectionName}</h3><p className="mt-1 text-[11px] text-white/38">Profil « {plan.profileName} » · Révision {plan.revisionNumber} · {plan.entries.length} fichiers · {formatBytes(plan.downloadBytes)}</p></div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] ${plan.profileState === 'Cancelled' ? 'bg-red-300/10 text-red-200/70' : failed ? 'bg-amber-300/10 text-amber-100/70' : 'bg-sky-300/10 text-sky-100/68'}`}>{plan.profileState}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${progress}%` }} /></div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/42"><span>{completed} téléchargé(s)</span><span>{waiting} confirmation(s)</span><span>{queued} en file</span><span>{failed} problème(s)</span><span>{progress}%</span></div>
        {nextEntry && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/15 bg-gold/[0.025] p-3"><div className="min-w-0"><p className="text-[11px] font-semibold text-white/68">Téléchargement requis · {nextEntry.displayName}</p><p className="mt-1 truncate text-[11px] text-white/36">Fichier exact : {nextEntry.fileName} · ID {nextEntry.fileId}</p></div><button type="button" onClick={() => void native.openExternalUrl(nextEntry.sourceUrl)} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]"><ExternalLink size={13} />Ouvrir la page Nexus</button></div>}
        {plan.warnings.length > 0 && <p className="mt-3 text-[11px] leading-relaxed text-amber-100/55">{plan.warnings[plan.warnings.length - 1]}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {premium && queued > 0 && !running && plan.profileState !== 'Cancelled' && <button type="button" disabled={busyId === plan.installId} onClick={() => void runAction(plan, 'start')} className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold text-[var(--zailon-accent-text)]"><Play size={13} />{paused ? 'Reprendre Premium' : 'Démarrer Premium'}</button>}
          {downloaded > 0 && plan.profileState !== 'Cancelled' && <button type="button" disabled={busyId === plan.installId} onClick={() => void installDownloadedFiles(plan)} className="flex items-center gap-1.5 rounded-lg bg-emerald-200 px-3 py-2 text-[11px] font-semibold text-[#101313]"><Boxes size={13} />Analyser et installer {downloaded}</button>}
          {running && <button type="button" disabled={busyId === plan.installId} onClick={() => void runAction(plan, 'pause')} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/58"><Pause size={13} />Pause</button>}
          {!premium && paused && <button type="button" disabled={busyId === plan.installId} onClick={() => void runAction(plan, 'resume')} className="flex items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/58"><Play size={13} />Reprendre</button>}
          <button type="button" onClick={() => onOpenProfile(plan.profileId)} className="rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/55">Voir le profil</button>
          {!matchesCollectionStatus(plan.profileState, ['Cancelled', 'Ready']) && <button type="button" disabled={busyId === plan.installId} onClick={() => void runAction(plan, 'cancel')} className="rounded-lg border border-red-300/12 px-3 py-2 text-[11px] text-red-200/65">Annuler</button>}
        </div>
      </article>
    })}</div>
  </div>
}

function matchesCollectionStatus(status: string, values: string[]) {
  return values.includes(status)
}

function BulkActionDialog({ mode, count, source, profiles, onClose, onConfirm }: {
  mode: 'move' | 'copy' | 'delete' | 'tag'
  count: number
  source: Profile
  profiles: Profile[]
  onClose: () => void
  onConfirm: (value: string) => Promise<void>
}) {
  const destinations = profiles.filter(profile => profile.id !== source.id)
  const [value, setValue] = useState(mode === 'delete' ? 'current' : mode === 'tag' ? '' : destinations[0]?.id || '')
  const title = mode === 'move' ? 'Transférer la sélection' : mode === 'copy' ? 'Copier la sélection' : mode === 'delete' ? 'Retirer la sélection' : 'Ajouter une étiquette'
  const valid = mode === 'tag' ? value.trim().length > 0 : Boolean(value)
  return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/78 p-4 backdrop-blur-md" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#101313] p-4 shadow-2xl"><header className="flex items-start justify-between gap-3"><div><h2 className="font-display text-xl font-bold text-white">{title}</h2><p className="mt-1 text-xs text-white/42">Source : {source.name} · {count} mod(s)</p></div><button onClick={onClose} className="rounded-lg p-2 text-white/40 hover:bg-white/[0.05]"><X size={16} /></button></header>{mode === 'move' || mode === 'copy' ? <><label className="mt-4 block text-xs text-white/50">Profil de destination<select value={value} onChange={event => setValue(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-white/[0.09] bg-[#0b0d0d] px-3 py-2 text-white/75">{destinations.map(profile => <option key={profile.id} value={profile.id} disabled={profile.locked}>{profile.name}{profile.locked ? ' — verrouillé' : ''}</option>)}</select></label><div className="mt-3 rounded-lg border border-sky-300/15 bg-sky-300/[0.04] p-3 text-xs leading-relaxed text-sky-100/58">{mode === 'copy' ? 'La copie ajoute des références au même paquet immuable. Les futurs fichiers générés restent dans l’overwrite du profil destination : aucun fichier source partagé n’est modifié.' : 'Le transfert ajoute d’abord les références à la destination, valide les manifestes, puis les retire de la source. En cas d’échec, la transaction restaure les deux profils.'}</div></> : mode === 'delete' ? <><label className="mt-4 block text-xs text-white/50">Portée<select value={value} onChange={event => setValue(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-white/[0.09] bg-[#0b0d0d] px-3 py-2 text-white/75"><option value="current">Retirer du profil courant — fichiers conservés</option><option value="all">Retirer de tous les profils — fichiers conservés</option><option value="permanent">Supprimer définitivement du PC</option></select></label><p className={`mt-3 rounded-lg border p-3 text-xs leading-relaxed ${value === 'permanent' ? 'border-red-300/20 bg-red-300/[0.05] text-red-100/70' : 'border-amber-300/15 bg-amber-300/[0.04] text-amber-100/58'}`}>{value === 'permanent' ? 'Suppression réelle : ZAILON effacera les paquets du store ou du dossier Mods et les retirera de tous les profils. Cette action est irréversible et demandera une seconde confirmation.' : 'Le retrait logique est annulable. Les fichiers restent dans le store partagé, mais ils ne seront plus comptés dans ce profil.'}</p></> : <label className="mt-4 block text-xs text-white/50">Étiquette personnalisée<input autoFocus value={value} onChange={event => setValue(event.target.value)} placeholder="Ex. Graphismes, Correctifs…" className="mt-1.5 block w-full rounded-lg border border-white/[0.09] bg-[#0b0d0d] px-3 py-2 text-white/75 outline-none focus:border-gold/35" /></label>}<footer className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg px-3 py-2 text-xs text-white/48">Annuler</button><button disabled={!valid} onClick={() => void onConfirm(value)} className={`rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-35 ${value === 'permanent' ? 'bg-red-500 text-white' : 'bg-gold text-[var(--zailon-accent-text)]'}`}>Confirmer</button></footer></section></div>
}

const DEFAULT_MO2_IMPORT_OPTIONS: Mo2ImportOptions = {
  mods: true,
  metadata: true,
  overwrite: true,
  downloads: false,
  executables: false,
  categories: true,
  notes: true,
  hiddenFiles: true,
}

function Mo2ImportDialog({ gameId, gameName, onClose, onImported }: { gameId: string; gameName: string; onClose: () => void; onImported: (result: Mo2ImportResult) => Promise<void> }) {
  const [sourcePath, setSourcePath] = useState('G:\\2_Logiciel\\MOD ORGANIZER')
  const [preview, setPreview] = useState<Mo2ImportPreview>()
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set())
  const [profileNames, setProfileNames] = useState<Record<string, string>>({})
  const [options, setOptions] = useState<Mo2ImportOptions>(DEFAULT_MO2_IMPORT_OPTIONS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const analyze = async (path = sourcePath) => {
    if (!path.trim()) return
    setBusy(true)
    setError(undefined)
    try {
      const result = await native.previewMo2Import(path.trim())
      setPreview(result)
      setSourcePath(result.root)
      setSelectedProfiles(new Set(result.profiles.map(profile => profile.name)))
      setProfileNames(Object.fromEntries(result.profiles.map(profile => [profile.name, `MO2 · ${profile.name}`])))
    } catch (reason) {
      setPreview(undefined)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const browse = async () => {
    const path = await pickFolder('Sélectionnez la racine de Mod Organizer 2')
    if (path) {
      setSourcePath(path)
      await analyze(path)
    }
  }

  const setOption = (key: keyof Mo2ImportOptions, value: boolean) =>
    setOptions(current => ({ ...current, [key]: value }))

  const commit = async () => {
    if (!preview || !selectedProfiles.size) return
    const selected = preview.profiles.filter(profile => selectedProfiles.has(profile.name))
    const estimated = preview.requiredBytes
    const confirmation = [
      `Importer ${selected.length} profil(s) et jusqu’à ${preview.installedMods} mod(s) depuis Mod Organizer 2 ?`,
      '',
      options.overwrite ? `${preview.overwriteFiles} fichier(s) Overwrite seront copiés vers le profil MO2 actif.` : 'Overwrite ne sera pas copié.',
      options.downloads ? `Les ${preview.downloads} fichiers de téléchargement seront aussi copiés.` : 'Les archives téléchargées resteront dans MO2.',
      options.executables ? 'Les exécutables locaux valides seront référencés, jamais lancés automatiquement.' : 'Les exécutables MO2 seront ignorés.',
      `Volume source maximal concerné : ${formatBytes(estimated)}.`,
      '',
      'La source MO2 restera en lecture seule. Continuer ?',
    ].join('\n')
    if (!window.confirm(confirmation)) return
    setBusy(true)
    setError(undefined)
    try {
      const result = await native.importMo2Instance(crypto.randomUUID(), {
        sourcePath: preview.root,
        gameId,
        gameName,
        profiles: selected.map(profile => ({
          sourceName: profile.name,
          targetId: crypto.randomUUID(),
          targetName: profileNames[profile.name]?.trim() || `MO2 · ${profile.name}`,
        })),
        options,
      })
      await onImported(result)
      window.alert([
        `Import MO2 terminé : ${result.importedMods} mod(s), ${result.profiles.length} profil(s).`,
        result.skippedMods ? `${result.skippedMods} mod(s) ignoré(s).` : '',
        result.sourceUnchanged ? 'Contrôle réussi : les configurations MO2 sont inchangées.' : 'Attention : les configurations MO2 ont changé pendant l’import.',
        `Rapport : ${result.reportPath}`,
      ].filter(Boolean).join('\n'))
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const optionRows: Array<{ key: keyof Mo2ImportOptions; title: string; detail: string }> = [
    { key: 'mods', title: 'Mods et ordre des profils', detail: 'Copie chaque paquet une seule fois dans le store ZAILON et convertit les priorités MO2.' },
    { key: 'metadata', title: 'Métadonnées sûres', detail: 'Version, dépôt, identifiants de mod et URL. Les secrets sont toujours exclus.' },
    { key: 'overwrite', title: 'Dossier Overwrite', detail: 'Copie l’Overwrite global uniquement vers le profil qui était actif dans MO2.' },
    { key: 'downloads', title: 'Archives téléchargées', detail: 'Option lourde : copie les archives et leurs fichiers .meta, sans cache incomplet.' },
    { key: 'executables', title: 'Exécutables configurés', detail: 'Référence seulement les chemins encore valides. Aucun exécutable n’est copié ou lancé.' },
    { key: 'categories', title: 'Catégories', detail: 'Conserve les catégories présentes dans les meta.ini des mods.' },
    { key: 'notes', title: 'Notes des mods', detail: 'Conserve notes, commentaires et couleur sans importer les journaux.' },
    { key: 'hiddenFiles', title: 'Fichiers .mohidden', detail: 'Convertit la convention MO2 en règles de fichiers cachés par profil.' },
  ]

  return <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="mo2-import-title" className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#111414] shadow-2xl">
      <header className="flex items-start gap-3 border-b border-white/[0.07] p-4"><Archive size={19} className="mt-0.5 text-gold" /><div className="min-w-0 flex-1"><h2 id="mo2-import-title" className="text-base font-semibold text-white">Importer depuis Mod Organizer 2</h2><p className="mt-1 text-[11px] leading-relaxed text-white/42">Assistant indépendant : aucune DLL, interface, icône, traduction ou ressource MO2 n’entre dans ZAILON.</p></div><button onClick={onClose} disabled={busy} aria-label="Fermer" className="rounded-lg p-2 text-white/38 hover:bg-white/[0.06] disabled:opacity-30"><X size={16} /></button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div><label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-white/38">Instance portable MO2</label><div className="flex gap-2"><input value={sourcePath} onChange={event => setSourcePath(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2.5 font-mono text-[11px] text-white/68 outline-none focus:border-gold/35" /><button type="button" onClick={() => void browse()} disabled={busy} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-semibold text-white/62 hover:bg-white/[0.05]">Parcourir</button><button type="button" onClick={() => void analyze()} disabled={busy || !sourcePath.trim()} className="rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-ink-400 disabled:opacity-35">{busy ? 'Analyse…' : 'Analyser'}</button></div></div>
        {preview && <><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Version MO2" value={preview.version || 'Inconnue'} /><Metric label="Mods installés" value={String(preview.installedMods)} /><Metric label="Profils" value={String(preview.profiles.length)} /><Metric label="Volume maximal" value={formatBytes(preview.requiredBytes)} /></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-3"><h3 className="text-xs font-semibold text-white/72">Profils à recréer</h3><div className="mt-3 space-y-2">{preview.profiles.map(profile => <div key={profile.name} className="rounded-lg border border-white/[0.06] bg-black/15 p-2.5"><label className="flex items-start gap-2"><ZailonSelectionCheckbox checked={selectedProfiles.has(profile.name)} onChange={() => setSelectedProfiles(current => { const next = new Set(current); next.has(profile.name) ? next.delete(profile.name) : next.add(profile.name); return next })} className="mt-1" /><span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold text-white/72">{profile.name}{preview.selectedProfile === profile.name && <span className="ml-2 rounded bg-gold/10 px-1.5 py-0.5 text-gold">actif</span>}</span><span className="mt-1 block text-[11px] text-white/38">{profile.modCount} mods · {profile.enabledCount} actifs · {profile.disabledCount} désactivés · {profile.separatorCount} séparateurs</span></span></label>{selectedProfiles.has(profile.name) && <input value={profileNames[profile.name] || ''} onChange={event => setProfileNames(current => ({ ...current, [profile.name]: event.target.value }))} aria-label={`Nom ZAILON pour ${profile.name}`} className="mt-2 w-full rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1.5 text-[11px] text-white/65 outline-none focus:border-gold/30" />}</div>)}</div></section>
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-3"><h3 className="text-xs font-semibold text-white/72">Données à importer</h3><div className="mt-3 space-y-1.5">{optionRows.map(option => <label key={option.key} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-white/[0.025]"><ZailonSelectionCheckbox checked={options[option.key]} disabled={(option.key === 'categories' || option.key === 'notes') && !options.metadata} onChange={checked => setOption(option.key, checked)} className="mt-1" /><span><strong className="block text-[11px] text-white/68">{option.title}</strong><span className="mt-0.5 block text-[11px] leading-relaxed text-white/34">{option.detail}</span></span></label>)}</div></section>
          </div>
          <div className="rounded-xl border border-sky-300/14 bg-sky-300/[0.035] p-3 text-[11px] leading-relaxed text-sky-100/62"><strong className="text-sky-100/82">Aperçu en lecture seule :</strong> {preview.overwriteFiles} fichier(s) Overwrite ({formatBytes(preview.overwriteBytes)}), {preview.downloads} fichier(s) téléchargé(s), {preview.executables.length} exécutable(s) déclaré(s), {preview.pluginFiles} fichier(s) de plugins MO2 exclus. {preview.secretKeysDetected > 0 && `${preview.secretKeysDetected} clé(s) sensible(s) seront ignorées.`}</div>
          <div className="space-y-1">{preview.warnings.map(warning => <p key={warning} className="text-[11px] leading-relaxed text-amber-100/58">• {warning}</p>)}</div>
        </>}
        {error && <p className="rounded-lg border border-red-400/15 bg-red-400/[0.04] p-3 text-[11px] leading-relaxed text-red-200/72">{error}</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] p-4"><p className="text-[11px] text-white/32">Copie transactionnelle vers le stockage local ZAILON · MO2 n’est jamais modifié.</p><div className="flex gap-2"><button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-[11px] text-white/48 disabled:opacity-30">Fermer</button><button type="button" onClick={() => void commit()} disabled={busy || !preview || !selectedProfiles.size} className="rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-ink-400 disabled:opacity-35">{busy ? 'Import en cours…' : `Importer ${selectedProfiles.size || ''} profil(s)`}</button></div></footer>
    </section>
  </div>
}

function ModImportDialog({ gameId, profileId, gameName, destination, onClose, onImported }: { gameId: string; profileId: string; gameName: string; destination?: string; onClose: () => void; onImported: () => void }) {
  const autoReduce = useStore(state => state.taskAutoReduceImports)
  const upsertBackgroundTask = useStore(state => state.upsertBackgroundTask)
  const registerImportedStages = useStore(state => state.registerImportedStages)
  const [candidates, setCandidates] = useState<ModImportCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [dragActive, setDragActive] = useState(false)
  const [visibleCount, setVisibleCount] = useState(250)
  const [task, setTask] = useState<BackgroundTaskSnapshot>()
  const [taskId, setTaskId] = useState<string>()
  const [deployNow, setDeployNow] = useState(true)
  const [sensitivePrompt, setSensitivePrompt] = useState(false)
  const [decisionTask, setDecisionTask] = useState<BackgroundTaskSnapshot>()
  const reduceTimer = useRef<number>()
  const visibleCandidates = candidates.slice(0, visibleCount)

  const analyze = useCallback(async (paths: string[]) => {
    if (!paths.length) return
    setBusy(true); setError(undefined)
    try {
      const nextTaskId = crypto.randomUUID()
      setTaskId(nextTaskId)
      const found = await native.scanModImportBackground(nextTaskId, paths, gameName, setTask)
      setCandidates(current => {
        const merged = new Map(current.map(item => [item.path, item]))
        found.forEach(item => merged.set(item.path, item))
        return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name))
      })
      setSelected(current => {
        const next = new Set(current)
        found.forEach(item => next.add(item.path))
        return next
      })
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false); setTaskId(undefined) }
  }, [gameName])

  const choose = async () => {
    const paths = await pickFolders('Sélectionnez un dossier contenant tous les mods')
    await analyze(paths)
  }

  useEffect(() => {
    if (!native.isDesktop()) return
    let unlisten: (() => void) | undefined
    let disposed = false
    void getCurrentWindow().onDragDropEvent(event => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') setDragActive(true)
      if (event.payload.type === 'leave') setDragActive(false)
      if (event.payload.type === 'drop') {
        setDragActive(false)
        void analyze(event.payload.paths)
      }
    }).then(listener => {
      if (disposed) listener()
      else unlisten = listener
    }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
    return () => { disposed = true; unlisten?.() }
  }, [analyze])

  const selectedSensitiveFiles = candidates.filter(item => selected.has(item.path)).flatMap(item => item.sensitiveFiles || [])

  const executeCommit = async (sensitiveAction: SensitiveImportAction) => {
    if (!destination) { setError('Configurez le dossier Mods du jeu avant l’import.'); return }
    const paths = candidates.filter(item => selected.has(item.path)).map(item => item.path)
    if (!paths.length) return
    setBusy(true); setError(undefined)
    try {
      const nextTaskId = crypto.randomUUID()
      setTaskId(nextTaskId)
      const result = await native.importModCandidatesBackground(nextTaskId, gameId, [profileId], paths, gameName, destination, deployNow, sensitiveAction, nextTask => {
        setTask(nextTask)
        if (autoReduce && nextTask.status === 'running' && nextTask.processed > 0 && !reduceTimer.current) reduceTimer.current = window.setTimeout(onClose, 1_500)
      })
      await registerImportedStages(gameId, profileId, result.installedPaths, deployNow)
      if (result.status === 'CompletedWithWarnings') setError(`Import terminé avec avertissement : ${result.sensitiveFiles.length} fichier(s) sensible(s) traité(s). Aucun n’a été exécuté.`)
      onImported()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setBusy(false)
      setTaskId(undefined)
    }
  }

  const commit = () => {
    if (!selectedSensitiveFiles.length) { void executeCommit('quarantine'); return }
    const now = Math.floor(Date.now() / 1000)
    const pending: BackgroundTaskSnapshot = {
      id: crypto.randomUUID(), kind: 'mod-import', title: 'Import suspendu pour vérification', status: 'awaiting_user_decision',
      processed: 0, total: selectedSensitiveFiles.length,
      message: `${selectedSensitiveFiles.length} fichier(s) sensible(s) attendent votre décision. Aucun n’a été exécuté.`,
      startedAt: now, updatedAt: now,
    }
    setDecisionTask(pending)
    upsertBackgroundTask(pending)
    setSensitivePrompt(true)
  }
  const closeSensitivePrompt = () => {
    if (decisionTask) upsertBackgroundTask({ ...decisionTask, status: 'cancelled', message: 'Import annulé par l’utilisateur. Aucun fichier sensible n’a été exécuté.', updatedAt: Math.floor(Date.now() / 1000) })
    setSensitivePrompt(false)
  }
  const decideSensitiveImport = (action: SensitiveImportAction) => {
    if (decisionTask) upsertBackgroundTask({ ...decisionTask, status: 'completed', processed: decisionTask.total, message: `Décision enregistrée : ${action}. Le staging transactionnel peut commencer.`, updatedAt: Math.floor(Date.now() / 1000) })
    setSensitivePrompt(false)
    void executeCommit(action)
  }

  const cancelTask = () => taskId && void native.cancelBackgroundTask(taskId)
  const progress = task?.total ? Math.min(100, Math.round(task.processed / task.total * 100)) : 0

  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`relative flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-[#111414] shadow-2xl transition-colors ${dragActive ? 'border-gold/70 ring-2 ring-gold/20' : 'border-white/[0.1]'}`}>
      {dragActive && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#101313]/90 backdrop-blur-sm"><div className="text-center text-gold"><FolderInput size={36} className="mx-auto" /><p className="mt-3 text-sm font-semibold">Déposez le dossier contenant tous vos mods</p><p className="mt-1 text-[11px] text-white/48">Tous les sous-dossiers détectés seront ajoutés, sans limite de nombre.</p></div></div>}
      <header className="flex items-center gap-3 border-b border-white/[0.07] p-4"><FolderInput size={18} className="text-gold" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white">Import intelligent — {gameName}</h2><p className="mt-0.5 text-[11px] text-white/38">Glissez le dossier racine de votre collection, ou sélectionnez-le. Aucun dossier n’est copié avant confirmation.</p></div><button onClick={onClose} title={busy ? 'Réduire : la tâche continue en arrière-plan' : 'Fermer'} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={15} /></button></header>
      <div className="min-h-48 flex-1 overflow-y-auto p-4">
        {!candidates.length ? <button onClick={() => void choose()} disabled={busy} className="flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed border-gold/25 bg-gold/[0.015] text-white/50 hover:bg-gold/[0.035]"><FolderPlus size={26} /><span className="mt-3 text-xs font-semibold">Glissez ici le dossier contenant tous les mods</span><span className="mt-1 text-[11px]">ou cliquez pour sélectionner le dossier racine — aucun maximum de mods</span><span className="mt-1 text-[11px] text-white/28">Générique, Cyberpunk, Bethesda, Unreal Pak, XXMI et BepInEx</span></button> : <div className="space-y-2">{visibleCandidates.map(candidate => <label key={candidate.path} className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><ZailonSelectionCheckbox checked={selected.has(candidate.path)} onChange={() => setSelected(current => { const next = new Set(current); next.has(candidate.path) ? next.delete(candidate.path) : next.add(candidate.path); return next })} className="mt-1" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-white/78">{candidate.name}</span><span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-white/45">{candidate.detectedFramework !== 'Unknown' ? candidate.detectedFramework : candidate.framework}</span><span className="text-[11px] text-white/30">racine {candidate.rootConfidence}</span></div><p className="mt-1 truncate font-mono text-[11px] text-white/30" title={candidate.sourcePath}>{candidate.sourcePath}</p><p className="mt-1 text-[11px] text-white/42">Racine détectée : <span className="font-mono text-white/55">{candidate.detectedRoot}</span></p>{candidate.relativeGamePaths.length > 0 && <p className="mt-1 text-[11px] text-emerald-100/55">Destination(s) : {candidate.relativeGamePaths.join(' · ')}</p>}{candidate.strippedSegments.length > 0 && <p className="mt-1 text-[11px] text-sky-100/50">Conteneur(s) ignoré(s) : {candidate.strippedSegments.join(' / ')}</p>}<p className="mt-1 text-[11px] text-white/32">{candidate.rootReason}</p>{candidate.sourceUrl && <p className="mt-1 text-[11px] text-emerald-200/55">Source détectée : {candidate.sourceUrl}</p>}{candidate.warnings.map(warning => <p key={warning} className="mt-1 text-[11px] text-amber-200/55">{warning}</p>)}</div><span className="text-[11px] text-white/30">{formatBytes(candidate.sizeBytes)}</span></label>)}{visibleCount < candidates.length && <button onClick={() => setVisibleCount(count => count + 250)} className="w-full rounded-lg border border-white/[0.08] py-2 text-[11px] text-white/45 hover:bg-white/[0.04]">Afficher 250 résultats supplémentaires ({candidates.length - visibleCount} restants)</button>}</div>}
        {task && <div className="mt-3 rounded-xl border border-gold/15 bg-gold/[0.025] p-3"><div className="flex items-center justify-between gap-3 text-[11px]"><span className="truncate text-white/62">{task.message}</span><span className="shrink-0 font-mono text-gold/70">{task.total ? `${progress}%` : '…'}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-white/32"><span>{task.processed} / {task.total || '?'} · {task.status}</span>{busy && taskId && <button type="button" onClick={cancelTask} className="rounded border border-red-300/15 px-2 py-1 text-red-200/64">Annuler la tâche</button>}</div></div>}
        {candidates.length > 0 && <label className="mt-3 flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.018] p-3 text-[11px] text-white/58"><span><strong className="block text-white/72">Activer pour le prochain lancement</strong><span className="mt-1 block leading-relaxed text-white/34">Les fichiers restent stockés hors du jeu. Au lancement, TemporaryCopy résout les conflits, sauvegarde les originaux, copie chaque fichier vers sa vraie racine, vérifie sa visibilité puis restaure le jeu à sa fermeture. Ce backend n’est pas le VFS de MO2.</span></span><ZailonSwitch checked={deployNow} onChange={setDeployNow} className="mt-0.5" /></label>}
        {error && <p className="mt-3 rounded-lg border border-red-400/15 bg-red-400/[0.04] p-3 text-[11px] text-red-200/70">{error}</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] p-4"><div className="flex items-center gap-2"><button onClick={() => void choose()} disabled={busy} className="rounded-lg border border-white/[0.09] px-3 py-2 text-[11px] text-white/55 hover:bg-white/[0.05]">Ajouter un dossier racine</button>{candidates.length > 0 && <span className="text-[11px] text-white/32">{candidates.length} mod(s) détecté(s){selectedSensitiveFiles.length ? ` · ${selectedSensitiveFiles.length} sensible(s)` : ''}</span>}</div><div className="flex gap-2"><button onClick={onClose} className="rounded-lg px-3 py-2 text-[11px] text-white/45">{busy ? 'Réduire' : 'Fermer'}</button><button onClick={commit} disabled={busy || !selected.size} className="rounded-lg bg-gold px-4 py-2 text-[11px] font-semibold text-ink-400 disabled:opacity-35">{busy ? `${task?.message || 'Tâche en cours…'} ${task?.total ? `${progress}%` : ''}` : `${deployNow ? 'Importer et activer' : 'Stocker'} ${selected.size} mod(s)`}</button></div></footer>
    </section>
    {sensitivePrompt && <SensitiveFileDecisionDialog files={selectedSensitiveFiles} onClose={closeSensitivePrompt} onDecision={decideSensitiveImport} />}
  </div>
}

function SensitiveFileDecisionDialog({ files, onClose, onDecision }: { files: SensitiveFileAssessment[]; onClose: () => void; onDecision: (action: SensitiveImportAction) => void }) {
  const [showAll, setShowAll] = useState(false)
  const file = files[0]
  const quarantineBytes = files.filter(item => !item.mayDeploy).reduce((sum, item) => sum + item.size, 0)
  return <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/82 p-4 backdrop-blur-md" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="sensitive-file-title" className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-300/20 bg-[#101313] p-5 shadow-2xl">
      <header className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200"><AlertTriangle size={20} /></span><div className="min-w-0 flex-1"><h2 id="sensitive-file-title" className="font-display text-xl font-bold text-white">Fichier exécutable détecté</h2><p className="mt-1 text-xs leading-relaxed text-white/48">Le mod contient {files.length} fichier(s) pouvant exécuter du code. ZAILON ne les lancera jamais automatiquement.</p></div><button onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-white/38 hover:bg-white/[0.06]"><X size={16} /></button></header>
      <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><code className="break-all text-xs font-semibold text-amber-100/80">{file.relativePath}</code><span className={`rounded-full px-2 py-1 text-[11px] ${file.riskLevel === 'HighRisk' || file.riskLevel === 'Blocked' ? 'bg-red-300/10 text-red-200' : 'bg-amber-300/10 text-amber-100'}`}>{file.riskLevel}</span></div><dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2"><div><dt className="text-white/28">Type</dt><dd className="mt-0.5 text-white/58">{file.detectedType} · {file.magicType}</dd></div><div><dt className="text-white/28">Taille</dt><dd className="mt-0.5 text-white/58">{formatBytes(file.size)}</dd></div><div><dt className="text-white/28">SHA-256</dt><dd title={file.hash} className="mt-0.5 font-mono text-white/58">{file.hash.slice(0, 16)}…</dd></div><div><dt className="text-white/28">Signature</dt><dd className="mt-0.5 text-white/58">{file.signatureStatus} · éditeur {file.publisher || 'inconnu'}</dd></div></dl><p className="mt-3 text-[11px] leading-relaxed text-white/42">{file.reasons.join(' ')}</p></div>
      <div className="mt-3 rounded-xl border border-sky-300/14 bg-sky-300/[0.035] p-3 text-[11px] leading-relaxed text-sky-100/60"><strong className="text-sky-100/80">Aperçu :</strong> {files.length} fichier(s) sensible(s), {formatBytes(quarantineBytes)} à isoler, aucun écrasement de fichier existant et aucune exécution automatique.</div>
      {showAll && <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/[0.07] p-2">{files.map(item => <div key={`${item.relativePath}-${item.hash}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-[11px] hover:bg-white/[0.03]"><code className="min-w-0 truncate text-white/55">{item.relativePath}</code><span className="shrink-0 text-white/30">{item.riskLevel} · {item.hash.slice(0, 8)}</span></div>)}</div>}
      <button type="button" onClick={() => setShowAll(value => !value)} className="mt-3 text-[11px] font-semibold text-gold">{showAll ? 'Masquer la liste' : 'Afficher tous les fichiers sensibles'}</button>
      <footer className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => onDecision('quarantine')} className="rounded-lg bg-gold px-4 py-3 text-xs font-semibold text-[var(--zailon-accent-text)]">Conserver en quarantaine · recommandé</button><button type="button" onClick={() => onDecision('exclude')} className="rounded-lg border border-white/[0.1] px-4 py-3 text-xs font-semibold text-white/62 hover:bg-white/[0.05]">Importer sans ces fichiers</button><button type="button" onClick={() => onDecision('inactive')} className="rounded-lg border border-white/[0.1] px-4 py-3 text-xs text-white/58 hover:bg-white/[0.05]">Inclure comme fichiers inactifs</button><button type="button" onClick={onClose} className="rounded-lg border border-red-300/12 px-4 py-3 text-xs text-red-200/65 hover:bg-red-300/[0.04]">Annuler l’import</button></footer>
      <p className="mt-3 text-center text-[11px] text-white/28">Aucun bouton « Exécuter quand même » n’est proposé et aucun droit administrateur ne sera demandé.</p>
    </section>
  </div>
}


function Metric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 ${wide ? 'sm:col-span-2' : ''}`}><p className="text-[11px] uppercase tracking-widest text-white/30">{label}</p><p className="mt-2 break-all text-lg font-semibold text-white/75">{value}</p></div>
}

function EmptyPanel({ icon: Icon, title, detail }: { icon: typeof Download; title: string; detail: string }) {
  return <div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><Icon size={22} className="text-white/22" /><h2 className="mt-3 text-sm font-semibold text-white/62">{title}</h2><p className="mt-1 max-w-lg text-[11px] leading-relaxed text-white/36">{detail}</p></div>
}

function formatBytes(size: number) {
  if (!size) return '0 octet'
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(1)} Go`
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(1)} Mo`
  return `${Math.max(1, Math.round(size / 1024))} Ko`
}
