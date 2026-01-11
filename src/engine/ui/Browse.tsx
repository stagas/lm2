import { FireSimpleIcon, HeartIcon, StarIcon, TimerIcon, UserIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { LoopData } from '../../../deno/types.ts'
import { useAppStore } from '../../app/store.ts'
import { Logo } from '../../components/Logo.tsx'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { SpinnerSmall } from '../../components/Spinner.tsx'
import { AuthForm } from './AuthForm.tsx'
import { BrowseList } from './BrowseList.tsx'
import { Link, useRouter } from './router.tsx'
import { toSlug } from './util.ts'

const browseTabFromPathname = (pathname: string) => {
  if (pathname === '/browse/hot') return 'hot'
  if (pathname === '/browse/best') return 'best'
  if (pathname === '/browse/likes') return 'liked'
  if (pathname === '/browse' || pathname === '/browse/new') return 'new'
  if (pathname === '/browse/artist' || pathname.startsWith('/browse/artist/')) return 'artist'
  return 'new'
}

const artistIdFromPathname = (pathname: string) => {
  if (!pathname.startsWith('/browse/artist/')) return null
  const rest = pathname.slice('/browse/artist/'.length)
  const id = rest.split('/')[0] || ''
  return id.length > 0 ? id : null
}

const artistNameFromPathname = (pathname: string) => {
  if (!pathname.startsWith('/browse/artist/')) return ''
  const rest = pathname.slice('/browse/artist/'.length)
  const slug = rest.split('/')[1] || ''
  const raw = decodeURIComponent(slug).trim()
  if (!raw) return ''
  return raw.replaceAll('-', ' ')
}

const isArtistWithoutIdPath = (pathname: string) =>
  pathname === '/browse/artist' || (pathname.startsWith('/browse/artist/') && artistIdFromPathname(pathname) == null)

const isBrowsePathname = (pathname: string) => {
  if (pathname === '/browse' || pathname === '/browse/new') return true
  if (pathname === '/browse/hot') return true
  if (pathname === '/browse/best') return true
  if (pathname === '/browse/likes') return true
  if (pathname === '/browse/artist' || pathname.startsWith('/browse/artist/')) return true
  return false
}

export function Browse() {
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
  const [browsePathname, setBrowsePathname] = useState(() => (isBrowsePathname(pathname) ? pathname : '/browse'))
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

  const initPathRef = useRef<string | null>(null)
  const didInitRedirectRef = useRef(false)

  useEffect(() => {
    if (initPathRef.current == null) initPathRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (didInitRedirectRef.current) return
    if (sessionFetchState !== 'done') return
    didInitRedirectRef.current = true

    const initPath = initPathRef.current ?? pathname
    if (initPath === '/browse/likes' || isArtistWithoutIdPath(initPath)) {
      navigate('/browse', { replace: true })
    }
  }, [navigate, pathname, sessionFetchState])

  useEffect(() => {
    if (pathname !== '/browse/artist') return
    const ownId = sessionData?.user.id
    if (!ownId) return
    navigate(`/browse/artist/${ownId}/${toSlug(sessionData?.user.name ?? '')}`, { replace: true })
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
    if (hasFetchedPublicLoops && !isPublicLoopsCacheStale) return
    setIsArtistLoading(true)
    void refreshPublicLoops().finally(() => setIsArtistLoading(false))
  }, [
    hasFetchedPublicLoops,
    isPublicLoopsCacheStale,
    refreshPublicLoops,
    routeArtistId,
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

  const artistView = useMemo(() => {
    if (tab !== 'artist') return null
    const artistId = routeArtistId ?? sessionData?.user.id ?? null
    if (!artistId) return { artistId: null, artistName: '', loops: [] as LoopData[] }

    const byId = new Map<string, LoopData>()
    for (const loop of [...publicLoops, ...hotLoops, ...bestLoops, ...likedLoops]) {
      if (loop.artistId !== artistId) continue
      if (!loop.isPublic) continue
      byId.set(loop.id, loop)
    }
    const loops = Array.from(byId.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    const artistName = (loops[0]?.artist ?? artistNameFromPathname(browsePathname)) || artistId
    return { artistId, artistName, loops }
  }, [bestLoops, browsePathname, hotLoops, likedLoops, publicLoops, routeArtistId, sessionData, tab])

  const content = useMemo(() => {
    if (tab === 'new') {
      const loops = isNewLoading && !hasFetchedPublicLoops ? [] : publicLoops
      return <BrowseList loops={loops} emptyLabel="No new loops yet." isLoading={isNewLoading} />
    }
    if (tab === 'hot') {
      return <BrowseList loops={hotLoops} emptyLabel="No hot loops yet." isLoading={isHotLoading} />
    }
    if (tab === 'best') {
      return <BrowseList loops={bestLoops} emptyLabel="No best loops yet." isLoading={isBestLoading} />
    }
    if (tab === 'artist') {
      const artistName = artistView?.artistName ?? ''
      const loops = artistView?.loops ?? []
      const showSpinner = loops.length === 0 && isArtistLoading
      if (!artistName && !sessionData) {
        return (
          <div className="mx-auto px-6 py-12">
            <div className="border-2 border-orange-600 bg-black rounded-lg p-6 max-w-md mx-auto">
              <AuthForm api={api} onSessionData={setSessionData} />
            </div>
          </div>
        )
      }
      if (showSpinner) {
        return (
          <div className="flex items-center justify-center py-20">
            <RadialGradient>
              <SpinnerSmall />
            </RadialGradient>
          </div>
        )
      }
      return (
        <>
          <div className="mb-8 text-center">
            <div className="flex flex-col items-center font-[Turret_Road] font-bold">
              <span className="bg-gradient-to-br from-orange-400 to-red-600 bg-clip-text text-transparent text-4xl">
                {artistName}
              </span>
            </div>
          </div>
          <BrowseList loops={loops} emptyLabel="No loops yet." />
        </>
      )
    }
    if (!sessionData) {
      return (
        <div className="mx-auto px-6 py-12">
          <div className="border-2 border-orange-600 bg-black rounded-lg p-6 max-w-md mx-auto">
            <AuthForm api={api} onSessionData={setSessionData} />
          </div>
        </div>
      )
    }
    return <BrowseList loops={likedLoops} emptyLabel="No liked loops yet." isLoading={isLikedLoading} />
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
    hotLoops,
    publicLoops,
    sessionData,
    setSessionData,
    tab,
  ])

  return (
    <div className="min-h-screen text-white relative">
      <RadialGradient>
        <div className="relative min-h-screen">
          <div className="mx-auto px-6 py-12 min-h-screen flex flex-col">
            <div className="text-center mb-12">
              <Link to="/">
                <Logo text="loopmaster" size="4em" />
              </Link>
            </div>

            <div className="flex flex-row justify-center gap-2 mb-12">
              <Link
                to="/browse"
                className={`px-6 py-3 font-semibold text-sm flex items-center justify-center gap-2 rounded-lg ${
                  tab === 'new'
                    ? 'bg-gradient-to-br from-orange-400 to-red-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border-2 border-neutral-800 hover:border-orange-600'
                }`}
              >
                <TimerIcon weight="regular" size={18} />
                <span>New</span>
              </Link>
              <Link
                to="/browse/hot"
                className={`px-6 py-3 font-semibold text-sm flex items-center justify-center gap-2 rounded-lg ${
                  tab === 'hot'
                    ? 'bg-gradient-to-br from-orange-400 to-red-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border-2 border-neutral-800 hover:border-orange-600'
                }`}
              >
                <FireSimpleIcon weight="regular" size={18} />
                <span>Hot</span>
              </Link>
              <Link
                to="/browse/best"
                className={`px-6 py-3 font-semibold text-sm flex items-center justify-center gap-2 rounded-lg ${
                  tab === 'best'
                    ? 'bg-gradient-to-br from-orange-400 to-red-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border-2 border-neutral-800 hover:border-orange-600'
                }`}
              >
                <StarIcon weight="regular" size={18} />
                <span>Best</span>
              </Link>
            </div>

            <div className="flex-1">
              {content}
            </div>
          </div>
        </div>
      </RadialGradient>
    </div>
  )
}
