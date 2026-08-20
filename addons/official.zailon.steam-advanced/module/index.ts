// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on Steam Advanced
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// Add-ons §19). Sans cet add-on installé ET activé (capacité `steam.advanced`),
// la détection/import de la bibliothèque Steam n'existe pas : aucun bouton
// de détection dans la Bibliothèque, aucun dialogue de scan, aucun appel
// natif de scan (feature removal §57).
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
    api.log('Steam Advanced activé — détection et import de la bibliothèque Steam disponibles.')
    api.storage.set('steamDetectionAvailable', true)
  },
  async deactivate(api) {
    api?.storage?.remove?.('steamDetectionAvailable')
  },
}

export default addon
