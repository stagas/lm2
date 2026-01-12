import { ChatIcon, CodeIcon, HeartIcon, PauseIcon, PlayIcon, RepeatIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { LoopData } from '../../../deno/types.ts'
import { useAppStore } from '../../app/store.ts'
import { SpinnerLarge, SpinnerSmall } from '../../components/Spinner.tsx'
import { useEngineDspStore, useEngineRuntimeStore } from '../store.ts'
import { EditorWithTimeline } from './EditorWithTimeline.tsx'
import { Link } from './router.tsx'
import { toSlug } from './util.ts'

const ITEMS_PER_PAGE = 5

function formatAge(timestamp: number | undefined) {
  if (!timestamp) return ''
  const delta = Math.max(0, Date.now() - timestamp)
  const min = Math.floor(delta / 60000)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 14) return `${day}d`
  const wk = Math.floor(day / 7)
  return `${wk}w`
}

export function BrowseList(
  { loops, emptyLabel, isLoading }: { loops: LoopData[]; emptyLabel: string; isLoading?: boolean },
) {
  const sessionData = useAppStore(state => state.sessionData)
  const toggleLike = useAppStore(state => state.toggleLike)
  const prefetchPublicLoopCodes = useAppStore(state => state.prefetchPublicLoopCodes)
  const publicLoopCodeCache = useAppStore(state => state.publicLoopCodeCache)
  const playLoop = useEngineDspStore(state => state.playLoop)
  const pause = useEngineRuntimeStore(state => state.pause)
  const playbackState = useEngineRuntimeStore(state => state.playbackState)
  const playingLoopId = useEngineRuntimeStore(state => state.playingLoopId)
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE)
  const [loadingCodes, setLoadingCodes] = useState<Set<string>>(new Set())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const loadingCodesRef = useRef<Set<string>>(new Set())

  const userId = sessionData?.user.id ?? null
  const likedLoopIds = useMemo(() => (sessionData?.likedLoopIds ?? []), [sessionData])
  const likedIds = useMemo(() => new Set(likedLoopIds), [likedLoopIds])

  const visibleLoops = useMemo(() => loops.slice(0, visibleCount), [loops, visibleCount])
  const hasMore = visibleCount < loops.length

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE)
  }, [loops.length])

  useEffect(() => {
    loadingCodesRef.current = loadingCodes
  }, [loadingCodes])

  useEffect(() => {
    const loadCodes = async () => {
      const currentCache = publicLoopCodeCache
      const currentLoading = loadingCodesRef.current
      const toLoad = visibleLoops.filter(l => !currentCache[l.id] && !currentLoading.has(l.id))
      if (toLoad.length === 0) return

      const ids = toLoad.map(l => l.id)
      setLoadingCodes(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.add(id))
        return next
      })

      try {
        await prefetchPublicLoopCodes(ids)
      }
      catch (err) {
        console.error('Failed to prefetch loop codes:', err)
      }
      finally {
        setLoadingCodes(prev => {
          const next = new Set(prev)
          ids.forEach(id => next.delete(id))
          return next
        })
      }
    }

    void loadCodes()
  }, [visibleLoops, publicLoopCodeCache, prefetchPublicLoopCodes])

  useEffect(() => {
    if (!hasMore) return
    if (!loadMoreRef.current) return

    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    observerRef.current = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setVisibleCount(prev => Math.min(prev + ITEMS_PER_PAGE, loops.length))
        }
      }
    }, { rootMargin: '200px' })

    observerRef.current.observe(loadMoreRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [hasMore, loops.length])

  if (loops.length === 0) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-40">
          <SpinnerLarge />
        </div>
      )
    }
    return (
      <div className="text-center py-20 text-neutral-400 text-lg">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 w-[1000px]">
      {visibleLoops.map((loop, idx) => {
        const isLiked = likedIds.has(loop.id)
        const canLike = userId != null && loop.artistId !== userId
        const code = publicLoopCodeCache[loop.id] ?? ''
        const isLoadingCode = loadingCodes.has(loop.id)

        const editorId = `browse-loop-${loop.id}`
        const loopId = `docs:${editorId}`
        const isPlaying = playingLoopId === loopId && playbackState === 'running'
        const isActive = playingLoopId === loopId

        const handlePlay = async () => {
          if (isPlaying) {
            pause()
            return
          }
          if (!code) return
          // When resuming a paused loop, route through playLoop() so edits are applied
          if (isActive && playbackState !== 'running') {
            void playLoop(loopId, code, undefined)
            return
          }
          void playLoop(loopId, code, 0)
        }

        return (
          <div
            key={loop.id}
            className="flex flex-col gap-4 h-[80dvh] border-2 border-orange-600 bg-black rounded-lg p-6 hover:border-yellow-400"
          >
            <div className="flex flex-row items-center gap-4">
              <button
                className={`flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-lg text-white ${
                  code
                    ? 'bg-gradient-to-br from-orange-400 to-red-600 hover:from-orange-500 hover:to-red-700'
                    : 'bg-neutral-900 opacity-50 cursor-not-allowed'
                }`}
                disabled={!code}
                onClick={handlePlay}
                aria-label={isPlaying ? 'Stop' : 'Play'}
                title={isPlaying ? 'Stop' : code ? 'Play' : 'Loading...'}
              >
                {isPlaying ? <PauseIcon weight="fill" size={24} /> : <PlayIcon weight="fill" size={24} />}
              </button>
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex flex-row items-center gap-2 flex-wrap">
                  <Link
                    to={`/browse/artist/${loop.artistId}/${toSlug(loop.artist)}`}
                    className="text-orange-600 hover:text-yellow-400 font-semibold text-lg"
                  >
                    {loop.artist}
                  </Link>
                  <span className="text-neutral-500">-</span>
                  <Link
                    to={`/browse/loop/${loop.id}`}
                    className="text-white hover:text-orange-400 font-semibold text-lg"
                  >
                    {loop.title}
                  </Link>
                </div>
                <div className="flex flex-row items-center gap-4 text-sm text-neutral-400">
                  <button
                    className={`flex flex-row items-center gap-1 ${
                      canLike ? 'hover:text-white cursor-pointer' : 'cursor-default'
                    }`}
                    onClick={e => {
                      e.preventDefault()
                      if (canLike) void toggleLike(loop.id)
                    }}
                  >
                    <HeartIcon weight={isLiked ? 'fill' : 'regular'} size={18} />
                    <span>{loop.likesCount}</span>
                  </button>
                  <Link
                    to={`/browse/loop/${loop.id}`}
                    className="flex flex-row items-center gap-1 hover:text-white"
                  >
                    <ChatIcon size={18} />
                    <span>{loop.commentsCount}</span>
                  </Link>
                  <Link
                    to={`/browse/loop/${loop.id}`}
                    className="flex flex-row items-center gap-1 hover:text-white"
                  >
                    <RepeatIcon size={18} />
                    <span>{loop.remixesCount}</span>
                  </Link>
                  <span>{formatAge(loop.timestamp)}</span>
                </div>
              </div>
            </div>
            {isLoadingCode
              ? (
                <div className="h-full flex items-center justify-center py-12">
                  <SpinnerLarge />
                </div>
              )
              : code
              ? <EditorWithTimeline loopId={loopId} code={code} />
              : null}
          </div>
        )
      })}
      {hasMore && (
        <div ref={loadMoreRef} className="flex items-center justify-center py-8">
          <SpinnerSmall />
        </div>
      )}
      {!hasMore && loops.length > 0 && (
        <div className="flex items-center justify-center py-8">
          <CodeIcon size={24} className="text-neutral-600" />
        </div>
      )}
    </div>
  )
}
