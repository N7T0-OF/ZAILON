import { lazy, Suspense } from 'react'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { useStore } from '../../store/useStore'
import { HomeView } from '../Views/HomeView'
import { GamesView } from '../Views/GamesView'
import { SettingsView } from '../Views/SettingsView'
import { DownloadsView } from '../Views/DownloadsView'
import { TaskToasts } from './TaskToasts'

// Vues lourdes / secondaires chargées À LA DEMANDE (spec « launcher léger ») :
// aucun code Frosty, Visual Profiles, Statistiques, Add-ons, Explore ni News
// n'est parsé/exécuté au démarrage — uniquement quand l'utilisateur y navigue.
// C'est le pendant UI de l'exigence « zéro coût de startup » des add-ons.
const ExploreView = lazy(() => import('../Views/ExploreView').then(m => ({ default: m.ExploreView })))
const NewsView = lazy(() => import('../Views/NewsView').then(m => ({ default: m.NewsView })))
const VisualProfilesPage = lazy(() => import('../../visual-profiles/ui/VisualProfilesPage').then(m => ({ default: m.VisualProfilesPage })))
const AddonsView = lazy(() => import('../Views/AddonsView').then(m => ({ default: m.AddonsView })))
const FrostyEditorView = lazy(() => import('../Views/FrostyEditorView').then(m => ({ default: m.FrostyEditorView })))
const StatisticsView = lazy(() => import('../Views/StatisticsView').then(m => ({ default: m.StatisticsView })))
const SteamDetectionDialog = lazy(() => import('../SteamDetectionDialog').then(m => ({ default: m.SteamDetectionDialog })))

function ViewFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex items-center gap-2.5 text-white/40">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-white/60" />
        <span className="text-xs font-medium">Chargement…</span>
      </div>
    </div>
  )
}

export function AppWindow() {
  const { currentView, discoveryDialogOpen, setDiscoveryDialogOpen, importDetectedGames } = useStore()

  const View = ({
    home: HomeView,
    games: GamesView,
    explore: ExploreView,
    downloads: DownloadsView,
    visuals: VisualProfilesPage,
    news: NewsView,
    settings: SettingsView,
    addons: AddonsView,
    frosty: FrostyEditorView,
    statistics: StatisticsView,
  } as const)[currentView] ?? HomeView

  return (
    <div
      className="zailon-window-surface relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden"
      style={{
        background: 'var(--zailon-window-background, linear-gradient(135deg, #090b0b 0%, #111414 100%))',
      }}
    >
      {/* Subtle grain overlay */}
      <div className="pointer-events-none absolute inset-0 z-50 opacity-[0.025]"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")", backgroundRepeat: 'repeat', backgroundSize: '128px' }} />

      <TitleBar />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden animate-fade-in">
          <Suspense fallback={<ViewFallback />}>
            <View />
          </Suspense>
        </main>
      </div>
      <TaskToasts />
      {/* Fenêtre « Bibliothèque locale » partagée : le « + » de la sidebar et
          « Détecter » de la Bibliothèque ouvrent EXACTEMENT la même fenêtre
          (spec « Détection locale » §5-6). Portail → aucun impact layout.
          Lazy : son code n'est chargé qu'à la première ouverture. */}
      {discoveryDialogOpen && (
        <Suspense fallback={null}>
          <SteamDetectionDialog onClose={() => setDiscoveryDialogOpen(false)} onImport={importDetectedGames} />
        </Suspense>
      )}
    </div>
  )
}
