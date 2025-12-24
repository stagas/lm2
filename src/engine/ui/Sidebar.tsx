import {
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  ArticleIcon,
  GearSixIcon,
  GlobeIcon,
  HeartIcon,
  WaveformIcon,
} from '@phosphor-icons/react'
import {
  useRef,
  useState,
} from 'react'
import { useEngineUiStore } from '../store.ts'
import { SidebarLoops } from './SidebarLoops.tsx'
import { SidebarSettings } from './SidebarSettings.tsx'

export type SidebarTab = 'loops' | 'liked' | 'browse' | 'compiled' | 'settings'

const SidebarTabIcon: Record<SidebarTab, React.ReactNode> = {
  loops: <WaveformIcon weight="regular" size={16} />,
  liked: <HeartIcon weight="regular" size={16} />,
  browse: <GlobeIcon weight="regular" size={16} />,
  compiled: <ArticleIcon weight="regular" size={16} />,
  settings: <GearSixIcon weight="regular" size={16} />,
}

export function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const sidebarTab = useEngineUiStore(state => state.sidebarTab)
  const setSidebarTab = useEngineUiStore(state => state.setSidebarTab)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  return (
    <div className={`z-10 relative h-full min-w-0 ${sidebarOpen ? 'w-[40ch]' : 'w-0'}`}>
      {sidebarOpen && (
        <div className="flex flex-col w-full h-full">
          <div className="h-[40px] bg-black flex shrink-0">
            {Object.entries(SidebarTabIcon).map(([tab, icon]) => (
              <button
                key={tab}
                title={tab}
                onPointerDown={() => setSidebarTab(tab as SidebarTab)}
                className={`flex-1 font-semibold text-xs flex items-center justify-center gap-2 ${
                  sidebarTab === tab
                    ? 'bg-black text-white'
                    : 'bg-gradient-to-b from-black to-neutral-800 text-neutral-500 hover:text-white'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-col w-full h-full overflow-y-auto" ref={scrollContainerRef}>
            {sidebarTab === 'loops' && (
              <SidebarLoops scrollContainerRef={scrollContainerRef} apiError={apiError} setApiError={setApiError} />
            )}
            {sidebarTab === 'settings' && <SidebarSettings apiError={apiError} setApiError={setApiError} />}
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
