import { FireSimpleIcon, HeartIcon, StarIcon, TimerIcon, UserIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { LoopData } from '../../../deno/types.ts'
import { useAppStore } from '../../app/store.ts'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { SpinnerSmall } from '../../components/Spinner.tsx'
import { AuthForm } from './AuthForm.tsx'
import { useRouter } from './router.tsx'
import { SidebarBrowseList } from './SidebarBrowseList.tsx'
import { toSlug } from './util.ts'

const browseTabFromPathname = (pathname: string) => {
  if (pathname === '/hot') return 'hot'
  if (pathname === '/best') return 'best'
  if (pathname === '/likes') return 'liked'
  if (pathname === '/' || pathname === '') return 'new'
  if (pathname === '/artist' || pathname.startsWith('/artist/')) return 'artist'
  return 'new'
}

const artistIdFromPathname = (pathname: string) => {
  if (!pathname.startsWith('/artist/')) return null
  const rest = pathname.slice('/artist/'.length)
  const id = rest.split('/')[0] || ''
  return id.length > 0 ? id : null
}

const artistNameFromPathname = (pathname: string) => {
  if (!pathname.startsWith('/artist/')) return ''
  const rest = pathname.slice('/artist/'.length)
  const slug = rest.split('/')[1] || ''
  const raw = decodeURIComponent(slug).trim()
  if (!raw) return ''
  return raw.replaceAll('-', ' ')
}

const isArtistWithoutIdPath = (pathname: string) =>
  pathname === '/artist' || (pathname.startsWith('/artist/') && artistIdFromPathname(pathname) == null)

const isBrowsePathname = (pathname: string) => {
  if (pathname === '/' || pathname === '') return true
  if (pathname === '/hot') return true
  if (pathname === '/best') return true
  if (pathname === '/likes') return true
  if (pathname === '/artist' || pathname.startsWith('/artist/')) return true
  return false
}

export function SidebarBrowse() {
  const { pathname, navigate } = useRouter()
  const sessionData = useAppStore(state => state.sessionData)
  const sessionFetchState = useAppStore(state => state.sessionFetchState)
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

  type BrowseTab = 'new' | 'hot' | 'best' | 'liked' | 'artist'
  const [browsePathname, setBrowsePathname] = useState(() => (isBrowsePathname(pathname) ? pathname : '/'))
  useEffect(() => {
    if (!isBrowsePathname(pathname)) return
    setBrowsePathname(prev => (prev === pathname ? prev : pathname))
  }, [pathname])

  const tab = useMemo(() => browseTabFromPathname(browsePathname) as BrowseTab, [browsePathname])
  const routeArtistId = useMemo(() => artistIdFromPathname(browsePathname), [browsePathname])
  const [isNewLoading, setIsNewLoading] = useState(false)
  const [isArtistLoading, setIsArtistLoading] = useState(false)
  const [isHotLoading, setIsHotLoading] = useState(false)
  const [isBestLoading, setIsBestLoading] = useState(false)
  const [isLikedLoading, setIsLikedLoading] = useState(false)
  const [likedViewLoops, setLikedViewLoops] = useState<LoopData[]>([])
  const prevLikedIdsRef = useRef<Set<string> | null>(null)
  const initPathRef = useRef<string | null>(null)
  const didInitRedirectRef = useRef(false)

  useEffect(() => {
    setTimeout(() => {
      document.querySelector('textarea')?.focus({ preventScroll: true })
    }, 0)
  }, [tab])

  useEffect(() => {
    if (initPathRef.current == null) initPathRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (didInitRedirectRef.current) return
    if (sessionFetchState !== 'done') return
    didInitRedirectRef.current = true

    if (sessionData) return
    const initPath = initPathRef.current ?? pathname
    if (initPath === '/likes' || isArtistWithoutIdPath(initPath)) {
      navigate('/', { replace: true })
    }
  }, [navigate, pathname, sessionData, sessionFetchState])

  useEffect(() => {
    if (pathname !== '/artist') return
    const ownId = sessionData?.user.id
    if (!ownId) return
    navigate(`/artist/${ownId}/${toSlug(sessionData?.user.name ?? '')}`, { replace: true })
  }, [navigate, pathname, sessionData?.user.id, sessionData?.user.name])

  useEffect(() => {
    if (tab !== 'new') return
    if (hasFetchedPublicLoops && !isPublicLoopsCacheStale) return
    setIsNewLoading(true)
    void refreshPublicLoops().finally(() => setIsNewLoading(false))
  }, [hasFetchedPublicLoops, isPublicLoopsCacheStale, refreshPublicLoops, tab])

  useEffect(() => {
    if (tab !== 'artist') return
    if (!routeArtistId) return
    if (sessionData?.user.id && routeArtistId === sessionData.user.id) return
    if (hasFetchedPublicLoops && !isPublicLoopsCacheStale) return
    setIsArtistLoading(true)
    void refreshPublicLoops().finally(() => setIsArtistLoading(false))
  }, [
    hasFetchedPublicLoops,
    isPublicLoopsCacheStale,
    refreshPublicLoops,
    routeArtistId,
    sessionData?.user.id,
    tab,
  ])

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

  const artistView = useMemo(() => {
    if (tab !== 'artist') return null
    const artistId = routeArtistId ?? sessionData?.user.id ?? null
    if (!artistId) return { artistId: null, artistName: '', loops: [] as LoopData[] }

    if (sessionData?.user.id && artistId === sessionData.user.id) {
      const loops = (sessionData.loops ?? []).map(loop => {
        // Merge with public loop metadata for likes/comments counts
        const publicLoop = [...publicLoops, ...hotLoops, ...bestLoops, ...likedLoops]
          .find(l => l.id === loop.id)
        if (publicLoop) {
          return { ...loop, likesCount: publicLoop.likesCount, commentsCount: publicLoop.commentsCount }
        }
        return loop
      }).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      return { artistId, artistName: sessionData.user.name, loops }
    }

    const byId = new Map<string, LoopData>()
    for (const loop of [...publicLoops, ...hotLoops, ...bestLoops, ...likedLoops]) {
      if (loop.artistId !== artistId) continue
      byId.set(loop.id, loop)
    }
    const loops = Array.from(byId.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    const artistName = (loops[0]?.artist ?? artistNameFromPathname(browsePathname)) || artistId
    return { artistId, artistName, loops }
  }, [bestLoops, browsePathname, hotLoops, likedLoops, publicLoops, routeArtistId, sessionData, tab])

  const content = useMemo(() => {
    if (tab === 'new') {
      const loops = isNewLoading && !hasFetchedPublicLoops ? [] : publicLoops
      return <SidebarBrowseList loops={loops} emptyLabel="No new loops yet." isLoading={isNewLoading} />
    }
    if (tab === 'hot') {
      return <SidebarBrowseList loops={hotLoops} emptyLabel="No hot loops yet." isLoading={isHotLoading} />
    }
    if (tab === 'best') {
      return <SidebarBrowseList loops={bestLoops} emptyLabel="No best loops yet." isLoading={isBestLoading} />
    }
    if (tab === 'artist') {
      const artistName = artistView?.artistName ?? ''
      const loops = artistView?.loops ?? []
      const showSpinner = loops.length === 0 && (isArtistLoading || !hasFetchedPublicLoops)
      if (!artistName && !sessionData) {
        return (
          <div className="p-3 flex flex-col gap-2 border-b border-neutral-800">
            <AuthForm api={api} onSessionData={setSessionData} />
          </div>
        )
      }
      return (
        <div className="flex flex-col h-full">
          {showSpinner
            ? (
              <div className="flex flex-1 w-full h-full items-center justify-center">
                <RadialGradient>
                  <SpinnerSmall />
                </RadialGradient>
              </div>
            )
            : (
              <div className="p-3 flex flex-col gap-1 border-b border-neutral-800">
                <div className="flex flex-col items-start font-[Turret_Road] font-bold">
                  <span className="bg-gradient-to-br from-orange-400 to-red-600 bg-clip-text text-transparent text-2xl">
                    {artistName}
                  </span>
                </div>
              </div>
            )}
          <SidebarBrowseList loops={loops} emptyLabel={showSpinner ? '' : 'No loops yet.'} hideArtist={true} />
        </div>
      )
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
    artistView,
    bestLoops,
    hasFetchedPublicLoops,
    isArtistLoading,
    isBestLoading,
    isHotLoading,
    isLikedLoading,
    isNewLoading,
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
          onPointerDown={() => navigate('/')}
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
          onPointerDown={() => navigate('/hot')}
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
          onPointerDown={() => navigate('/best')}
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
          onPointerDown={() => navigate('/likes')}
          className={`flex-1 font-semibold text-xs flex items-center justify-center gap-2 ${
            tab === 'liked'
              ? 'bg-black text-white'
              : 'bg-gradient-to-b from-black to-neutral-800 text-neutral-500 hover:text-white'
          }`}
        >
          <HeartIcon weight="regular" size={16} />
        </button>
        <button
          title={'Artist'}
          onPointerDown={() => {
            const id = sessionData?.user.id
            if (!id) {
              navigate('/artist')
              return
            }
            navigate(`/artist/${id}/${toSlug(sessionData?.user.name ?? '')}`)
          }}
          className={`flex-1 font-semibold text-xs flex items-center justify-center gap-2 disabled:opacity-30 ${
            tab === 'artist'
              ? 'bg-black text-white'
              : 'bg-gradient-to-b from-black to-neutral-800 text-neutral-500 hover:text-white'
          }`}
        >
          <UserIcon weight="regular" size={16} />
        </button>
      </div>
      {content}
    </div>
  )
}
