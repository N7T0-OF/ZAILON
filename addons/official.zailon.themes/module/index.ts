// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on Theme Packs
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// Add-ons §19). Sans cet add-on installé ET activé (capacité `themes.packs`),
// aucune section « Packs de thèmes » n'existe dans les Paramètres (feature
// removal §57) — la couleur d'accent simple reste dans le Core.
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
    api.log('Theme Packs activé — packs de thèmes (accent + densité + texte + animations) disponibles.')
    api.storage.set('themePacksAvailable', true)
  },
  async deactivate(api) {
    api?.storage?.remove?.('themePacksAvailable')
  },
}

export default addon
