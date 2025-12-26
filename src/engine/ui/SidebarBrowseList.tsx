import { ChatIcon, HeartIcon, PlayIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CommentData, LoopData } from '../../../deno/types.ts'
import { useAppStore } from '../../app/store.ts'
import { useEngineDspStore, useEngineRuntimeStore } from '../store.ts'
import { PauseGradientIcon, PlayGradientIcon } from './Icons.tsx'

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

function CommentsPanel({ comments }: { comments: CommentData[] }) {
  return (
    <div className="px-3 py-2 border-b border-neutral-700 bg-neutral-950">
      {comments.length === 0
        ? <div className="text-xs text-neutral-500">No comments yet.</div>
        : (
          <div className="flex flex-col gap-2">
            {comments.map(c => (
              <div key={c.id} className="flex flex-col gap-0.5">
                <div className="text-xs text-neutral-400">
                  <span className="text-neutral-200 font-semibold">{c.author.name}</span>{' '}
                  <span className="text-neutral-600">{formatAge(c.timestamp)}</span>
                </div>
                <div className="text-xs text-neutral-200 whitespace-pre-wrap">{c.content}</div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

function BrowseItem(
  {
    loop,
    isLiked,
    canLike,
    onToggleLike,
  }: {
    loop: LoopData
    isLiked: boolean
    canLike: boolean
    onToggleLike: () => void
  },
) {
  const playLoop = useEngineDspStore(state => state.playLoop)
  const pause = useEngineRuntimeStore(state => state.pause)
  const playbackState = useEngineRuntimeStore(state => state.playbackState)
  const playingLoopId = useEngineRuntimeStore(state => state.playingLoopId)
  const getPublicLoopCode = useAppStore(state => state.getPublicLoopCode)
  const setSelectedLoopId = useAppStore(state => state.setSelectedLoopId)
  const getLoopComments = useAppStore(state => state.getLoopComments)
  const cachedComments = useAppStore(state => state.loopCommentsCache[loop.id])

  const [isCommentsOpen, setIsCommentsOpen] = useState(false)
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)

  const isLive = playbackState === 'running' && playingLoopId === loop.id

  const handleOpen = () => {
    setSelectedLoopId(loop.id)
  }

  const handleTogglePlay = () => {
    void (async () => {
      if (isLive) {
        pause()
        return
      }
      setSelectedLoopId(loop.id)
      const code = await getPublicLoopCode(loop.id)
      await playLoop(loop.id, code)
    })()
  }

  const handleToggleComments = () => {
    const next = !isCommentsOpen
    setIsCommentsOpen(next)
    if (!next) return
    if (cachedComments != null) return
    setIsCommentsLoading(true)
    void getLoopComments(loop.id).finally(() => setIsCommentsLoading(false))
  }

  const heartWeight = isLiked ? 'fill' : 'regular'
  const likeClass = canLike
    ? 'cursor-pointer hover:text-white'
    : 'cursor-default'

  return (
    <>
      <div
        data-loop-id={loop.id}
        className="flex flex-row px-3 py-2 border-b border-neutral-700 hover:bg-neutral-900 gap-2 justify-between"
        onPointerDown={handleOpen}
      >
        <div className="flex flex-col">
          <div className="flex flex-row gap-2">
            <div className="flex flex-col w-full">
              <span className="text-sm">{loop.artist} - {loop.title}</span>
            </div>
          </div>
          <div className="flex flex-row self-start justify-center gap-2">
            <div
              className={`text-neutral-500 font-[Space_Grotesk] flex flex-row items-center justify-center font-normal text-sm ${likeClass}`}
              onPointerDown={e => {
                e.stopPropagation()
                if (!canLike) return
                onToggleLike()
              }}
            >
              <HeartIcon weight={heartWeight} size={16} />
              <span className="relative top-[1.35px] left-[1px]">{loop.likesCount}</span>
            </div>
            <div
              className="text-neutral-500 font-[Space_Grotesk] flex flex-row items-center justify-center font-normal text-sm hover:text-white cursor-pointer"
              onPointerDown={e => {
                e.stopPropagation()
                handleToggleComments()
              }}
            >
              <ChatIcon size={16} />
              <span className="relative top-[1.35px] left-[1px]">{loop.commentsCount}</span>
            </div>
            <div className="text-neutral-500 font-normal">
              <span className="text-sm">{formatAge(loop.timestamp)}</span>
            </div>
            {isCommentsLoading && <div className="text-xs text-neutral-600">Loading…</div>}
          </div>
        </div>
        {isLive
          ? (
            <div
              className="flex flex-col items-center justify-center cursor-pointer"
              onPointerDown={e => {
                e.stopPropagation()
                handleTogglePlay()
              }}
            >
              <PauseGradientIcon size={24} />
            </div>
          )
          : (
            <div
              className="flex flex-col items-center justify-center group cursor-pointer"
              onPointerDown={e => {
                e.stopPropagation()
                handleTogglePlay()
              }}
            >
              <div className="block group-hover:hidden text-neutral-700">
                <PlayIcon weight="fill" size={24} />
              </div>
              <div className="hidden group-hover:block">
                <PlayGradientIcon size={24} />
              </div>
            </div>
          )}
      </div>
      {isCommentsOpen && <CommentsPanel comments={cachedComments ?? []} />}
    </>
  )
}

export function SidebarBrowseList({ loops, emptyLabel }: { loops: LoopData[]; emptyLabel: string }) {
  const sessionData = useAppStore(state => state.sessionData)
  const toggleLike = useAppStore(state => state.toggleLike)
  const refreshLikedLoops = useAppStore(state => state.refreshLikedLoops)
  const likedLoopsCacheLen = useAppStore(state => state.likedLoopsCache.length)
  const prefetchPublicLoopCodes = useAppStore(state => state.prefetchPublicLoopCodes)
  const publicLoopCodeCache = useAppStore(state => state.publicLoopCodeCache)

  const userId = sessionData?.user.id ?? null
  const likedLoopIds = useMemo(() => (sessionData?.likedLoopIds ?? []), [sessionData])
  const likedIds = useMemo(() => new Set(likedLoopIds), [likedLoopIds])
  const listRef = useRef<HTMLDivElement | null>(null)
  const codeCacheRef = useRef(publicLoopCodeCache)

  useEffect(() => {
    codeCacheRef.current = publicLoopCodeCache
  }, [publicLoopCodeCache])

  useEffect(() => {
    if (!sessionData) return
    if (likedLoopIds.length === 0) return
    if (likedLoopsCacheLen > 0) return
    void refreshLikedLoops()
  }, [likedLoopIds.length, likedLoopsCacheLen, refreshLikedLoops, sessionData])

  useEffect(() => {
    const root = listRef.current
    if (!root) return

    const pending = new Set<string>()
    let scheduled = false

    const flush = () => {
      scheduled = false
      const cache = codeCacheRef.current
      const ids = Array.from(pending).filter(id => cache[id] == null)
      pending.clear()
      if (ids.length === 0) return
      void prefetchPublicLoopCodes(ids)
    }

    const schedule = () => {
      if (scheduled) return
      scheduled = true
      queueMicrotask(flush)
    }

    const obs = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const id = (e.target as HTMLElement).dataset.loopId
        if (!id) continue
        pending.add(id)
      }
      schedule()
    })

    const nodes = root.querySelectorAll<HTMLElement>('[data-loop-id]')
    for (const n of nodes) obs.observe(n)
    return () => obs.disconnect()
  }, [loops, prefetchPublicLoopCodes])

  if (loops.length === 0) {
    return <div className="px-3 py-2 text-xs text-neutral-500">{emptyLabel}</div>
  }

  return (
    <div ref={listRef} className="flex flex-col">
      {loops.map(loop => (
        <BrowseItem
          key={loop.id}
          loop={loop}
          isLiked={likedIds.has(loop.id)}
          canLike={userId != null && loop.artistId !== userId}
          onToggleLike={() => void toggleLike(loop.id)}
        />
      ))}
    </div>
  )
}
