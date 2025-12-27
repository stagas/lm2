import { FireSimpleIcon, HeartIcon, StarIcon, TimerIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LoopData } from '../../../deno/types.ts'
import { useAppStore } from '../../app/store.ts'
import { AuthForm } from './AuthForm.tsx'
import { SidebarBrowseList } from './SidebarBrowseList.tsx'

export function SidebarBrowse() {
  const sessionData = useAppStore(state => state.sessionData)
  const api = useAppStore(state => state.api)
  const setSessionData = useAppStore(state => state.setSessionData)

  const publicLoops = useAppStore(state => state.publicLoopsCache)
  const hasFetchedPublicLoops = useAppStore(state => state.hasFetchedPublicLoops)
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
  const [likedViewLoops, setLikedViewLoops] = useState<LoopData[]>([])
  const prevLikedIdsRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    setTimeout(() => {
      document.querySelector('textarea')?.focus({ preventScroll: true })
    }, 0)
  }, [tab])

  useEffect(() => {
    if (tab !== 'new') return
    if (hasFetchedPublicLoops && !isPublicLoopsCacheStale) return
    setIsLoading(true)
    void refreshPublicLoops().finally(() => setIsLoading(false))
  }, [hasFetchedPublicLoops, isPublicLoopsCacheStale, refreshPublicLoops, tab])

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
    if (sessionData.likedLoopIds.length === 0) return
    if (likedLoops.length > 0 && !isLikedLoopsCacheStale) return
    setIsLikedLoading(true)
    void refreshLikedLoops().finally(() => setIsLikedLoading(false))
  }, [isLikedLoopsCacheStale, likedLoops.length, refreshLikedLoops, sessionData, tab])

  useEffect(() => {
    if (tab === 'liked') return
    if (likedViewLoops.length === 0) return
    setLikedViewLoops([])
  }, [likedViewLoops.length, tab])

  useEffect(() => {
    if (tab !== 'liked') return
    setLikedViewLoops(prev => {
      if (prev.length === 0) return likedLoops
      const byId = new Map(likedLoops.map(l => [l.id, l] as const))
      const merged = prev.map(l => byId.get(l.id) ?? l)
      const ids = new Set(merged.map(l => l.id))
      const next = likedLoops.filter(l => !ids.has(l.id))
      if (next.length === 0) return merged
      return [...next, ...merged]
    })
  }, [likedLoops, tab])

  useEffect(() => {
    if (tab !== 'liked') {
      prevLikedIdsRef.current = null
      return
    }

    const curr = new Set(sessionData?.likedLoopIds ?? [])
    const prev = prevLikedIdsRef.current
    prevLikedIdsRef.current = curr
    if (!prev) return

    const added = new Set(Array.from(curr).filter(id => !prev.has(id)))
    const removed = new Set(Array.from(prev).filter(id => !curr.has(id)))
    if (added.size === 0 && removed.size === 0) return

    setLikedViewLoops(loops =>
      loops.map(loop => {
        const delta = (added.has(loop.id) ? 1 : 0) + (removed.has(loop.id) ? -1 : 0)
        if (delta === 0) return loop
        return { ...loop, likesCount: Math.max(0, loop.likesCount + delta) }
      })
    )
  }, [sessionData?.likedLoopIds, sessionData?.user.id, tab])

  const content = useMemo(() => {
    if (tab === 'new') {
      const loops = isLoading && !hasFetchedPublicLoops ? [] : publicLoops
      return <SidebarBrowseList loops={loops} emptyLabel="No new loops yet." isLoading={isLoading} />
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
    const loops = likedViewLoops.length === 0 ? likedLoops : likedViewLoops
    return <SidebarBrowseList loops={loops} emptyLabel="No liked loops yet." isLoading={isLikedLoading} />
  }, [
    api,
    bestLoops,
    hasFetchedPublicLoops,
    isBestLoading,
    isHotLoading,
    isLikedLoading,
    isLoading,
    likedLoops,
    likedViewLoops,
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
