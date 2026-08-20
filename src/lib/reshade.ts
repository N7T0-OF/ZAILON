/**
 * Intégration ReShade (spec §1-115).
 *
 * Règles :
 * - source officielle uniquement (reshade.me) — jamais de mirror tiers, aucune
 *   clé API (§9-10) ;
 * - cibler le VRAI exécutable de rendu, pas le launcher (§3-4) ;
 * - Vulkan passe par le mécanisme de layer du setup officiel, jamais un faux
 *   dxgi.dll (§7) ;
 * - jamais de mise à jour pendant qu'un jeu tourne (§13-14) ;
 * - les jeux anti-cheat ne reçoivent jamais d'installation automatique
 *   non validée (§58-61) ;
 * - les presets ne sont pas déduits d'un simple `.ini` sans analyse (§26) ;
 * - une DLL préexistante n'est jamais écrasée sans contrôle (§90-92).
 *
 * Cette lib est pure (aucun import natif) — toute la décision y est testable.
 */

import type { Game, Profile, ReShadeProfileState } from '../types'

// ─────────────────────────────── Target / API ───────────────────────────────

export type GraphicsApi = 'Direct3D9' | 'Direct3D10_11_12' | 'OpenGL' | 'Vulkan' | 'Unknown'

export const GRAPHICS_API_LABELS: Record<GraphicsApi, string> = {
  Direct3D9: 'DirectX 9',
  Direct3D10_11_12: 'DirectX 10/11/12',
  OpenGL: 'OpenGL',
  Vulkan: 'Vulkan',
  Unknown: 'Non déterminée',
}

export interface ReShadeTarget {
  gameId: string
  /** Chemin du vrai exécutable de rendu (pas le launcher). */
  executablePath?: string
  executableName?: string
  architecture: 'x86' | 'x64' | 'Unknown'
  graphicsApi: GraphicsApi
  /** 0..1 — en dessous de 0.55, ZAILON demande confirmation avant d'installer (§4). */
  confidence: number
  reason: string
}

/** Adaptateurs connus (exe → API de rendu). Registry-driven, extensible (§5). */
export interface RendererAdapter {
  api: GraphicsApi
  confidence: number
  note: string
}

export const KNOWN_RENDERERS: Record<string, RendererAdapter> = {
  'NFS16.exe': { api: 'Direct3D10_11_12', confidence: 0.9, note: 'Need for Speed (2015) — rendu DirectX 11' },
  'Cyberpunk2077.exe': { api: 'Direct3D10_11_12', confidence: 0.7, note: 'Cyberpunk 2077 — DX11 ou DX12 selon le renderer configuré' },
  'Witcher3.exe': { api: 'Direct3D10_11_12', confidence: 0.8, note: 'The Witcher 3 — DirectX 11 (DX12 en option)' },
  'SkyrimSE.exe': { api: 'Direct3D10_11_12', confidence: 0.8, note: 'Skyrim Special Edition — DirectX 11' },
  'fallout4.exe': { api: 'Direct3D10_11_12', confidence: 0.8, note: 'Fallout 4 — DirectX 11' },
  'RDR2.exe': { api: 'Vulkan', confidence: 0.6, note: 'Red Dead Redemption 2 — Vulkan (ou DX12 selon config)' },
  'Minecraft.exe': { api: 'OpenGL', confidence: 0.7, note: 'Minecraft — OpenGL (Java)' },
}

/** Noms d'exécutables qui sont des launchers, jamais la cible ReShade (§3). */
const LAUNCHER_NAMES = new Set([
  'launcher.exe', 'launcher64.exe', 'start_protected_game.exe',
  'game_launcher.exe', 'epicgameslauncher.exe', 'steam.exe', 'galaxyclient.exe',
  'eadesktop.exe', 'origin.exe', 'fmm.exe', 'frostymodmanager.exe', 'nte_launcher.exe',
  'ntegloballauncher.exe', 'zenlauncher.exe', 'goggalaxy.exe',
])

const executableNameOf = (path?: string): string | undefined => {
  if (!path) return undefined
  const cleaned = path.replace(/\\/g, '/')
  const name = cleaned.slice(cleaned.lastIndexOf('/') + 1)
  return name || undefined
}

/** API graphique d'un jeu : adaptateur connu d'abord, sinon heuristique (§5). */
export function detectGraphicsApi(game: Pick<Game, 'name' | 'execPath'>): { api: GraphicsApi; confidence: number; reason: string } {
  const exe = executableNameOf(game.execPath) || ''
  const adapter = KNOWN_RENDERERS[exe]
  if (adapter) return { api: adapter.api, confidence: adapter.confidence, reason: adapter.note }

  const lower = `${game.name} ${exe}`.toLowerCase()
  const unreal = /unreal|ue4|ue5/.test(lower) || /\.uproject|wolcen|satisfactory|theisle/.test(lower)
  if (unreal) return { api: 'Unknown', confidence: 0.4, reason: 'Moteur Unreal — DirectX 11/12 ou Vulkan selon le jeu' }
  const unity = /unity/.test(lower)
  if (unity) return { api: 'Direct3D10_11_12', confidence: 0.45, reason: 'Moteur Unity — DirectX par défaut (API à confirmer)' }
  if (/opengl/.test(lower)) return { api: 'OpenGL', confidence: 0.8, reason: 'Jeu OpenGL déclaré' }
  if (/vulkan/.test(lower)) return { api: 'Vulkan', confidence: 0.8, reason: 'Jeu Vulkan déclaré' }
  return { api: 'Unknown', confidence: 0.25, reason: 'API non déterminée — sélection manuelle recommandée' }
}

/**
 * Résout la cible ReShade : préfère le vrai exécutable de rendu au launcher
 * (ex. UE : `...\Binaries\Win64\Game-Win64-Shipping.exe` ≠ `Launcher.exe`).
 * ZAILON n'installe jamais sur un exécutable de launcher (§3-4).
 */
export function resolveReShadeTarget(game: Pick<Game, 'id' | 'name' | 'execPath' | 'installDirectory'>): ReShadeTarget {
  const primaryExe = executableNameOf(game.execPath)
  const api = detectGraphicsApi(game)

  if (primaryExe && LAUNCHER_NAMES.has(primaryExe.toLowerCase())) {
    // Launcher sélectionné : on ne peut pas confirmer le vrai EXE sans scan —
    // l'installation est possible mais demande la sélection du rendu réel.
    return {
      gameId: game.id,
      executablePath: game.execPath,
      executableName: primaryExe,
      architecture: api.confidence >= 0.7 ? 'x64' : 'Unknown',
      graphicsApi: api.api,
      confidence: Math.min(0.5, api.confidence),
      reason: `« ${primaryExe} » est un launcher — sélectionnez le vrai exécutable de rendu avant d'installer ReShade.`,
    }
  }

  return {
    gameId: game.id,
    executablePath: game.execPath,
    executableName: primaryExe,
    architecture: api.confidence >= 0.7 ? 'x64' : 'Unknown',
    graphicsApi: api.api,
    confidence: api.confidence,
    reason: api.reason,
  }
}

// ─────────────────────────── État d'installation ────────────────────────────

export type ReShadeInstallState = 'NotInstalled' | 'Installed' | 'UpdateAvailable' | 'Broken' | 'Unknown'

export interface ReShadeInstallationInput {
  dllPresent: boolean
  iniPresent: boolean
  installedVersion?: string
  availableVersion?: string
}

export function classifyReShadeInstallation(input: ReShadeInstallationInput): { state: ReShadeInstallState; reason: string } {
  const { dllPresent, iniPresent, installedVersion, availableVersion } = input
  if (!dllPresent && !iniPresent) {
    return { state: 'NotInstalled', reason: 'Aucun runtime ReShade détecté sur l’exécutable cible.' }
  }
  if (dllPresent && !iniPresent) {
    return { state: 'Broken', reason: 'DLL présente mais configuration ReShade.ini absente — installation incomplète (§23).' }
  }
  if (!installedVersion) {
    return { state: 'Broken', reason: 'Runtime présent mais version inconnue — installation à vérifier.' }
  }
  if (availableVersion && versionCompare(availableVersion, installedVersion) > 0) {
    return { state: 'UpdateAvailable', reason: `Mise à jour disponible : ${installedVersion} → ${availableVersion}.` }
  }
  return { state: 'Installed', reason: `ReShade ${installedVersion} installé.` }
}

/** Compare deux versions sémantiques ; retourne <0, 0 ou >0. */
export function versionCompare(a: string, b: string): number {
  const parse = (value: string) => value
    .replace(/^v/, '')
    .split(/[.\-+]/)
    .map(part => Number.parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

// ─────────────────────────── Inspection de presets ──────────────────────────

export interface ReShadePresetHint {
  fileName?: string
  category?: string
  tags?: string[]
  description?: string
  name?: string
}

export interface ReShadePresetInspection {
  isPreset: boolean
  score: number
  reason: string
  presetName?: string
  needsShaders: boolean
  dependencyHints: string[]
}

/** Mots-clés pondérés pour l'inspection (§26 : ne pas classer n'importe quel .ini). */
const PRESET_KEYWORDS: Array<[RegExp, number]> = [
  [/reshade/i, 18],
  [/preset/i, 10],
  [/\.ini\b/i, 8],
  [/q[ -]?uint/i, 8],
  [/shader/i, 6],
  [/sweetfx/i, 6],
  [/prod80/i, 6],
  [/astrayfx/i, 5],
  [/cinematic/i, 4],
  [/graphics mod/i, 4],
  [/visual mod/i, 3],
  [/color/gi, 2],
  [/lighting/i, 3],
  [/enbseries|\benb\b/i, -12],
]

const PRESET_CATEGORY_HINTS = ['reshade', 'preset', 'visual', 'graphics', 'colour', 'color', 'cinematic']

/**
 * Score un candidat preset ReShade à partir des métadonnées disponibles
 * (fichier, catégorie, tags, description). Un simple `.ini` quelconque
 * n'est PAS considéré comme ReShade sans indices supplémentaires (§26).
 */
export function inspectReShadePreset(hint: ReShadePresetHint): ReShadePresetInspection {
  const text = [hint.fileName, hint.category, (hint.tags || []).join(' '), hint.description, hint.name].filter(Boolean).join(' ').toLowerCase()
  let score = 0
  for (const [pattern, weight] of PRESET_KEYWORDS) {
    if (pattern.test(text)) score += weight
  }
  const category = (hint.category || '').toLowerCase()
  if (PRESET_CATEGORY_HINTS.some(hintWord => category.includes(hintWord))) score += 12

  const dependencyHints = resolveShaderDependencies(text)
  const needsShaders = dependencyHints.length > 0 || /shader|texture|preset needs/i.test(text)

  const isPreset = score >= 25
  return {
    isPreset,
    score,
    reason: isPreset
      ? `ReShade Preset détecté (score ${score}).`
      : `Pas un preset ReShade certain (score ${score} — seuil 25).`,
    presetName: hint.name || hint.fileName,
    needsShaders,
    dependencyHints,
  }
}

// ─────────────────────────── Dépendances shaders ────────────────────────────

export interface ReShadeShaderPack {
  id: string
  displayName: string
  officialSource: string
  license: string
  patterns: RegExp
}

/**
 * Registre des packs de shaders connus (§30-32). Chaque entrée possède une
 * source officielle et une licence — on n'ajoute un repo que si sa
 * redistribution automatique est compatible. `officialSource` sert à ouvrir
 * la page officielle, jamais à télécharger d'un mirror.
 */
export const RESHADE_SHADER_PACKS: ReShadeShaderPack[] = [
  { id: 'standard', displayName: 'Shaders ReShade standard', officialSource: 'https://reshade.me/', license: 'BSD-3-Clause (ReShade)', patterns: /reshade-shaders|standard shader|mastereffect/i },
  { id: 'qUINT', displayName: 'qUINT', officialSource: 'https://github.com/martymcmodding/qUINT', license: 'MIT', patterns: /q[ -]?uint|marty mcmodding/i },
  { id: 'prod80', displayName: 'prod80 ReShade presets', officialSource: 'https://www.patreon.com/prod80', license: 'Déclarée par l\'auteur', patterns: /prod80/i },
  { id: 'sweetfx', displayName: 'SweetFX', officialSource: 'https://sfx.thelazy.net/', license: 'BSD-3-Clause (SweetFX)', patterns: /sweetfx/i },
  { id: 'astrayfx', displayName: 'AstrayFX', officialSource: 'https://github.com/BlueSkyDefender/AstrayFX', license: 'MIT', patterns: /astrayfx/i },
]

/** Packs mentionnés dans un texte (description, tags, instructions). */
export function resolveShaderDependencies(text: string): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []
  for (const pack of RESHADE_SHADER_PACKS) {
    if (pack.patterns.test(lower)) found.push(pack.id)
  }
  return found
}

/**
 * Compteur de références (§47) : un pack partagé par plusieurs presets n'est
 * jamais supprimé avec un seul preset.
 */
export function referenceCountFor(packId: string, activePresets: Array<Pick<ReShadeProfileState, 'shaderDependencies'>>): number {
  return activePresets.filter(preset => preset.shaderDependencies.includes(packId)).length
}

/** Nettoyage des dépendances inutilisées (§48) : packs référencés par aucun preset actif. */
export function unusedShaderPacks(activePresets: Array<Pick<ReShadeProfileState, 'shaderDependencies'>>): string[] {
  return RESHADE_SHADER_PACKS
    .map(pack => pack.id)
    .filter(packId => referenceCountFor(packId, activePresets) === 0)
}

// ─────────────────────────── Compatibilité / anti-cheat ─────────────────────

export type ReShadeCompatibilityLevel = 'SafeKnown' | 'UserManaged' | 'MultiplayerRestricted' | 'Unsupported'

export const COMPATIBILITY_LABELS: Record<ReShadeCompatibilityLevel, string> = {
  SafeKnown: 'Sûr (jeu solo connu)',
  UserManaged: 'À vérifier par l’utilisateur',
  MultiplayerRestricted: 'Multijoueur / protégé — non automatique',
  Unsupported: 'Non recommandé',
}

/** Signatures anti-cheat (§59-60). Courtes uniquement avec frontières de mot. */
const ANTICHEAT_PATTERNS: Array<[RegExp, string]> = [
  [/\beac\b|easy anti[ -]?cheat/i, 'Easy Anti-Cheat (EAC)'],
  [/battl?eye/i, 'BattlEye'],
  [/denuvo anti[ -]?cheat/i, 'Denuvo Anti-Cheat'],
  [/vanguard/i, 'Vanguard'],
  [/ricochet/i, 'Ricochet (Call of Duty)'],
  [/nprotect|gameguard/i, 'nProtect / GameGuard'],
  [/xigncode/i, 'XIGNCODE3'],
  [/\bace\b|anti[ -]?cheat/i, 'Anti-cheat'],
]

export interface ReShadeCompatibility {
  level: ReShadeCompatibilityLevel
  reason: string
  detectedAntiCheats: string[]
  autoInstallSafe: boolean
}

/**
 * Classification de sécurité (§58-63) : les jeux protégés ne reçoivent JAMAIS
 * d'installation automatique — c'est une politique, pas une garantie.
 * NTE (Neverness to Everness) est classé Restricted/Experimental jusqu'à
 * validation réelle (§61).
 */
export function classifyReShadeCompatibility(game: Pick<Game, 'name'>, tags: string[] = []): ReShadeCompatibility {
  const name = game.name.toLowerCase()
  const combined = `${name} ${tags.join(' ').toLowerCase()}`

  const detectedAntiCheats: string[] = []
  for (const [pattern, label] of ANTICHEAT_PATTERNS) {
    if (pattern.test(combined)) detectedAntiCheats.push(label)
  }

  if (/neverness|nte/i.test(name)) {
    return {
      level: 'MultiplayerRestricted',
      reason: 'Neverness to Everness utilise un anti-cheat — ReShade reste Experimental tant que la compatibilité réelle n’est pas validée (§61).',
      detectedAntiCheats: detectedAntiCheats.length ? detectedAntiCheats : ['Anti-cheat UE'],
      autoInstallSafe: false,
    }
  }

  if (detectedAntiCheats.length > 0) {
    return {
      level: 'MultiplayerRestricted',
      reason: `Jeu protégé détecté (${detectedAntiCheats.join(', ')}) — aucune installation automatique sans validation de compatibilité (§60).`,
      detectedAntiCheats,
      autoInstallSafe: false,
    }
  }

  const knownSafeSolo = /nfs16|need for speed|cyberpunk|witcher|skyrim|fallout|rdr2|red dead|singleplayer|solo/i
  if (knownSafeSolo.test(combined)) {
    return {
      level: 'SafeKnown',
      reason: 'Jeu solo connu — installation ReShade proposée (§62).',
      detectedAntiCheats,
      autoInstallSafe: true,
    }
  }

  return {
    level: 'UserManaged',
    reason: 'Compatibilité ReShade à vérifier — l’utilisateur décide (§63).',
    detectedAntiCheats,
    autoInstallSafe: false,
  }
}

// ─────────────────────────── Profil / session ───────────────────────────────

export type ReShadeSessionStrategy = { kind: 'Enabled'; presetId?: string } | { kind: 'Disabled'; reason: string }

/**
 * Stratégie de session (§38) : profil sans ReShade (Vanilla) ou « Démarrer
 * sans ReShade » (§106) → Disabled, sans casser l'installation globale.
 */
export function resolveReShadeSessionStrategy(
  state: ReShadeProfileState | undefined,
  safeMode: boolean,
): ReShadeSessionStrategy {
  if (safeMode) return { kind: 'Disabled', reason: 'Démarrer sans ReShade — session de diagnostic (§106-107).' }
  if (!state?.enabled) return { kind: 'Disabled', reason: 'Profil sans ReShade (Vanilla).' }
  return { kind: 'Enabled', presetId: state.presetId }
}

// ─────────────────────────── Conflits DLL proxy ─────────────────────────────

export interface ProxyDllIssue {
  fileName: string
  component: string
  conflict: boolean
}

const PROXY_DLLS: Array<[string, string]> = [
  ['dxgi.dll', 'ReShade (Direct3D 10/11/12) ou loader existant'],
  ['d3d9.dll', 'ReShade (Direct3D 9) ou loader existant'],
  ['d3d11.dll', 'ReShade (Direct3D 11) ou loader existant'],
  ['opengl32.dll', 'ReShade (OpenGL) ou loader existant'],
  ['d3d12.dll', 'ReShade (Direct3D 12) ou loader existant'],
]

/**
 * Conflits de DLL proxy (§91-92) : si un loader (RED4ext, CET, enb, autre)
 * occupe déjà la DLL, ZAILON ne l'écrase jamais — il alerte et laisse
 * l'utilisateur analyser.
 */
export function findProxyDllConflicts(knownFiles: string[]): ProxyDllIssue[] {
  const present = new Set(knownFiles.map(file => file.toLowerCase().split(/[\\/]/).pop() || ''))
  const issues: ProxyDllIssue[] = []
  for (const [fileName, component] of PROXY_DLLS) {
    if (present.has(fileName)) {
      issues.push({ fileName, component, conflict: true })
    }
  }
  return issues
}

// ─────────────────────────── Fingerprint / fast check ───────────────────────

export interface ReShadeDeploymentFingerprint {
  targetExe: string
  graphicsApi: GraphicsApi
  version: string
  presetId?: string
  rendererKey?: string
}

export function buildReShadeFingerprint(
  target: ReShadeTarget,
  version: string,
  presetId?: string,
  rendererKey?: string,
): ReShadeDeploymentFingerprint {
  return {
    targetExe: target.executableName || '',
    graphicsApi: target.graphicsApi,
    version,
    presetId,
    rendererKey,
  }
}

/** FastCheck (§78) : même fingerprint → pas de recontrôle lourd au lancement. */
export function sameReShadeFingerprint(a: ReShadeDeploymentFingerprint, b: ReShadeDeploymentFingerprint): boolean {
  return a.targetExe === b.targetExe
    && a.graphicsApi === b.graphicsApi
    && a.version === b.version
    && (a.presetId || undefined) === (b.presetId || undefined)
    && (a.rendererKey || undefined) === (b.rendererKey || undefined)
}

// ─────────────────────────── Plan de mise à jour ────────────────────────────

export type ReShadeUpdateAction = 'none' | 'now' | 'deferred' | 'blocked'

export interface ReShadeUpdatePlan {
  action: ReShadeUpdateAction
  reason: string
}

/**
 * Politique de mise à jour (§13-14, §20) : jamais pendant qu'un jeu tourne
 * (deferred à la fermeture), jamais quand la version est verrouillée.
 */
export function planReShadeUpdate(input: {
  installedVersion: string
  availableVersion: string
  gameRunning: boolean
  versionLocked: boolean
  autoUpdate: boolean
}): ReShadeUpdatePlan {
  const newer = versionCompare(input.availableVersion, input.installedVersion) > 0
  if (!newer) return { action: 'none', reason: 'Déjà à jour.' }
  if (input.versionLocked) return { action: 'blocked', reason: `Version verrouillée (${input.installedVersion}) — mise à jour manuelle uniquement (§20).` }
  if (input.gameRunning) return { action: 'deferred', reason: 'Jeu en cours — la mise à jour sera appliquée à la fermeture du jeu (§14).' }
  if (!input.autoUpdate) return { action: 'now', reason: 'Mise à jour disponible, à appliquer manuellement.' }
  return { action: 'now', reason: 'Mise à jour automatique prête à être appliquée.' }
}
