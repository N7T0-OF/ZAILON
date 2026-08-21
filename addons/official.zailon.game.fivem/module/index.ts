// ─────────────────────────────────────────────────────────────────────────────
// module/index.ts — point d'entrée de l'add-on FiveM Profiles
// (manifest.entrypoint, contrat AddonModule — voir docs/addon-sdk.md)
//
// Le module n'est JAMAIS chargé au démarrage de ZAILON (lazy loading, spec
// Add-ons §19). Sans cet add-on installé ET activé (capacité `fivem.profiles`),
// un jeu FiveM s'importe comme n'importe quel jeu : pas de base neutre
// initialisée, pas de bannière adaptateur (feature removal §57). L'adaptateur
// de lancement (FiveM.exe → CitizenFX → Game) reste dans le Core — mécanique
// de lancement, spec « Séparation des responsabilités » §113.
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
    api.log('FiveM Profiles activé — base neutre et bannière adaptateur FiveM disponibles.')
    api.storage.set('fivemProfilesAvailable', true)
  },
  async deactivate(api) {
    api?.storage?.remove?.('fivemProfilesAvailable')
  },
}

export default addon
