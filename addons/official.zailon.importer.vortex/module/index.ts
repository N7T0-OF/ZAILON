// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on Vortex Importer
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// Add-ons §19). Sans cet add-on installé ET activé (capacité `importer.vortex`),
// aucun import Vortex n'existe : pas de bouton, pas de dialogue, et le Core
// refuse l'import même si une action est appelée (feature removal §57).
// ─────────────────────────────────────────────────────────────────────────────

interface MinimalApi {
  apiVersion: string
  manifest: { id: string; name: string; version: string }
  log: (message: string) => void
  events: {
    on: (event: string, handler: (payload?: unknown) => void) => void
    off: (event: string, handler: (payload?: unknown) => void) => void
  }
  storage: {
    get: (key: string) => unknown
    set: (key: string, value: unknown) => void
    remove?: (key: string) => void
  }
}

interface AddonModule {
  activate: (api: MinimalApi) => void | Promise<void>
  deactivate?: (api: MinimalApi) => void | Promise<void>
}

const addon: AddonModule = {
  async activate(api) {
    api.log('Vortex Importer activé — import du déploiement Vortex disponible.')
    api.storage.set('vortexImportAvailable', true)
  },
  async deactivate(api) {
    api?.storage?.remove?.('vortexImportAvailable')
  },
}

export default addon
