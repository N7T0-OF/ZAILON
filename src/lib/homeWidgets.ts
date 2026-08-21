/**
 * Accueil modulaire (spec « Accueil modulaire » §1-28, §73-90, §110-112) :
 * les blocs de l'Accueil sont de vrais widgets configurables (id, enabled,
 * order, variant, size). Logique PURE — aucun accès DOM — testable sous
 * node --test (spec §123). Un widget désactivé n'est jamais rendu ni calculé.
 */

export type HomeWidgetId = 'favorites' | 'statistics' | 'activity' | 'session'
export type HomeLayoutPreset = 'minimal' | 'standard' | 'complete' | 'custom'

export interface HomeWidgetConfig {
  id: HomeWidgetId
  enabled: boolean
  order: number
  variant: string
  /** Taille standard : Wide passe sur sa propre ligne, Medium partage la ligne. */
  size: 'wide' | 'medium'
}

/** Ordre de référence (migration + reset) : Favoris, Statistiques, Activité,
 * Session active (§77 — rendu uniquement pendant une session). */
export const HOME_WIDGET_ORDER: HomeWidgetId[] = ['favorites', 'statistics', 'activity', 'session']

export const HOME_WIDGET_DEFAULTS: HomeWidgetConfig[] = [
  { id: 'favorites', enabled: true, order: 1, variant: 'cards', size: 'wide' },
  { id: 'statistics', enabled: true, order: 2, variant: 'summary', size: 'medium' },
  { id: 'activity', enabled: true, order: 3, variant: 'recent', size: 'medium' },
  { id: 'session', enabled: true, order: 4, variant: 'active', size: 'medium' },
]

/** Variantes par widget — 2 maximum (spec §6, §74). */
export const HOME_WIDGET_VARIANTS: Record<HomeWidgetId, Array<{ value: string; label: string }>> = {
  favorites: [
    { value: 'cards', label: 'Cartes' },
    { value: 'compact', label: 'Compact' },
  ],
  statistics: [
    { value: 'summary', label: 'Résumé' },
    { value: 'minimal', label: 'Minimal' },
  ],
  activity: [
    { value: 'recent', label: 'Dernières actions' },
    { value: 'profiles', label: 'Profils' },
  ],
  session: [
    { value: 'active', label: 'Session active' },
  ],
}

/** Presets (spec §111-112) : Minimal = Favoris seul, Standard = Favoris +
 * Stats. Le widget Session active n'est actif que dans « Complet » — il
 * n'apparaît de toute façon que pendant une session (§77). */
export const HOME_LAYOUT_PRESETS: Record<Exclude<HomeLayoutPreset, 'custom'>, Partial<Record<HomeWidgetId, boolean>>> = {
  minimal: { favorites: true, statistics: false, activity: false, session: false },
  standard: { favorites: true, statistics: true, activity: false, session: false },
  complete: { favorites: true, statistics: true, activity: true, session: true },
}

export const HOME_PRESET_LABELS: Record<HomeLayoutPreset, string> = {
  minimal: 'Minimal',
  standard: 'Standard',
  complete: 'Complet',
  custom: 'Personnalisé',
}

/** Widgets activés, dans l'ordre configuré (aucune case vide, spec §4). */
export function orderHomeWidgets(widgets: HomeWidgetConfig[]): HomeWidgetConfig[] {
  return [...widgets]
    .filter(widget => widget.enabled)
    .sort((a, b) => a.order - b.order || HOME_WIDGET_ORDER.indexOf(a.id) - HOME_WIDGET_ORDER.indexOf(b.id))
}

/** Classe de grille responsive selon la taille du widget (spec §85-87). */
export function widgetGridClass(size: 'wide' | 'medium'): string {
  return size === 'wide' ? 'min-[900px]:col-span-6' : 'min-[900px]:col-span-3'
}

/** Widget inconnu (retiré par un add-on désinstallé) → ignoré, jamais rendu (spec §84). */
export function isKnownHomeWidgetId(id: string): id is HomeWidgetId {
  return (HOME_WIDGET_ORDER as string[]).includes(id)
}

/** Normalise une liste persistée : garde l'ordre, ignore les ids inconnus (spec §83-84). */
export function normalizeHomeWidgets(raw: unknown): HomeWidgetConfig[] {
  if (!Array.isArray(raw)) return [...HOME_WIDGET_DEFAULTS]
  const seen = new Set<HomeWidgetId>()
  const normalized: HomeWidgetConfig[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const id = (entry as { id?: unknown }).id
    if (typeof id !== 'string' || !isKnownHomeWidgetId(id) || seen.has(id)) continue
    seen.add(id)
    normalized.push({
      id,
      enabled: (entry as { enabled?: unknown }).enabled !== false,
      order: typeof (entry as { order?: unknown }).order === 'number' ? (entry as { order: number }).order : HOME_WIDGET_ORDER.indexOf(id) + 1,
      variant: typeof (entry as { variant?: unknown }).variant === 'string' ? (entry as { variant: string }).variant : HOME_WIDGET_DEFAULTS.find(item => item.id === id)!.variant,
      size: (entry as { size?: unknown }).size === 'wide' ? 'wide' : 'medium',
    })
  }
  // Widgets manquants → ajoutés à la fin dans l'ordre de référence (§83).
  for (const id of HOME_WIDGET_ORDER) {
    if (!seen.has(id)) normalized.push({ ...HOME_WIDGET_DEFAULTS.find(item => item.id === id)!, order: normalized.length + 1 })
  }
  return normalized.sort((a, b) => a.order - b.order || HOME_WIDGET_ORDER.indexOf(a.id) - HOME_WIDGET_ORDER.indexOf(b.id))
}

/** Applique un preset de disposition (spec §111) — retourne la liste complète. */
export function applyHomeLayoutPreset(widgets: HomeWidgetConfig[], preset: Exclude<HomeLayoutPreset, 'custom'>): HomeWidgetConfig[] {
  const enabledMap = HOME_LAYOUT_PRESETS[preset]
  return widgets.map(widget => ({ ...widget, enabled: enabledMap[widget.id] ?? widget.enabled }))
}

/** Un widget désactivé ne doit rien coûter : testé (§7, §75, §123). */
export function enabledWidgetIds(widgets: HomeWidgetConfig[]): HomeWidgetId[] {
  return orderHomeWidgets(widgets).map(widget => widget.id)
}
