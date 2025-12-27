import {
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  ArticleIcon,
  GearSixIcon,
  GlobeIcon,
  WaveformIcon,
} from '@phosphor-icons/react'
import {
  useEffect,
  useRef,
  useState,
} from 'react'
import { DEBUG } from '../constants.ts'
import { useEngineUiStore } from '../store.ts'
import { BytecodeInspector } from './BytecodeInspector.tsx'
import { useRouter } from './router.tsx'
import { SidebarBrowse } from './SidebarBrowse.tsx'
import { SidebarLoops } from './SidebarLoops.tsx'
import { SidebarSettings } from './SidebarSettings.tsx'

export type SidebarTab = 'loops' | 'browse' | 'compiled' | 'settings'

const SidebarTabIcon: Record<SidebarTab, React.ReactNode> = {
  loops: <WaveformIcon weight="regular" size={16} />,
  browse: <GlobeIcon weight="regular" size={16} />,
  compiled: <ArticleIcon weight="regular" size={16} />,
  settings: <GearSixIcon weight="regular" size={16} />,
}

const SidebarTitles: Record<SidebarTab, string> = {
  loops: 'My Loops',
  browse: 'Browse Loops',
  compiled: 'Bytecode Inspector',
  settings: 'Tools and Settings',
} as const

const sidebarTabFromPathname = (pathname: string): SidebarTab => {
  if (pathname === '/settings') return 'settings'
  if (pathname === '/my') return 'loops'
  if (pathname === '/compiled') return DEBUG ? 'compiled' : 'browse'
  if (pathname === '/' || pathname === '/hot' || pathname === '/best' || pathname === '/likes'
    || pathname.startsWith('/artist'))
  {
    return 'browse'
  }
  return 'browse'
}

export function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const sidebarTab = useEngineUiStore(state => state.sidebarTab)
  const setSidebarTab = useEngineUiStore(state => state.setSidebarTab)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const { pathname, navigate } = useRouter()
  const activeTab = sidebarTabFromPathname(pathname)

  useEffect(() => {
    if (sidebarTab !== activeTab) setSidebarTab(activeTab)
  }, [activeTab, setSidebarTab, sidebarTab])

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  return (
    <div className={`font-light z-10 relative h-full min-w-0 ${sidebarOpen ? 'w-[40ch]' : 'w-0'}`}>
      {sidebarOpen && (
        <div className="flex flex-col w-full h-full">
          <div className="h-[40px] bg-black flex shrink-0">
            {Object.entries(SidebarTabIcon).filter(([tab]) => DEBUG || tab !== 'compiled').map(([tab, icon]) => (
              <button
                key={tab}
                title={SidebarTitles[tab as SidebarTab]}
                onPointerDown={() => {
                  const t = tab as SidebarTab
                  if (t === 'loops') navigate('/my')
                  else if (t === 'browse') navigate('/')
                  else if (t === 'settings') navigate('/settings')
                  else if (t === 'compiled') navigate('/compiled')
                }}
                className={`flex-1 font-semibold text-xs flex items-center justify-center gap-2 ${
                  activeTab === tab
                    ? 'bg-black text-white'
                    : 'bg-gradient-to-b from-black to-neutral-800 text-neutral-500 hover:text-white'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-col w-full h-full overflow-y-auto" ref={scrollContainerRef}>
            {activeTab === 'loops' && (
              <SidebarLoops scrollContainerRef={scrollContainerRef} apiError={apiError} setApiError={setApiError} />
            )}
            {activeTab === 'browse' && <SidebarBrowse />}
            {activeTab === 'compiled' && <BytecodeInspector />}
            {activeTab === 'settings' && <SidebarSettings apiError={apiError} setApiError={setApiError} />}
          </div>
        </div>
      )}
      <button
        onPointerDown={toggleSidebar}
        className="
              absolute right-[-37px] top-0 w-[37px] h-[40px] flex items-center justify-center bg-red-500
              bg-gradient-to-br from-neutral-700 to-black text-[#888] hover:text-white
            "
      >
        {sidebarOpen
          ? <ArrowLineLeftIcon weight="regular" size={16} />
          : <ArrowLineRightIcon weight="regular" size={16} />}
      </button>
    </div>
  )
}
