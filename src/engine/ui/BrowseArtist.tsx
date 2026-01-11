import { ArrowLeftIcon } from '@phosphor-icons/react'
import { useMemo } from 'preact/hooks'
import type { LoopData } from '../../../deno/types.ts'
import { useAppStore } from '../../app/store.ts'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { SpinnerSmall } from '../../components/Spinner.tsx'
import { BrowseList } from './BrowseList.tsx'
import { Link, useRouter } from './router.tsx'

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

export function BrowseArtist() {
  const { pathname } = useRouter()
  const sessionData = useAppStore(state => state.sessionData)
  const publicLoops = useAppStore(state => state.publicLoopsCache)
  const hotLoops = useAppStore(state => state.hotLoopsCache)
  const bestLoops = useAppStore(state => state.bestLoopsCache)
  const likedLoops = useAppStore(state => state.likedLoopsCache)

  const routeArtistId = useMemo(() => artistIdFromPathname(pathname), [pathname])

  const artistView = useMemo(() => {
    const artistId = routeArtistId ?? sessionData?.user.id ?? null
    if (!artistId) return { artistId: null, artistName: '', loops: [] as LoopData[] }

    const byId = new Map<string, LoopData>()
    for (const loop of [...publicLoops, ...hotLoops, ...bestLoops, ...likedLoops]) {
      if (loop.artistId !== artistId) continue
      if (!loop.isPublic) continue
      byId.set(loop.id, loop)
    }
    const loops = Array.from(byId.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    const artistName = (loops[0]?.artist ?? artistNameFromPathname(pathname)) || artistId
    return { artistId, artistName, loops }
  }, [bestLoops, hotLoops, likedLoops, pathname, publicLoops, routeArtistId, sessionData])

  if (!routeArtistId) {
    return (
      <div className="min-h-screen bg-black text-white relative">
        <RadialGradient>
          <div className="mx-auto px-6 py-12 text-center">
            <p className="text-neutral-400 text-lg">Artist not found</p>
            <Link to="/browse" className="text-orange-600 hover:text-yellow-400 mt-4 inline-block">
              ← Back to Browse
            </Link>
          </div>
        </RadialGradient>
      </div>
    )
  }

  if (!artistView.artistId) {
    return (
      <div className="min-h-screen bg-black text-white relative">
        <RadialGradient>
          <div className="mx-auto px-6 py-12">
            <div className="flex items-center justify-center py-20">
              <RadialGradient>
                <SpinnerSmall />
              </RadialGradient>
            </div>
          </div>
        </RadialGradient>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white relative">
      <RadialGradient>
        <div className="relative min-h-screen">
          <div className="mx-auto px-6 py-12">
            <div className="mb-8">
              <Link to="/browse" className="inline-flex items-center gap-2 text-orange-600 hover:text-yellow-400 mb-6">
                <ArrowLeftIcon size={20} />
                <span>Back to Browse</span>
              </Link>
            </div>
            <div className="mb-8 text-center">
              <div className="flex flex-col items-center font-[Turret_Road] font-bold">
                <span className="bg-gradient-to-br from-orange-400 to-red-600 bg-clip-text text-transparent text-4xl">
                  {artistView.artistName}
                </span>
              </div>
            </div>
            <BrowseList loops={artistView.loops} emptyLabel="No loops yet." />
          </div>
        </div>
      </RadialGradient>
    </div>
  )
}
