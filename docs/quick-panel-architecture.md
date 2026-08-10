# Quick Panel — architecture et contenu contextuel

Spécification : bloc « Quick Panel / Panneau rapide » — spec §16-18 (contenu),
§24-25 (Performance / FPS), §64-69 (connexion, mods non préparés).

## Architecture (rappel)

- **Fenêtre native indépendante** : `quick_panel.rs` crée une vraie fenêtre système
  (toujours au-dessus, sans barre de titre, fermée à la perte de focus) — jamais une
  injection, jamais un overlay DirectX/Vulkan (spec §8, §56).
- **WebView séparée** : le composant `src/components/QuickPanel.tsx` n'a PAS accès au
  store Zustand de la fenêtre principale — il communique par événements Tauri :
  - `quick-panel-ready` (panneau → principale : demande l'état) ;
  - `quick-panel-state` (principale → panneau : résumé compact) ;
  - `quick-panel-action` (panneau → principale : toggle clavier, focus, set-performance) ;
  - `quick-panel-refresh` (principale → panneau : re-demande après changement).

## Contenu (release 1.53.0)

Le panneau reste compact (spec §16 : pas de mini-launcher) :

1. **Session** : jeu, profil, mods actifs, disposition clavier, bypass, RED4ext ⚠,
   statuts RÉELS (Connexion / Clavier / Visuel / Runtime — ✓/⚠, spec §19) ;
2. **Visuel** : activer/désactiver, profil précédent/suivant, restaurer ;
3. **Clavier** : toggle de la disposition ZAILON (état réel de session) ;
4. **Performance** (spec §24) : mode rapide + badges de pause réels ;
5. **Discord** (spec §38, release 1.58.0) : état honnête + bascule rapide +
   Configurer ;
6. **Actions** : Ouvrir ZAILON / Fermer.

## Discord (spec §38, release 1.58.0)

`quickPanelDiscordState(enabled, connected, publishedGameName)` — logique pure :

- `published = enabled && connected && publishedGameName` — ✓ « Présence active ·
  <jeu> » **seulement** si la présence est réellement publiée (`lastDiscordPublished`),
  jamais un faux ✓ quand Discord est fermé ou la présence désactivée ;
- « En attente de Discord » quand le client IPC n'est pas connecté (spec §33) ;
- « Désactivé » quand le réglage est OFF (spec §34).

Interaction :

- **Toggle** → `set-discord` → `store.toggleDiscord()` (persiste + re-synchronise la
  présence) → `quick-panel-refresh` → état re-émis ;
- **Configurer** → `open-discord-settings` → `setView('settings')` + fenêtre au
  premier plan + événement `open-settings-section` (défilement jusqu'à la section
  « Discord Rich Presence »).

La connexion IPC est mémorisée dans la fenêtre principale (listener
`discord-status-changed` → `discordConnected`) et transmise dans le payload
`quick-panel-state` — aucune lecture directe du natif depuis le panneau.

## Performance (spec §24)

`quickPanelPerformanceState(performanceModes, globalPerformanceMode, runtimeActivity,
gameId)` — logique pure dans `src/lib/quickPanelState.ts` :

- mode effectif : explicite par jeu sinon mode global ;
- `downloadsPaused` : `runtimeActivity.downloads === 'paused'` ;
- `scansPaused` : `runtimeActivity.scans !== 'normal'` (les politiques dérivées des
  sessions vivantes, spec Performance §37-39).

Changement depuis le panneau : `set-performance` → `setPerformanceMode(gameId, mode)`
sur la session prioritaire → `quick-panel-refresh` → le panneau reçoit l'état
actualisé. La fenêtre principale reflète immédiatement le changement (spec §88-89).

## Mods non préparés (spec §69)

`modsPreparedFor(session)` : `true` seulement si `session.source === 'zailon'` ET
`session.deploymentActive === true`. Sinon le panneau affiche
**« Mods ⚠ Non préparés »** avec la bulle : « Le jeu a été lancé avant la préparation
du profil (Steam, launcher externe ou UAC) ». Un jeu détecté après coup n'a jamais un
faux ✓.

## FPS (spec §25)

Non affiché dans le panneau : les backends FPS natifs (natif → pilote → Unsupported)
ne sont pas encore implémentés — la règle est respectée (« Ne pas afficher un faux
contrôle », §25 ; « afficher uniquement si une source légère existe », §37).

## Limites / prochaines étapes

- **Nom du profil visuel** dans le panneau (spec §17-18) : l'état actif est affiché
  (✓/⚠) mais le nom du profil (Cinématique…) n'est pas exposé par le module
  visual-profiles — à connecter.
- **Bouton « Tester le panneau »** (spec §44) et **diagnostic développeur** (spec §45).
- **Mémorisation position/écran** (spec §51-52) et **auto-hide** (spec §83-84).
- **Boutons Discord** (spec §26) : boutons vers une URL publique ZAILON — non encore
  ajoutés (facultatif).

## Validation

- `tsc` ✅, build ✅, **171/171 tests** (4 nouveaux pour le Discord du panneau).
- **Verify native ✅ + Verify ZAILON ✅** (release 1.58.0).
