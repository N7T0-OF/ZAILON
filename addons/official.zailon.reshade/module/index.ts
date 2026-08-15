// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on ReShade Manager
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// Add-ons §19). Sans cet add-on installé ET activé (capacité `reshade.manager`),
// aucune section ReShade n'existe dans la configuration d'un jeu (feature
// removal §57).
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
    api.log('ReShade Manager activé — gestion ReShade par jeu disponible.')
    api.storage.set('reshadeAvailable', true)
  },
  async deactivate(api) {
    api?.storage?.remove?.('reshadeAvailable')
  },
}

export default addon
