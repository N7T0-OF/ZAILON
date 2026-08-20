/**
 * Frosty Editor — logique pure de l'add-on `official.zailon.frosty-editor`
 * (spec ZAILON Frosty Editor §1-122).
 *
 * Règles :
 * - aucun accès DOM / fs — testable sous `node --test` ;
 * - l'éditeur est un add-on DISTINCT de Frosty Support (§1) et en dépend (§57) ;
 * - lazy strict : zéro initialisation au boot (§3, §116) ;
 * - le travail lourd tourne dans un Worker isolé (§76-83) : fermer l'éditeur
 *   libère immédiatement la RAM Frosty, un crash de plugin ne ferme pas ZAILON ;
 * - licence : ZAILON ne bundle JAMAIS le code Frosty (CC BY-NC-ND 4.0 sur la
 *   branche 1.0.6, §87-89) — il pilote le runtime Frosty officiel externe.
 */

/** Capacités d'édition d'un jeu Frostbite, dérivées du profil/plugins (§59-60). */
export interface FrostyEditorSupport {
  ebx: boolean
  textures: boolean
  mesh: boolean
  audio: boolean
  localization: boolean
  bundles: boolean
  build: boolean
}

/** Matrice de support par jeu (issue de l'audit des profils Frosty, §58-60). */
export const FROSTY_EDITOR_SUPPORT: Record<string, FrostyEditorSupport> = {
  // Need for Speed (2015) — NFS16SDK : cible de validation complète (§58).
  'Need for Speed (2015)': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Need for Speed 2016': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Need for Speed Heat': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Need for Speed Unbound': { ebx: true, textures: true, mesh: true, audio: false, localization: false, bundles: true, build: true },
  'Need for Speed Payback': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Need for Speed Rivals': { ebx: true, textures: true, mesh: true, audio: false, localization: false, bundles: true, build: true },
  'Battlefield 1': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Battlefield 4': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Battlefield Hardline': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Battlefield V': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Anthem': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Dragon Age: Inquisition': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Mass Effect: Andromeda': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Mirror\'s Edge Catalyst': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'FIFA 17': { ebx: true, textures: true, mesh: true, audio: true, localization: true, bundles: true, build: true },
  'FIFA 18': { ebx: true, textures: true, mesh: true, audio: true, localization: true, bundles: true, build: true },
  'FIFA 19': { ebx: true, textures: true, mesh: true, audio: true, localization: true, bundles: true, build: true },
  'FIFA 20': { ebx: true, textures: true, mesh: true, audio: true, localization: true, bundles: true, build: true },
  'Madden NFL 19': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Madden NFL 20': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Star Wars Battlefront': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Star Wars Battlefront II': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Star Wars Squadrons': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
  'Plants vs. Zombies: Battle for Neighborville': { ebx: true, textures: true, mesh: true, audio: true, localization: false, bundles: true, build: true },
}

/**
 * Résolution du support d'édition pour un jeu : par nom exact d'abord, puis par
 * correspondance de fragment (ex. « Need for Speed » → NFS 2015 uniquement si
 * l'exécutable est celui du jeu). Retourne null si aucun profil Frostbite.
 */
export function editorSupportForGame(gameName: string, execName?: string): FrostyEditorSupport | null {
  const direct = FROSTY_EDITOR_SUPPORT[gameName]
  if (direct) return direct
  const lower = gameName.toLowerCase()
  const nfs2015 = /nfs16|nfs2015|need for speed 2016/.test((execName ?? '').toLowerCase())
  if (/need for speed/.test(lower)) {
    // NFS 2015 (exe nfs16.exe) : profil Frosty confirmé par l'audit.
    if (nfs2015) return FROSTY_EDITOR_SUPPORT['Need for Speed (2015)']
    // Autre NFS Frostbite : Heat/Payback/Unbound reconnus par nom.
    if (/heat|payback|unbound|rivals/.test(lower)) {
      for (const [key, val] of Object.entries(FROSTY_EDITOR_SUPPORT)) {
        if (key.toLowerCase().includes(lower.split(' ').slice(-2).join(' ')) || lower.includes(key.split(' ').slice(2).join(' ').toLowerCase())) return val
      }
    }
  }
  return null
}

/** Runtime Frosty par jeu — version conseillée (spec §62 : pas de runtime global). */
export const FROSTY_RUNTIME_BY_GAME: Record<string, string> = {
  'Need for Speed (2015)': '1.0.6.3',
  'Need for Speed 2016': '1.0.6.3',
  'Need for Speed Heat': '1.0.6.3',
  'Need for Speed Unbound': '1.0.6.3',
  'Need for Speed Payback': '1.0.6.3',
  'Need for Speed Rivals': '1.0.6.2',
  'Battlefield 1': '1.0.6.3',
  'Battlefield 4': '1.0.6.3',
  'Battlefield Hardline': '1.0.6.2',
  'Battlefield V': '1.0.6.3',
  'Anthem': '1.0.6.2',
  'Dragon Age: Inquisition': '1.0.6.2',
  'Mass Effect: Andromeda': '1.0.6.3',
  'Mirror\'s Edge Catalyst': '1.0.6.2',
  'FIFA 17': '1.0.6.2',
  'FIFA 18': '1.0.6.2',
  'FIFA 19': '1.0.6.2',
  'FIFA 20': '1.0.6.2',
  'Madden NFL 19': '1.0.6.2',
  'Madden NFL 20': '1.0.6.2',
  'Star Wars Battlefront': '1.0.6.2',
  'Star Wars Battlefront II': '1.0.6.3',
  'Star Wars Squadrons': '1.0.6.2',
  'Plants vs. Zombies: Battle for Neighborville': '1.0.6.2',
}

/** Profils SDK Frostbite détectés dans la source auditée (docs/frosty-source-map.md). */
export const FROSTY_GAME_PROFILES = [
  'AnthemSDK', 'BF1SDK', 'BF4SDK', 'BFHSDK', 'BFVSDK', 'DragonAgeSDK',
  'FIFA19SDK', 'FIFA20SDK', 'Fifa17SDK', 'Fifa18SDK', 'MADDEN19SDK', 'MADDEN20SDK',
  'MassEffectSDK', 'MirrorsEdgeSDK', 'NFS14SDK', 'NFS16SDK', 'NFS17SDK',
  'NFSEDGESDK', 'NFSHEATSDK', 'PVZ1SDK', 'PVZ2SDK', 'PVZ3SDK',
  'SWSSDK', 'StarWarsIISDK', 'StarWarsSDK',
] as const

/** Plugins Frosty inventoriés (docs/frosty-plugin-inventory.md) — catégorisés. */
export interface FrostyPluginInfo {
  name: string
  category: 'texture' | 'mesh' | 'audio' | 'bundle' | 'localization' | 'utility' | 'reference' | 'launch' | 'legacy'
  edit: boolean
  import_: boolean
  export: boolean
  note?: string
}

export const FROSTY_PLUGIN_INVENTORY: FrostyPluginInfo[] = [
  { name: 'AtlasTexturePlugin', category: 'texture', edit: false, import_: false, export: false, note: 'Textures atlas' },
  { name: 'TexturePlugin', category: 'texture', edit: true, import_: true, export: true, note: 'Preview / DDS / mipmaps (§24-27)' },
  { name: 'MeshSetPlugin', category: 'mesh', edit: true, import_: true, export: true, note: 'MeshSet, parts, tangentes, composite (§28)' },
  { name: 'RefreshMeshVariationsPlugin', category: 'mesh', edit: true, import_: false, export: false, note: 'Variations de meshes' },
  { name: 'ObjectVariationPlugin', category: 'mesh', edit: true, import_: false, export: false, note: 'Variations d\'objets' },
  { name: 'SoundEditorPlugin', category: 'audio', edit: true, import_: true, export: true, note: 'EALayer3, preview (§31-33)' },
  { name: 'BundleEditorPlugin', category: 'bundle', edit: true, import_: false, export: false, note: 'Add/remove/whitelist bundles (§34-35)' },
  { name: 'DelayLoadBundlePlugin', category: 'bundle', edit: true, import_: false, export: false, note: 'Delay-load' },
  { name: 'BiowareLocalizationPlugin', category: 'localization', edit: true, import_: false, export: true, note: 'Localisation Bioware (§37-38)' },
  { name: 'FsLocalizationPlugin', category: 'localization', edit: true, import_: true, export: true, note: 'String database Frosty' },
  { name: 'LocalizedStringPlugin', category: 'localization', edit: true, import_: false, export: false, note: 'Chaînes localisées' },
  { name: 'ReferencesPlugin', category: 'reference', edit: false, import_: false, export: false, note: 'Graph de références (§99-100)' },
  { name: 'RootInstanceEntriesPlugin', category: 'reference', edit: false, import_: false, export: false, note: 'Entrées racine' },
  { name: 'DuplicationPlugin', category: 'utility', edit: true, import_: false, export: false, note: 'Dupliquer un asset (§36)' },
  { name: 'EbxToXmlPlugin', category: 'utility', edit: false, import_: false, export: true, note: 'Export EBX → XML' },
  { name: 'ChunkResExplorerPlugin', category: 'utility', edit: false, import_: false, export: false, note: 'Explorateur chunks/RES' },
  { name: 'ChunkResEditorPlugin', category: 'utility', edit: true, import_: false, export: false, note: 'Édition chunks/RES' },
  { name: 'TypeExplorerPlugin', category: 'utility', edit: false, import_: false, export: false, note: 'Explorateur de types' },
  { name: 'LuaPlugin', category: 'utility', edit: false, import_: false, export: false, note: 'Scripting Lua' },
  { name: 'VersionDataPlugin', category: 'utility', edit: false, import_: false, export: false, note: 'Données de version' },
  { name: 'SvgImagePlugin', category: 'utility', edit: false, import_: false, export: false, note: 'Images SVG' },
  { name: 'LaunchPlatformPlugin', category: 'launch', edit: false, import_: false, export: false, note: 'Lancement plateforme (Steam/EA/Origin)' },
  { name: 'ConnectionPlugin', category: 'utility', edit: false, import_: false, export: false, note: 'Connexions' },
  { name: 'ConversationPlugin', category: 'utility', edit: true, import_: false, export: false, note: 'Conversations' },
  { name: 'DifficultyWeaponTableDataPlugin', category: 'utility', edit: true, import_: false, export: false, note: 'Tables armes/difficulté' },
  { name: 'IesResourcePlugin', category: 'utility', edit: true, import_: false, export: false, note: 'Ressources IES' },
  { name: 'BlankPlugin', category: 'legacy', edit: false, import_: false, export: false, note: 'Exemple' },
  { name: 'TestPlugin', category: 'legacy', edit: false, import_: false, export: false, note: 'Tests' },
  { name: 'Fifa', category: 'legacy', edit: false, import_: false, export: false, note: 'Spécifique FIFA' },
]

/**
 * Projet Frosty (spec §10-11) — stocké hors du dossier du jeu :
 * ZAILON_DATA/editor-projects/<game>/<project-id>/.
 */
export interface FrostyProject {
  id: string
  name: string
  gameId: string
  gameName: string
  gameVersion?: string
  frostyRuntimeVersion: string
  projectPath: string
  modifiedAssets: string[]
  addedAssets: string[]
  removedAssets: string[]
  requiredPlugins: string[]
  createdAt: number
  updatedAt: number
  /** Snapshots d'autosave légers (spec §12). */
  autosaves: FrostyAutosave[]
  /** Historique de build (spec §104). */
  buildHistory: FrostyBuildRecord[]
  /** Notes locales par asset (spec §97). */
  assetNotes: Record<string, string>
  /** Assets favoris (spec §95-96). */
  favorites: string[]
  bookmarks: string[]
  dirty: boolean
}

export interface FrostyAutosave {
  at: number
  label: string
  assetCount: number
}

export interface FrostyBuildRecord {
  buildNumber: number
  version: string
  at: number
  modName: string
  estimatedSize: number
  status: 'built' | 'failed'
  issues: string[]
}

/** États du pipeline de build (spec §48-52) — machine à états pure. */
export type FrostyBuildStage =
  | 'idle'
  | 'validating'
  | 'resolving'
  | 'writing'
  | 'packaging'
  | 'checksum'
  | 'done'
  | 'failed'

export interface FrostyBuildPipeline {
  stage: FrostyBuildStage
  progress: number
  error?: string
  issues: string[]
  outputPath?: string
}

/** Cycle de vie du Worker isolé (spec §76-83). */
export type FrostyWorkerState = 'stopped' | 'starting' | 'warm' | 'crashed' | 'shuttingDown'

export interface FrostyWorkerStatus {
  state: FrostyWorkerState
  startedAt?: number
  /** Réchauffé 30-60 s après fermeture, arrêt immédiat en Performance (§81). */
  warmUntil?: number
  crashCount: number
  disabledPlugins: string[]
  lastError?: string
}

/** Diagnostic compact (spec §74-75). */
export interface FrostyEditorDiagnostic {
  runtimeVersion: string
  gameProfile: string
  assetIndex: 'not_started' | 'indexing' | 'ready' | 'stale'
  pluginsLoaded: number
  projectValid: boolean
  memoryCacheMb: number
}

// ─────────────────────────────── Projets ───────────────────────────────

/** Crée un projet (spec §10). Le chemin projet vit toujours hors du jeu (§11). */
export function createFrostyProject(input: {
  id: string
  name: string
  gameId: string
  gameName: string
  gameVersion?: string
  editorProjectsRoot: string
  frostyRuntimeVersion?: string
}): FrostyProject {
  const runtime = input.frostyRuntimeVersion ?? FROSTY_RUNTIME_BY_GAME[input.gameName] ?? '1.0.6.3'
  const safeName = input.name.trim().replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, ' ') || 'Sans titre'
  const now = Date.now()
  return {
    id: input.id,
    name: safeName,
    gameId: input.gameId,
    gameName: input.gameName,
    gameVersion: input.gameVersion,
    frostyRuntimeVersion: runtime,
    projectPath: `${input.editorProjectsRoot.replace(/\\$/, '')}/${encodeURIComponent(input.gameName)}/${input.id}`,
    modifiedAssets: [],
    addedAssets: [],
    removedAssets: [],
    requiredPlugins: [],
    createdAt: now,
    updatedAt: now,
    autosaves: [],
    buildHistory: [],
    assetNotes: {},
    favorites: [],
    bookmarks: [],
    dirty: false,
  }
}

/** Ajoute/supprime un asset du projet, marque dirty et horodate (spec §10, §70). */
export function markAssetInProject(project: FrostyProject, assetId: string, kind: 'modified' | 'added' | 'removed'): FrostyProject {
  const list = kind === 'modified' ? 'modifiedAssets' : kind === 'added' ? 'addedAssets' : 'removedAssets'
  const next = { ...project, [list]: [...new Set([...(project[list] as string[]), assetId])], dirty: true, updatedAt: Date.now() }
  return next
}

export function unmarkAssetInProject(project: FrostyProject, assetId: string, kind: 'modified' | 'added' | 'removed'): FrostyProject {
  const list = kind === 'modified' ? 'modifiedAssets' : kind === 'added' ? 'addedAssets' : 'removedAssets'
  const next = { ...project, [list]: (project[list] as string[]).filter(id => id !== assetId), dirty: true, updatedAt: Date.now() }
  return next
}

export function setAssetNote(project: FrostyProject, assetId: string, note: string): FrostyProject {
  const assetNotes = { ...project.assetNotes }
  if (note.trim()) assetNotes[assetId] = note.trim()
  else delete assetNotes[assetId]
  return { ...project, assetNotes, dirty: true, updatedAt: Date.now() }
}

export function toggleFavorite(project: FrostyProject, assetId: string): FrostyProject {
  const favorites = project.favorites.includes(assetId)
    ? project.favorites.filter(id => id !== assetId)
    : [...project.favorites, assetId]
  return { ...project, favorites }
}

/** Snapshot d'autosave léger (spec §12) — rotation à N snapshots. */
export function autosaveProject(project: FrostyProject, label: string, maxAutosaves = 5): FrostyProject {
  const snapshot: FrostyAutosave = {
    at: Date.now(),
    label,
    assetCount: project.modifiedAssets.length + project.addedAssets.length + project.removedAssets.length,
  }
  return {
    ...project,
    autosaves: [...project.autosaves, snapshot].slice(-maxAutosaves),
    dirty: false,
    updatedAt: Date.now(),
  }
}

export function restoreAutosave(project: FrostyProject, at: number): FrostyProject {
  const snapshot = project.autosaves.find(item => item.at === at)
  if (!snapshot) return project
  return { ...project, autosaves: project.autosaves.filter(item => item.at !== at), dirty: true, updatedAt: Date.now() }
}

/** Projets récents triés par activité (spec §13). */
export function recentFrostyProjects(projects: FrostyProject[], limit = 6): FrostyProject[] {
  return [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
}

// ─────────────────────────────── Validation & build ──────────────────────

export interface FrostyProjectIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
}

/**
 * Validation avant build (spec §102) : références cassées, imports invalides,
 * IDs dupliqués, plugins requis manquants, runtime manquant.
 */
export function validateFrostyProject(project: FrostyProject, opts: {
  support: FrostyEditorSupport | null
  installedPlugins: string[]
  runtimePresent: boolean
}): FrostyProjectIssue[] {
  const issues: FrostyProjectIssue[] = []
  if (!project.name.trim()) issues.push({ severity: 'error', code: 'no-name', message: 'Le projet doit avoir un nom.' })
  if (!opts.support) issues.push({ severity: 'error', code: 'no-profile', message: `Aucun profil Frostbite pour « ${project.gameName} ».` })
  if (!opts.runtimePresent) issues.push({ severity: 'error', code: 'no-runtime', message: `Runtime Frosty ${project.frostyRuntimeVersion} introuvable (installation officielle externe requise).` })
  if (project.addedAssets.some(id => project.removedAssets.includes(id))) issues.push({ severity: 'error', code: 'duplicate-id', message: 'Un asset est à la fois ajouté et supprimé.' })

  const duplicateMods = project.modifiedAssets.filter((id, i) => project.modifiedAssets.indexOf(id) !== i)
  if (duplicateMods.length) issues.push({ severity: 'error', code: 'duplicate-mod', message: `${duplicateMods.length} asset(s) modifié(s) en double.` })

  const missing = project.requiredPlugins.filter(p => !opts.installedPlugins.includes(p))
  if (missing.length) issues.push({ severity: 'error', code: 'missing-plugin', message: `Plugins requis absents : ${missing.join(', ')}.` })

  if (opts.support && project.modifiedAssets.length === 0 && project.addedAssets.length === 0) {
    issues.push({ severity: 'warning', code: 'empty-project', message: 'Le projet ne contient encore aucune modification.' })
  }
  return issues
}

export function projectReady(project: FrostyProject, opts: Parameters<typeof validateFrostyProject>[1]): { ok: boolean; issues: FrostyProjectIssue[] } {
  const issues = validateFrostyProject(project, opts)
  return { ok: issues.filter(i => i.severity === 'error').length === 0, issues }
}

/** Étapes du pipeline de build (spec §48-52). */
export const FROSTY_BUILD_STAGES: FrostyBuildStage[] = ['validating', 'resolving', 'writing', 'packaging', 'checksum']

/** Machine à états du build — pure, progression par étape. */
export function advanceFrostyBuild(pipeline: FrostyBuildPipeline): FrostyBuildPipeline {
  if (pipeline.stage === 'idle') return { ...pipeline, stage: 'validating', progress: 0.05, issues: [] }
  if (pipeline.stage === 'failed' || pipeline.stage === 'done') return pipeline
  const idx = FROSTY_BUILD_STAGES.indexOf(pipeline.stage)
  if (idx === FROSTY_BUILD_STAGES.length - 1) return { ...pipeline, stage: 'done', progress: 1 }
  const next = FROSTY_BUILD_STAGES[idx + 1]
  return { ...pipeline, stage: next, progress: (idx + 2) / FROSTY_BUILD_STAGES.length }
}

export function failFrostyBuild(pipeline: FrostyBuildPipeline, error: string): FrostyBuildPipeline {
  return { ...pipeline, stage: 'failed', error }
}

/** Estimation de taille du mod avant build (spec §103) — basée sur les assets modifiés. */
export function estimateFrostyModSize(project: FrostyProject, averageAssetBytes = 4_000_000): number {
  return (project.modifiedAssets.length + project.addedAssets.length) * averageAssetBytes
}

export function recordFrostyBuild(project: FrostyProject, build: Omit<FrostyBuildRecord, 'buildNumber' | 'at'>): FrostyProject {
  const buildNumber = (project.buildHistory[project.buildHistory.length - 1]?.buildNumber ?? 0) + 1
  return {
    ...project,
    buildHistory: [...project.buildHistory, { ...build, buildNumber, at: Date.now() }],
    dirty: false,
    updatedAt: Date.now(),
  }
}

/**
 * Vérification ModData (spec §65) : Frosty Support trouve/valide/reconstruit
 * ModData — l'éditeur ne duplique jamais cette responsabilité.
 */
export function modDataState(kind: 'auto' | 'custom' | 'none', modsEnabled: boolean): 'clean' | 'stale' | 'missing' {
  if (modsEnabled && kind === 'none') return 'missing'
  if (modsEnabled && kind === 'auto' || kind === 'custom') return 'clean'
  return 'stale'
}

// ─────────────────────────────── Worker isolé ────────────────────────────

/**
 * Cycle de vie du Worker (spec §76-83) : processus séparé Zailon.FrostyEditor.Worker.
 * Fermer l'éditeur → warm timeout (30-60 s, §81) → kill → RAM libérée (§79-80).
 * Un crash de plugin fait redémarrer le Worker, jamais ZAILON (§76-78).
 */
export function workerAfterOpen(worker: FrostyWorkerStatus): FrostyWorkerStatus {
  return { ...worker, state: 'starting', crashCount: worker.crashCount, disabledPlugins: worker.disabledPlugins }
}

export function workerWarmed(worker: FrostyWorkerStatus): FrostyWorkerStatus {
  return { ...worker, state: 'warm', startedAt: Date.now(), lastError: undefined }
}

export function workerClosed(worker: FrostyWorkerStatus, performanceMode: 'balanced' | 'performance' | 'max'): FrostyWorkerStatus {
  const warmMs = performanceMode === 'max' ? 0 : performanceMode === 'performance' ? 5_000 : 45_000
  return {
    ...worker,
    state: warmMs === 0 ? 'stopped' : 'warm',
    warmUntil: warmMs === 0 ? undefined : Date.now() + warmMs,
  }
}

/** Le warm timeout est écoulé → arrêt propre du Worker, RAM libérée (§80). */
export function workerTick(worker: FrostyWorkerStatus, now = Date.now()): FrostyWorkerStatus {
  if (worker.state === 'warm' && worker.warmUntil !== undefined && now >= worker.warmUntil) {
    return { ...worker, state: 'stopped', warmUntil: undefined }
  }
  return worker
}

/** Crash de plugin (spec §76-78, §83) : Worker redémarre ; 2 crashs → plugin désactivé. */
export function workerPluginCrashed(worker: FrostyWorkerStatus, pluginName: string): FrostyWorkerStatus {
  const count = (worker.crashCount ?? 0) + 1
  const disabledPlugins = count >= 2 && !worker.disabledPlugins.includes(pluginName)
    ? [...worker.disabledPlugins, pluginName]
    : worker.disabledPlugins
  return {
    state: count >= 2 ? 'stopped' : 'starting',
    crashCount: count,
    disabledPlugins,
    lastError: `Plugin « ${pluginName} » a provoqué un crash (${count}).`,
  }
}

export function workerReset(worker: FrostyWorkerStatus): FrostyWorkerStatus {
  return { ...worker, state: 'stopped', crashCount: 0, lastError: undefined }
}

/** Diagnostic compact (spec §74). */
export function buildFrostyEditorDiagnostic(project: FrostyProject | null, opts: {
  support: FrostyEditorSupport | null
  installedPlugins: string[]
  runtimePresent: boolean
  indexProgress?: number
}): FrostyEditorDiagnostic {
  const issues = project ? validateFrostyProject(project, { support: opts.support, installedPlugins: opts.installedPlugins, runtimePresent: opts.runtimePresent }) : []
  const indexProgress = opts.indexProgress ?? (opts.runtimePresent ? 1 : 0)
  return {
    runtimeVersion: project?.frostyRuntimeVersion ?? FROSTY_RUNTIME_BY_GAME[project?.gameName ?? ''] ?? '—',
    gameProfile: opts.support ? 'Frostbite' : 'Non Frostbite',
    assetIndex: indexProgress >= 1 ? 'ready' : indexProgress > 0 ? 'indexing' : 'not_started',
    pluginsLoaded: opts.installedPlugins.length,
    projectValid: project ? issues.filter(i => i.severity === 'error').length === 0 : false,
    memoryCacheMb: 0,
  }
}

/**
 * Politique de licence (spec §87-89) : ZAILON ne redistribue JAMAIS le code
 * Frosty (CC BY-NC-ND 4.0 sur la branche 1.0.6). L'add-on pilote le runtime
 * Frosty officiel installé/détecté par Frosty Support — jamais de bundling.
 */
export const FROSTY_LICENSE_POLICY = {
  license: 'CC BY-NC-ND 4.0 (branche historique 1.0.6) / GPL-3.0 (réécriture .NET 8)',
  bundling: 'interdit',
  derivative: 'interdit sans autorisation',
  externalRuntime: 'requis — installation officielle Frosty détectée par Frosty Support',
  attribution: 'FrostyToolsuite — https://github.com/CadeEvs/FrostyToolsuite',
} as const
