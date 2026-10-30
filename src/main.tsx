import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { QuickPanel } from './components/QuickPanel'
import { bootstrapTheme } from './lib/designTokens'
import './index.css'

// ThemeBootstrap (spec §7) : appliquer les tokens persistés AVANT le premier
// rendu — la couleur d'accent choisie par l'utilisateur ne clignote jamais en
// blanc par défaut au démarrage.
bootstrapTheme(document.documentElement)

// Deux fenêtres partagent le même bundle : la fenêtre principale rend l'app
// complète, la fenêtre « quick-panel » (Quick Game Panel, Phase 6) rend
// uniquement le panneau compact — jamais une injection dans le jeu.
async function render() {
  let quickPanel = false
  if (isTauri()) {
    try {
      quickPanel = getCurrentWindow().label === 'quick-panel'
    } catch {
      // aperçu web : fenêtre principale.
    }
  }
  const root = ReactDOM.createRoot(document.getElementById('root')!)
  root.render(
    <React.StrictMode>
      {quickPanel ? <QuickPanel /> : <App />}
    </React.StrictMode>,
  )
}

void render()
