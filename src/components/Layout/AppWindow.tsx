import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { useStore } from '../../store/useStore'
import { HomeView } from '../Views/HomeView'
import { GamesView } from '../Views/GamesView'
import { ExploreView } from '../Views/ExploreView'
import { NewsView } from '../Views/NewsView'
import { SettingsView } from '../Views/SettingsView'
import { DownloadsView } from '../Views/DownloadsView'
import { ToolsView } from '../Views/ToolsView'
import { StatusBar } from './StatusBar'

export function AppWindow() {
  const { currentView } = useStore()

  const View = {
    home: HomeView,
    games: GamesView,
    explore: ExploreView,
    downloads: DownloadsView,
    mods: GamesView,
    tools: ToolsView,
    news: NewsView,
    settings: SettingsView,
  }[currentView]

  return (
    <div
      className="relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #080710 0%, #0d0c17 100%)',
      }}
    >
      {/* Subtle grain overlay */}
      <div className="pointer-events-none absolute inset-0 z-50 opacity-[0.025]"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")", backgroundRepeat: 'repeat', backgroundSize: '128px' }} />

      <TitleBar />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden animate-fade-in">
          <View />
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
