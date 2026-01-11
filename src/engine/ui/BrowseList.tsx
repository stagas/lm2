import { ChatIcon, CodeIcon, HeartIcon, PlayIcon, RepeatIcon, StopIcon, UserIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { LoopData } from '../../../deno/types.ts'
import { useAppStore } from '../../app/store.ts'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { SpinnerSmall } from '../../components/Spinner.tsx'
import { useEngineDspStore, useEngineRuntimeStore } from '../store.ts'
import { InlineEditor } from './docs/InlineEditor.tsx'
import { Link, useRouter } from './router.tsx'
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
  const getPublicLoopCode = useAppStore(state => state.getPublicLoopCode)
  const playLoop = useEngineDspStore(state => state.playLoop)
  const stop = useEngineRuntimeStore(state => state.stop)
  const playbackState = useEngineRuntimeStore(state => state.playbackState)
  const playingLoopId = useEngineRuntimeStore(state => state.playingLoopId)
  const [loopCodes, setLoopCodes] = useState<Record<string, string>>({})
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE)
  const [loadingCodes, setLoadingCodes] = useState<Set<string>>(new Set())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const loopCodesRef = useRef<Record<string, string>>({})
  const loadingCodesRef = useRef<Set<string>>(new Set())
  const { navigate } = useRouter()

  const userId = sessionData?.user.id ?? null
  const likedLoopIds = useMemo(() => (sessionData?.likedLoopIds ?? []), [sessionData])
  const likedIds = useMemo(() => new Set(likedLoopIds), [likedLoopIds])

  const visibleLoops = useMemo(() => loops.slice(0, visibleCount), [loops, visibleCount])
  const hasMore = visibleCount < loops.length

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE)
  }, [loops.length])

  useEffect(() => {
    loopCodesRef.current = loopCodes
  }, [loopCodes])

  useEffect(() => {
    loadingCodesRef.current = loadingCodes
  }, [loadingCodes])

  useEffect(() => {
    const loadCodes = async () => {
      const currentCodes = loopCodesRef.current
      const currentLoading = loadingCodesRef.current
      const toLoad = visibleLoops.filter(l => !currentCodes[l.id] && !currentLoading.has(l.id))
      if (toLoad.length === 0) return

      setLoadingCodes(prev => {
        const next = new Set(prev)
        toLoad.forEach(l => next.add(l.id))
        return next
      })

      const codes: Record<string, string> = {}
      for (const loop of toLoad) {
        try {
          const code = await getPublicLoopCode(loop.id)
          codes[loop.id] = code
        }
        catch (err) {
          console.error(`Failed to load code for loop ${loop.id}:`, err)
        }
      }

      setLoopCodes(prev => ({ ...prev, ...codes }))
      setLoadingCodes(prev => {
        const next = new Set(prev)
        toLoad.forEach(l => next.delete(l.id))
        return next
      })
    }

    void loadCodes()
  }, [visibleLoops, getPublicLoopCode])

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
        <div className="flex h-full items-center justify-center py-20">
          <RadialGradient>
            <SpinnerSmall />
          </RadialGradient>
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
        const code = loopCodes[loop.id] ?? ''
        const isLoadingCode = loadingCodes.has(loop.id)

        const editorId = `browse-${loop.id}`
        const loopId = `docs:${editorId}`
        const isPlaying = playingLoopId === loopId && playbackState === 'running'
        const isActive = playingLoopId === loopId

        const handlePlay = async () => {
          if (isPlaying) {
            stop()
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
            className="flex flex-col gap-4 border-2 border-orange-600 bg-black rounded-lg p-6 hover:border-yellow-400"
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
                {isPlaying ? <StopIcon weight="fill" size={24} /> : <PlayIcon weight="fill" size={24} />}
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
                <div className="flex items-center justify-center py-12">
                  <RadialGradient>
                    <SpinnerSmall />
                  </RadialGradient>
                </div>
              )
              : code
              ? (
                <div className="h-[400px] w-full">
                  <InlineEditor id={editorId} initialCode={code} autoHeight={false} hidePlayButton={true} />
                </div>
              )
              : null}
          </div>
        )
      })}
      {hasMore && (
        <div ref={loadMoreRef} className="flex items-center justify-center py-8">
          <RadialGradient>
            <SpinnerSmall />
          </RadialGradient>
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
