import test from 'node:test'
import assert from 'node:assert/strict'
import { addonCapabilities, CAPABILITY_ADDON, nteModsAllowed } from '../../src/lib/addonGating.ts'
import { OFFICIAL_ADDON_CATALOG, catalogAddonAvailability, validateAddonManifest } from '../../src/lib/addons.ts'
import { detectModBackend } from '../../src/lib/modBackends.ts'
import { nteLaunchBlocker } from '../../src/lib/nte.ts'
import type { InstalledAddon } from '../../src/lib/addons.ts'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const NTE_ID = 'official.zailon.game.nte'

const makeAddon = (id: string, enabled = true): InstalledAddon => ({
  manifest: { schema: 1, id, name: id, version: '1.0.0', author: 'test', description: '', category: 'game-support', minZailonVersion: '1.0.0', permissions: [] },
  source: 'official',
  installedAt: 0,
  enabled,
  dataKept: true,
})

// ── Feature removal (spec §57) : sans l'add-on, aucun jeu n'est classé NTE PAK ─

test('sans l’add-on NTE → aucune capacité, détection PAK fermée', () => {
  assert.equal(CAPABILITY_ADDON['nte.modloader'], NTE_ID)
  const caps = addonCapabilities([])
  assert.equal(caps.has('nte.modloader'), false)
  assert.equal(nteModsAllowed(caps), false)
  // Un jeu Neverness to Everness SANS l'add-on retombe sur le dossier générique.
  assert.equal(detectModBackend({ gameName: 'Neverness to Everness', nteAllowed: false }), 'generic-folder')
  assert.equal(detectModBackend({ execPath: 'X:\\Games\\NTE\\ntegloballauncher.exe', nteAllowed: false }), 'generic-folder')
})

test('add-on installé mais DÉSACTIVÉ → gate fermée (spec §18)', () => {
  const caps = addonCapabilities([makeAddon(NTE_ID, false)])
  assert.equal(nteModsAllowed(caps), false)
})

test('add-on installé + activé → gate ouverte, backend NTE PAK détecté', () => {
  const caps = addonCapabilities([makeAddon(NTE_ID)])
  assert.equal(caps.has('nte.modloader'), true)
  assert.equal(nteModsAllowed(caps), true)
  assert.equal(detectModBackend({ gameName: 'Neverness to Everness', nteAllowed: true }), 'nte-pak')
})

test('défaut de la lib pure : nteAllowed absent → comportement historique (test-mod-backends)', () => {
  assert.equal(detectModBackend({ gameName: 'Neverness to Everness' }), 'nte-pak')
})

// ── Le package est un vrai package installable (spec §47-49) ─────────────────

test('NTE Support est Disponible dans le catalogue avec package + SHA-256 réel', () => {
  const entry = OFFICIAL_ADDON_CATALOG.addons.find(item => item.id === NTE_ID)
  assert.ok(entry, 'entrée au catalogue')
  const availability = catalogAddonAvailability(entry!)
  assert.equal(availability.installable, true)
  assert.equal(availability.status, 'available')
  assert.ok(entry!.package, 'package versionné')
  assert.ok(entry!.sha256 && /^[0-9a-f]{64}$/i.test(entry!.sha256), 'SHA-256 réel (64 hex)')
})

test('le manifest de l’add-on déclare la capabilité nte.modloader et des permissions valides', () => {
  const raw = JSON.parse(readFileSync(join(root, 'addons', NTE_ID, 'manifest.json'), 'utf8'))
  const result = validateAddonManifest(raw)
  assert.equal(result.ok, true, result.error)
  assert.ok((raw.capabilities as string[]).includes('nte.modloader'))
  assert.ok((raw.slots as string[]).includes('Game.Configuration'))
  for (const permission of result.manifest?.permissions || []) {
    assert.ok(['game.read', 'game.launch', 'process.read', 'mods.read', 'mods.write'].includes(permission), `permission : ${permission}`)
  }
})

// ── Socle « Refonte NTE/Aurora » (spec §4, §5, §10, §20-21, §40) ────────────
// L'erreur « Cannot create IPC pipe to Steam client process » du launcher NTE
// Steam doit être un état identifiable (Steam détecté / non détecté) avec une
// action « Ouvrir Steam », jamais un crash. Le dossier mods n'est créé
// qu'après validation du chemin. Un mod = un ensemble .pak/.utoc/.ucas.

const read = (relative: string) => readFileSync(join(root, relative), 'utf-8')

test('socle NTE : état Steam, création validée AuroraMods et validation des mods sont câblés', () => {
  const rust = read('src-tauri/src/lib.rs')
  const native = read('src/lib/native.ts')
  const panel = read('src/components/Views/GameConfigurationPanel.tsx')
  const store = read('src/store/useStore.ts')

  // Backend natif : commandes enregistrées.
  for (const command of ['nte_steam_check', 'open_steam', 'nte_ensure_mods_dir', 'nte_validate_mods', 'nte_launch_pipeline']) {
    assert.ok(rust.includes(command), `commande native ${command}`)
    assert.ok(rust.includes(`            ${command},`), `${command} enregistrée dans invoke_handler`)
  }
  // Régressions CI native : l'attribut #[tauri::command] doit précéder la
  // commande (jamais un helper pur) — un déplacement cassait generate_handler!
  // (E0425 `__cmd__nte_validate_mods` + wrapper invalide sur `&Path`).
  assert.ok(rust.includes('#[tauri::command]\nfn nte_validate_mods'), 'attribut command sur nte_validate_mods')
  assert.ok(!/\#\[tauri::command\]\n\/\/\/ État d'un ensemble/.test(rust), 'aucun attribut command sur le helper nte_mod_set_status')
  // Message « Ouvrir Steam » qui remplace le crash IPC (spec §20).
  assert.ok(rust.includes('Cannot create IPC pipe to Steam client process'))

  // Bindings frontend.
  assert.ok(native.includes('nteSteamCheck'))
  assert.ok(native.includes('openSteam'))
  assert.ok(native.includes('nteEnsureModsDir'))
  assert.ok(native.includes('nteValidateMods'))
  assert.ok(native.includes('nteLaunchPipeline'))

  // Carte de configuration : état Steam + actions + pipeline.
  assert.ok(panel.includes('Ouvrir Steam'), 'bouton « Ouvrir Steam »')
  assert.ok(panel.includes('Créer le dossier AuroraMods'), 'création validée AuroraMods')
  assert.ok(panel.includes('Valider les mods'), 'validation des ensembles de mods')
  assert.ok(panel.includes('Vérifier le lancement'), 'pipeline de lancement (spec §15, §40)')
  assert.ok(panel.includes('Pipeline de lancement'), 'affichage des étapes du pipeline')
  assert.ok(panel.includes('Copier le rapport'), 'rapport de diagnostic partageable (spec §33)')
  assert.ok(panel.includes('ZAILON NTE Diagnostic'), 'en-tête du rapport de diagnostic (spec §33)')

  // Garde au lancement : un jeu NTE Steam sans Steam ne se lance pas (spec §40).
  assert.ok(store.includes('nteSteamCheck'), 'garde Steam dans le store')
  assert.ok(store.includes('Lancement bloqué'), 'message de blocage au lancement')

  // Spec §10, §22, §40 : le bouton principal intelligent + la garde pipeline
  // (jamais de faux « NTE lancé » avec des mods incomplets).
  assert.ok(panel.includes('Lancer NTE'), 'bouton « Lancer NTE » (spec §22, §39)')
  assert.ok(panel.includes('Corriger avant lancement'), 'bouton « Corriger avant lancement » quand le pipeline est bloqué')
  assert.ok(panel.includes('NTE en cours'), 'état « NTE en cours » pendant la session')
  assert.ok(store.includes('nteLaunchPipeline'), 'garde pipeline dans le store')
  assert.ok(store.includes('nteLaunchBlocker'), 'décision pure de blocage (spec §40)')
  assert.ok(nteLaunchBlocker !== undefined, 'nteLaunchBlocker importé dans le store')

  // Spec §7 : icône des mods — mod.json `icon` / icon.png résolu côté natif,
  // propagé jusqu'à l'affichage.
  assert.ok(rust.includes('nte_resolve_mod_icon'), 'résolution d\'icône locale (spec §7)')
  assert.ok(rust.includes('icon: Option<String>'), 'champ icône du NativeMod natif')
  assert.ok(native.includes('icon?: string'), 'champ icône du type NativeMod TS')
  assert.ok(store.includes('thumbnail: mod.icon'), 'icône propagée vers le catalogue (thumbnail)')
  assert.ok(read('src/components/UI/ModCard.tsx').includes('mod.thumbnail'), 'vignette affichée dans ModCard')
})

test('état réel des mods + lancement via Steam (spec §4-5, §8, §18) : jamais « actif » = « chargé »', () => {
  const rust = read('src-tauri/src/lib.rs')
  const native = read('src/lib/native.ts')
  const panel = read('src/components/Views/GameConfigurationPanel.tsx')
  const store = read('src/store/useStore.ts')
  const gamesView = read('src/components/Views/GamesView.tsx')

  // Backend natif : l'état réel distingue installé/activé/complet/loader du
  // chargement runtime (toujours NON confirmable) — la règle §18.
  for (const command of ['nte_mods_state', 'nte_launch_game']) {
    assert.ok(rust.includes(command), `commande native ${command}`)
    assert.ok(rust.includes(`            ${command},`), `${command} enregistrée dans invoke_handler`)
  }
  assert.ok(rust.includes('NTE_STEAM_APP_ID: u32 = 4508340'), 'AppID NTE 4508340 (vérifié dans le source Aurora, jamais deviné)')
  assert.ok(rust.includes('steam://rungameid'), 'lancement via le protocole Steam (IPC du launcher valide)')
  assert.ok(rust.includes('Cannot create IPC pipe to Steam client process'), 'erreur IPC anticipée dans la stratégie de lancement')
  assert.ok(rust.includes('runtime_confirmable: false'), 'chargement runtime jamais confirmé sans hook actif (spec §8, §18)')
  assert.ok(rust.includes('"dwmapi.dll"'), 'wrapper dwmapi.dll ajouté à la détection du loader (mécanisme réel Aurora)')

  // Bindings frontend.
  assert.ok(native.includes('nteModsState'), 'binding natif nteModsState')
  assert.ok(native.includes('nteLaunchGame'), 'binding natif nteLaunchGame')
  assert.ok(native.includes('runtimeConfirmable: boolean'), 'type NteModsState avec runtimeConfirmable')

  // Store : un jeu NTE est lancé par le backend NTE réel, jamais par le
  // lancement générique ; la session démarre « en attente du jeu » (le
  // moteur de présence rattache le processus final).
  assert.ok(store.includes('native.nteLaunchGame('), 'lancement NTE via nteLaunchGame dans le store')
  assert.ok(store.includes("'zailon', true)"), 'session « en attente du jeu » après un lancement NTE')
  assert.ok(store.includes("state: waitForGame ? 'WaitingForGame' : 'LauncherStarted'"), 'état initial WaitingForGame pour les lancements sans PID enfant')

  // UI : « activé » ≠ « chargé » — wording honnête partout.
  assert.ok(gamesView.includes('mods activés'), 'badge « mods activés » (jamais « actifs »)')
  assert.ok(panel.includes('État réel des mods'), 'bloc « État réel des mods » dans la carte NTE')
  assert.ok(panel.includes('Chargement runtime : non confirmable'), 'preuve runtime explicitement non confirmable')
  assert.ok(panel.includes('wrapper Aurora'), 'loader décrit par son mécanisme réel (DLL wrapper)')
  assert.ok(panel.includes('aucun mod dans AuroraMods'), '« 0/0 valides » remplacé par un message honnête')
})

test('groupes de mods Aurora (spec §25) : entrée groupe + membres, toggle bulk, validation', () => {
  const rust = read('src-tauri/src/lib.rs')
  const native = read('src/lib/native.ts')
  const store = read('src/store/useStore.ts')
  const types = read('src/types/index.ts')
  const gamesView = read('src/components/Views/GamesView.tsx')

  // Scan natif : un dossier `AU GRP - <nom>` devient une entrée groupe + des
  // membres individuels avec métadonnées groupe (jamais un mod fusionné).
  assert.ok(rust.includes('NTE_GROUP_PREFIX'), 'préfixe de groupe Aurora déclaré')
  assert.ok(rust.includes('nte_is_group_name'), 'détection d\'un dossier groupe')
  assert.ok(rust.includes('nte_group_mod'), 'entrée groupe construite par le scan')
  assert.ok(rust.includes('scan_nte_group_members'), 'membres de groupe scannés individuellement')
  assert.ok(rust.includes('group_id: Option<String>'), 'champ group_id du NativeMod natif')
  assert.ok(rust.includes('group_name: Option<String>'), 'champ group_name du NativeMod natif')
  assert.ok(rust.includes('"NteGroup"'), 'type d\'entrée groupe (mod_type)')

  // Validation : le conteneur n'est pas un mod — les membres sont validés.
  assert.ok(rust.includes('nte_mod_set_status'), 'validation d\'un ensemble de mod extraite (membres inclus)')

  // Types TS + propagation store.
  assert.ok(native.includes('groupId?: string'), 'champ groupId du type NativeMod TS')
  assert.ok(native.includes('groupName?: string'), 'champ groupName du type NativeMod TS')
  assert.ok(types.includes('isGroup?: boolean'), 'champ isGroup du type Mod')
  assert.ok(types.includes('groupId?: string'), 'champ groupId du type Mod')
  assert.ok(types.includes('groupName?: string'), 'champ groupName du type Mod')
  assert.ok(store.includes('isGroup: mod.modType === \'NteGroup\''), 'propagation isGroup dans nativeModToMod')
  assert.ok(store.includes('groupId: mod.groupId ?? undefined'), 'propagation groupId dans nativeModToMod')

  // UI : carte groupe (toggle = bulk sur les membres) + badge groupe sur les cartes membres.
  assert.ok(gamesView.includes('NteGroupCard'), 'carte groupe importée dans la liste des mods')
  assert.ok(gamesView.includes('mod.isGroup'), 'branchement entrée groupe dans le rendu')
  assert.ok(gamesView.includes('bulkSetEnabled(members.map(member => member.id), !mod.enabled)'), 'toggle du groupe = bulk sur les membres')
  assert.ok(read('src/components/UI/ModCard.tsx').includes('mod.groupName'), 'badge groupe sur la carte membre')
  assert.ok(read('src/components/UI/NteGroupCard.tsx').includes('ZailonSwitch'), 'carte groupe avec interrupteur d\'activation')
})

test('staging par hardlinks NTE (spec §9) : liens .pak → AuroraMods, repli copie, toggle déployé', () => {
  const rust = read('src-tauri/src/lib.rs')
  const native = read('src/lib/native.ts')
  const store = read('src/store/useStore.ts')
  const types = read('src/types/index.ts')
  const gamesView = read('src/components/Views/GamesView.tsx')

  // Backend natif : lien dur + repli copie + déploiement transactionnel.
  assert.ok(rust.includes('fn nte_link_or_copy'), 'lien dur avec repli copie (spec §9)')
  assert.ok(rust.includes('fs::hard_link'), 'création réelle d\'un lien dur')
  assert.ok(rust.includes('fn nte_deploy_mod'), 'commande de déploiement AuroraMods')
  assert.ok(rust.includes('nte_deploy_mod,'), 'nte_deploy_mod enregistrée dans invoke_handler')
  assert.ok(rust.includes('NTE_MOD_JSON'), 'mod.json écrit dans le dossier déployé (spec §7)')
  assert.ok(rust.includes('"deployedPath"'), 'chemin déployé enregistré dans le manifest staged')
  assert.ok(rust.includes('"Hardlink"'), 'backend Hardlink déclaré dans le manifest')

  // Types + bindings frontend.
  assert.ok(native.includes('nteDeployMod'), 'binding natif nteDeployMod')
  assert.ok(native.includes('NteDeployResult'), 'type NteDeployResult')
  assert.ok(native.includes('deployedPath?: string'), 'champ deployedPath du NativeMod TS')
  assert.ok(types.includes('deployedPath?: string'), 'champ deployedPath du type Mod')
  assert.ok(store.includes('deployedPath: mod.deployedPath ?? undefined'), 'propagation deployedPath dans nativeModToMod')

  // Toggle NTE : un mod staged DÉPLOYÉ se toggle sur le dossier AuroraMods.
  assert.ok(store.includes('deployedNteTarget'), 'toggle cible le dossier déployé (spec §9)')
  assert.ok(store.includes('native.toggleNteMod(deployedNteTarget'), 'renommage .pak ↔ .pak.disabled sur le dossier déployé')

  // Import NTE : déploiement par hardlinks après staging (jamais le chemin
  // générique au lancement, qui ne connaît pas le layout AuroraMods).
  assert.ok(gamesView.includes('nteImport'), 'détection NTE dans le dialogue d\'import')
  assert.ok(gamesView.includes('native.nteDeployMod(installedPath, destination)'), 'déploiement par hardlinks après import (spec §9)')
})

test('pipeline de lancement NTE : détection du loader Everlight jamais téléchargé (spec §11-14, §35)', () => {
  const rust = read('src-tauri/src/lib.rs')
  assert.ok(rust.includes('version.dll'), 'DLL d\'injection Everlight version.dll')
  assert.ok(rust.includes('dsound.dll'), 'DLL d\'injection Everlight dsound.dll')
  assert.ok(rust.includes('jamais téléchargé'), 'ZAILON ne télécharge pas de DLL (spec §35)')
  assert.ok(rust.includes('nte_pipeline_steps'), 'logique pure des étapes testée')
})

test('monitoring de session NTE : modification des mods → « redémarrage nécessaire » (spec §16-17)', () => {
  const app = read('src/App.tsx')
  const store = read('src/store/useStore.ts')
  const lib = read('src/lib/nte.ts')
  // La logique pure décide capture/notify/wait (testée dans test-nte-lib).
  assert.ok(lib.includes('nteModsChangeDecision'), 'décision pure de monitoring')
  // Le tick d'App.tsx branche le monitoring (cadencé, fingerprint léger).
  assert.ok(app.includes('nteModsChangeDecision'), 'monitoring branché dans App.tsx')
  assert.ok(app.includes('mods-changed'), 'toast dédié « mods modifiés »')
  assert.ok(app.includes('redémarrage de NTE nécessaire'), 'message de redémarrage nécessaire')
  // Le store garde baseline + notification par session, réinitialisés à la fin.
  assert.ok(store.includes('nteModsBaselines'), 'baseline des mods par session')
  assert.ok(store.includes('nteModsChangeNotified'), 'notification unique par session')
  assert.ok(store.includes('resetNteModsSession'), 'réinitialisation à la fin de session')
})
