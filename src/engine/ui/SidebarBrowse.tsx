import { FireSimpleIcon, HeartIcon, StarIcon, TimerIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../app/store.ts'
import { AuthForm } from './AuthForm.tsx'
import { SidebarBrowseList } from './SidebarBrowseList.tsx'

export function SidebarBrowse() {
  const sessionData = useAppStore(state => state.sessionData)
  const api = useAppStore(state => state.api)
  const setSessionData = useAppStore(state => state.setSessionData)

  const publicLoops = useAppStore(state => state.publicLoopsCache)
  const hotLoops = useAppStore(state => state.hotLoopsCache)
  const bestLoops = useAppStore(state => state.bestLoopsCache)
  const likedLoops = useAppStore(state => state.likedLoopsCache)
  const isPublicLoopsCacheStale = useAppStore(state => state.isPublicLoopsCacheStale)
  const isHotLoopsCacheStale = useAppStore(state => state.isHotLoopsCacheStale)
  const isBestLoopsCacheStale = useAppStore(state => state.isBestLoopsCacheStale)
  const isLikedLoopsCacheStale = useAppStore(state => state.isLikedLoopsCacheStale)

  const refreshPublicLoops = useAppStore(state => state.refreshPublicLoops)
  const refreshHotLoops = useAppStore(state => state.refreshHotLoops)
  const refreshBestLoops = useAppStore(state => state.refreshBestLoops)
  const refreshLikedLoops = useAppStore(state => state.refreshLikedLoops)

  type BrowseTab = 'new' | 'hot' | 'best' | 'liked'
  const [tab, setTab] = useState<BrowseTab>('new')
  const [isLoading, setIsLoading] = useState(false)
  const [isHotLoading, setIsHotLoading] = useState(false)
  const [isBestLoading, setIsBestLoading] = useState(false)
  const [isLikedLoading, setIsLikedLoading] = useState(false)

  useEffect(() => {
    if (tab !== 'new') return
    if (publicLoops.length > 0 && !isPublicLoopsCacheStale) return
    setIsLoading(true)
    void refreshPublicLoops().finally(() => setIsLoading(false))
  }, [isPublicLoopsCacheStale, publicLoops.length, refreshPublicLoops, tab])

  useEffect(() => {
    if (tab !== 'hot') return
    if (hotLoops.length > 0 && !isHotLoopsCacheStale) return
    setIsHotLoading(true)
    void refreshHotLoops().finally(() => setIsHotLoading(false))
  }, [hotLoops.length, isHotLoopsCacheStale, refreshHotLoops, tab])

  useEffect(() => {
    if (tab !== 'best') return
    if (bestLoops.length > 0 && !isBestLoopsCacheStale) return
    setIsBestLoading(true)
    void refreshBestLoops().finally(() => setIsBestLoading(false))
  }, [bestLoops.length, isBestLoopsCacheStale, refreshBestLoops, tab])

  useEffect(() => {
    if (tab !== 'liked') return
    if (!sessionData) return
    if (likedLoops.length > 0 && !isLikedLoopsCacheStale) return
    setIsLikedLoading(true)
    void refreshLikedLoops().finally(() => setIsLikedLoading(false))
  }, [isLikedLoopsCacheStale, likedLoops.length, refreshLikedLoops, sessionData?.user.id, tab])

  const content = useMemo(() => {
    if (tab === 'new') {
      return <SidebarBrowseList loops={publicLoops} emptyLabel="No new loops yet." isLoading={isLoading} />
    }
    if (tab === 'hot') {
      return <SidebarBrowseList loops={hotLoops} emptyLabel="No hot loops yet." isLoading={isHotLoading} />
    }
    if (tab === 'best') {
      return <SidebarBrowseList loops={bestLoops} emptyLabel="No best loops yet." isLoading={isBestLoading} />
    }
    if (!sessionData) {
      return (
        <div className="p-3 flex flex-col gap-2 border-b border-neutral-800">
          <AuthForm api={api} onSessionData={setSessionData} />
        </div>
      )
    }
    return <SidebarBrowseList loops={likedLoops} emptyLabel="No liked loops yet." isLoading={isLikedLoading} />
  }, [
    api,
    bestLoops,
    isBestLoading,
    isHotLoading,
    isLikedLoading,
    isLoading,
    likedLoops,
    hotLoops,
    publicLoops,
    sessionData,
    setSessionData,
    tab,
  ])

  return (
    <div className="flex flex-col w-full h-full">
      <div className="h-[40px] bg-black flex shrink-0">
        <button
          title="New"
          onPointerDown={() => setTab('new')}
          className={`flex-1 font-semibold text-xs flex items-center justify-center gap-2 ${
            tab === 'new'
              ? 'bg-black text-white'
              : 'bg-gradient-to-b from-black to-neutral-800 text-neutral-500 hover:text-white'
          }`}
        >
          <TimerIcon weight="regular" size={16} />
        </button>
        <button
          title="Hot"
          onPointerDown={() => setTab('hot')}
          className={`flex-1 font-semibold text-xs flex items-center justify-center gap-2 ${
            tab === 'hot'
              ? 'bg-black text-white'
              : 'bg-gradient-to-b from-black to-neutral-800 text-neutral-500 hover:text-white'
          }`}
        >
          <FireSimpleIcon weight="regular" size={16} />
        </button>
        <button
          title="Best"
          onPointerDown={() => setTab('best')}
          className={`flex-1 font-semibold text-xs flex items-center justify-center gap-2 ${
            tab === 'best'
              ? 'bg-black text-white'
              : 'bg-gradient-to-b from-black to-neutral-800 text-neutral-500 hover:text-white'
          }`}
        >
          <StarIcon weight="regular" size={16} />
        </button>
        <button
          title="Liked"
          onPointerDown={() => setTab('liked')}
          className={`flex-1 font-semibold text-xs flex items-center justify-center gap-2 ${
            tab === 'liked'
              ? 'bg-black text-white'
              : 'bg-gradient-to-b from-black to-neutral-800 text-neutral-500 hover:text-white'
          }`}
        >
          <HeartIcon weight="regular" size={16} />
        </button>
      </div>
      {content}
    </div>
  )
}
