// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on Frosty Editor
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// L'add-on fournit la capacité `frosty.editor` : sans lui, l'espace
// « Création Frosty » n'apparaît nulle part (sidebar, configuration jeu,
// raccourcis) et aucun code d'édition n'est chargé (spec §42, §74).
//
// Lazy loading strict (spec §3, §116) : même installé, aucun SDK Frosty,
// aucun index d'assets et aucun Worker ne sont initialisés au démarrage —
// ils ne démarrent que lorsque l'utilisateur ouvre réellement l'espace.
// ─────────────────────────────────────────────────────────────────────────────

// Typage minimal du SDK — le SDK réel (ZailonAddonApi, UIExtensionService)
// est fourni par ZAILON au runtime ; les permissions sont vérifiées par la
// gate (spec §11-13, §28-29).
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
  }
  ui: {
    registerSlot: (slot: string, component: unknown) => void
    unregisterSlot: (slot: string) => void
  }
}

interface AddonModule {
  activate: (api: MinimalApi) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}

const addon: AddonModule = {
  async activate(api) {
    api.log('Frosty Editor activé — édition Frostbite disponible à la demande.')

    // Slot UI (permission `ui.extend`) : l'espace « Création Frosty » est
    // déclaré ici ; le Core le monte uniquement quand la capacité est active.
    api.ui.registerSlot('GameCreation.Frosty', { provider: 'official.zailon.frosty-editor' })

    // Aucun Worker, aucun index : tout est déclenché par l'ouverture réelle
    // de l'espace (spec §3, §116) — jamais au démarrage de ZAILON.
    api.storage.set('assetIndexMode', 'lazy')
    api.storage.set('workerMode', 'on-demand')
    api.storage.set('requiresBackend', 'official.zailon.frosty')
  },

  async deactivate() {
    // L'espace et ses hooks UI sont libérés ; les projets utilisateur
    // (addon-data) restent intacts (spec §17, §114-115).
  },
}

export default addon
