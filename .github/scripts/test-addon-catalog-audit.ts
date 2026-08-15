/**
 * Audit d'intégrité du catalogue d'add-ons (spec « Finalisation des add-ons »
 * §55, §121-122) — une carte ne doit JAMAIS mentir :
 *
 *  1. aucune capacité orpheline (capacité → add-on sans dossier ni catalogue) ;
 *  2. catalogue ↔ dossiers `addons/` cohérents (publié = dossier + package) ;
 *  3. chaque `capabilities` d'un manifest repointe vers SON propre add-on ;
 *  4. un add-on publié déclare au moins une capacité (rien de fantôme) ;
 *  5. aucun add-on « En développement » résiduel (18/18 publiés) ;
 *  6. chaque capacité publiée est réellement exercée dans le Core (au moins
 *     une référence hors de `addonGating.ts` — feature removal §57).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CAPABILITY_ADDON, type ZailonCapability } from '../../src/lib/addonGating.ts'
import { OFFICIAL_ADDON_CATALOG } from '../../src/lib/addons.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const addonsRoot = join(root, 'addons')
const catalog = OFFICIAL_ADDON_CATALOG.addons

const capabilityAddons = new Map<string, string>(Object.entries(CAPABILITY_ADDON) as Array<[string, string]>)
const catalogById = new Map(catalog.map(addon => [addon.id, addon]))
const dirs = readdirSync(addonsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)

function manifestOf(id: string): Record<string, unknown> | null {
  const path = join(addonsRoot, id, 'manifest.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Cherche le littéral `needle` dans tous les fichiers src/ (hors addonGating.ts). */
function appearsInCore(needle: string): boolean {
  const stack = [join(root, 'src')]
  while (stack.length) {
    const dir = stack.pop()!
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        stack.push(path)
        continue
      }
      if (!/\.(ts|tsx)$/.test(name)) continue
      if (path.endsWith('addonGating.ts')) continue
      if (readFileSync(path, 'utf8').includes(needle)) return true
    }
  }
  return false
}

const GATING_SOURCE = readFileSync(join(root, 'src/lib/addonGating.ts'), 'utf8')

/** Une capacité est exercée si son littéral est consommé par le Core, OU si une
 * gate dédiée (`*Allowed`) la référence et que cette gate est appelée par le
 * Core (pattern `cyberpunkToolsAllowed` → `'cyberpunk.frameworks'`). */
function capabilityExercised(capability: string): boolean {
  if (appearsInCore(capability)) return true
  const gate = /export function (\w*Allowed)\s*\(/.exec(GATING_SOURCE)
  // Cherche la gate dont le corps référence cette capacité.
  const matches = [...GATING_SOURCE.matchAll(/export function (\w+Allowed)\s*\([\s\S]*?\n\}/g)]
  for (const match of matches) {
    const name = match[1]
    const body = match[0]
    if (body.includes(`'${capability}'`) && appearsInCore(name)) return true
  }
  void gate
  return false
}

test('aucune capacité orpheline : chaque capacité pointe vers un add-on réel (dossier ou catalogue)', () => {
  for (const [capability, addonId] of capabilityAddons) {
    const known = dirs.includes(addonId) || catalogById.has(addonId)
    assert.ok(known, `capacité ${capability} → add-on inexistant ${addonId} (supprimez-la du mapping)`)
  }
})

test('catalogue ↔ dossiers : tout dossier a une entrée, tout package publié a un dossier', () => {
  for (const dir of dirs) {
    assert.ok(catalogById.has(dir), `dossier addons/${dir} sans entrée catalogue`)
  }
  for (const addon of catalog) {
    if (addon.package) {
      assert.ok(dirs.includes(addon.id), `add-on publié ${addon.id} sans dossier addons/`)
    }
  }
})

test('capabilities du manifest repointent vers leur propre add-on', () => {
  for (const dir of dirs) {
    const manifest = manifestOf(dir)
    if (!manifest || !Array.isArray(manifest.capabilities)) continue
    for (const capability of manifest.capabilities as string[]) {
      assert.ok(capability in CAPABILITY_ADDON, `${dir} : capacité inconnue ${capability}`)
      assert.equal(CAPABILITY_ADDON[capability as ZailonCapability], dir, `${dir} : la capacité ${capability} appartient à un autre add-on`)
    }
  }
})

test('tout add-on publié déclare au moins une capacité', () => {
  for (const addon of catalog) {
    if (!addon.package) continue
    const manifest = manifestOf(addon.id)
    const capabilities = manifest?.capabilities
    assert.ok(Array.isArray(capabilities) && capabilities.length > 0, `add-on publié ${addon.id} sans capacité déclarée`)
  }
})

test('aucun add-on « En développement » résiduel (18/18 publiés)', () => {
  const inDevelopment = catalog.filter(addon => !addon.package).map(addon => addon.id)
  assert.deepEqual(inDevelopment.sort(), [])
})

test('chaque capacité publiée est réellement exercée dans le Core (feature removal §57)', () => {
  for (const [capability, addonId] of capabilityAddons) {
    const published = dirs.includes(addonId) && catalogById.get(addonId)?.package
    if (!published) continue
    assert.ok(
      capabilityExercised(capability),
      `capacité publiée ${capability} jamais consommée dans le Core — gate manquante ou fonction fantôme`,
    )
  }
})
