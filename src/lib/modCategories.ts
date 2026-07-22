import type { Mod, ModCategoryConfidence, ModCategoryTag } from '../types'

export const STANDARD_MOD_TAGS = [
  'Gameplay', 'Graphismes', 'Interface', 'Audio', 'Scripts', 'Textures', 'Shaders',
  'Animations', 'Personnages', 'Véhicules', 'Cartes', 'Armes', 'Qualité de vie',
  'Correctifs', 'Framework', 'Utilitaires', 'Traductions', 'Performance',
] as const

const rules: Array<{ label: typeof STANDARD_MOD_TAGS[number]; confidence: ModCategoryConfidence; terms: RegExp }> = [
  { label: 'Shaders', confidence: 'high', terms: /\b(shader|reshade|enb|lut)\b|\.fx\b/i },
  { label: 'Textures', confidence: 'high', terms: /\b(texture|textures|hd pack|4k|2k)\b|\.(dds|png|tga)\b/i },
  { label: 'Scripts', confidence: 'high', terms: /\b(script|scripts|redscript|lua|asi)\b|\.(lua|reds|asi)\b/i },
  { label: 'Framework', confidence: 'high', terms: /\b(framework|bepinex|red4ext|codeware|melonloader)\b/i },
  { label: 'Interface', confidence: 'medium', terms: /\b(ui|hud|interface|menu|inventory)\b/i },
  { label: 'Audio', confidence: 'medium', terms: /\b(audio|sound|music|voice|radio)\b/i },
  { label: 'Animations', confidence: 'medium', terms: /\b(animation|animations|pose|moveset)\b/i },
  { label: 'Véhicules', confidence: 'medium', terms: /\b(vehicle|vehicles|car|cars|bike|truck)\b/i },
  { label: 'Armes', confidence: 'medium', terms: /\b(weapon|weapons|gun|rifle|pistol|sword)\b/i },
  { label: 'Cartes', confidence: 'medium', terms: /\b(map|maps|world|level|location)\b/i },
  { label: 'Personnages', confidence: 'medium', terms: /\b(character|characters|skin|outfit|npc|hair)\b/i },
  { label: 'Traductions', confidence: 'high', terms: /\b(translation|traduction|localization|french|français)\b/i },
  { label: 'Performance', confidence: 'medium', terms: /\b(performance|fps|stutter|optimization|optimisation)\b/i },
  { label: 'Correctifs', confidence: 'medium', terms: /\b(fix|patch|correctif|bugfix)\b/i },
  { label: 'Qualité de vie', confidence: 'low', terms: /\b(qol|quality of life|tweak|convenience)\b/i },
  { label: 'Graphismes', confidence: 'low', terms: /\b(graphics|visual|lighting|weather|cinematic)\b/i },
  { label: 'Gameplay', confidence: 'low', terms: /\b(gameplay|combat|difficulty|balance)\b/i },
]

const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function createUserTag(label: string): ModCategoryTag {
  return { id: slug(label), label: label.trim(), source: 'user', confidence: 'high', userLocked: true }
}

export function inferModCategoryTags(mod: Pick<Mod, 'name' | 'description' | 'files' | 'manifests' | 'framework' | 'loader'>): ModCategoryTag[] {
  const evidence = [mod.name, mod.description, mod.framework, mod.loader, ...(mod.files || []), ...(mod.manifests || [])].filter(Boolean).join(' ')
  return rules
    .filter(rule => rule.terms.test(evidence))
    .slice(0, 4)
    .map(rule => ({ id: slug(rule.label), label: rule.label, source: 'detected', confidence: rule.confidence }))
}

export function withInferredTags<T extends Mod>(mod: T): T {
  if (mod.categoryTags?.some(tag => tag.userLocked)) return mod
  const inferred = inferModCategoryTags(mod)
  return { ...mod, categoryTags: inferred.length ? inferred : mod.categoryTags || [] }
}
