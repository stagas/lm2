import { ChatIcon, CircleNotchIcon, HeartIcon, PlayIcon, TrashIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MouseButtons } from 'utils/mouse-buttons'
import type { CommentData, LoopData } from '../../../deno/types.ts'
import { useAppStore } from '../../app/store.ts'
import { useEngineDspStore, useEngineRuntimeStore, useEngineUiStore } from '../store.ts'
import { PauseGradientIcon, PlayGradientIcon } from './Icons.tsx'
import { useRestartLoop } from './useRestartLoop.tsx'

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

function CommentsPanel(
  {
    loopOwnerId,
    userId,
    comments,
    isLoading,
    draft,
    setDraft,
    isPosting,
    onSubmit,
    deletingCommentId,
    onDelete,
  }: {
    loopOwnerId: string
    userId: string | null
    comments: CommentData[]
    isLoading: boolean
    draft: string
    setDraft: (draft: string) => void
    isPosting: boolean
    onSubmit: () => void
    deletingCommentId: string | null
    onDelete: (comment: CommentData) => void
  },
) {
  const canComment = userId != null
  const isOwner = userId != null && loopOwnerId === userId
  return (
    <div className="px-3 py-2 border-b border-neutral-700 bg-neutral-950">
      {isLoading && (
        <div className="flex flex-row items-center gap-2 text-neutral-500 text-xs pb-2">
          <CircleNotchIcon size={16} className="animate-spin" />
          <span>Loading comments…</span>
        </div>
      )}

      {comments.length === 0
        ? (isLoading ? null : <div className="text-xs text-neutral-500">No comments yet.</div>)
        : (
          <div className="flex flex-col gap-2">
            {comments.map(c => {
              const canDelete = userId != null && (isOwner || c.author.id === userId)
              return (
                <div key={c.id} className="flex flex-row items-start gap-2">
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="text-xs text-neutral-400 flex flex-row items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-neutral-200 font-semibold">{c.author.name}</span>{' '}
                        <span className="text-neutral-600">{formatAge(c.timestamp)}</span>
                      </div>
                      {canDelete && (
                        <button
                          className="text-neutral-600 hover:text-neutral-200 disabled:text-neutral-800"
                          title="Delete comment"
                          disabled={deletingCommentId === c.id}
                          onPointerDown={e => {
                            e.preventDefault()
                            e.stopPropagation()
                            onDelete(c)
                          }}
                        >
                          {deletingCommentId === c.id
                            ? <CircleNotchIcon size={16} className="animate-spin" />
                            : <TrashIcon weight="regular" size={16} />}
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-neutral-200 whitespace-pre-wrap">{c.content}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      <div className="pt-2">
        {!canComment
          ? <div className="text-xs text-neutral-600">Sign in to leave a comment.</div>
          : (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                placeholder="Leave a comment…"
                className="w-full text-xs bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1.5 text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
                rows={3}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  if (!e.ctrlKey && !e.metaKey) return
                  e.preventDefault()
                  onSubmit()
                }}
              />
              <div className="flex flex-row items-center justify-between">
                <div className="text-[11px] text-neutral-600">Ctrl+Enter to send</div>
                <button
                  className="text-xs px-2 py-1 rounded-md bg-neutral-200 text-neutral-950 hover:bg-white disabled:bg-neutral-600 disabled:text-neutral-900"
                  disabled={isPosting || draft.trim().length === 0}
                  onPointerDown={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    onSubmit()
                  }}
                >
                  {isPosting
                    ? (
                      <span className="inline-flex flex-row items-center gap-1">
                        <CircleNotchIcon size={14} className="animate-spin" />
                        Sending
                      </span>
                    )
                    : 'Send'}
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}

function BrowseItem(
  {
    loop,
    isLiked,
    canLike,
    onToggleLike,
    userId,
  }: {
    loop: LoopData
    isLiked: boolean
    canLike: boolean
    onToggleLike: () => void
    userId: string | null
  },
) {
  const restartLoop = useRestartLoop()
  const playLoop = useEngineDspStore(state => state.playLoop)
  const pause = useEngineRuntimeStore(state => state.pause)
  const stop = useEngineRuntimeStore(state => state.stop)
  const playbackState = useEngineRuntimeStore(state => state.playbackState)
  const playingLoopId = useEngineRuntimeStore(state => state.playingLoopId)
  const setViewSampleCount = useEngineUiStore(state => state.setViewSampleCount)
  const globalSampleCount = useEngineRuntimeStore(state => state.globalSampleCount)
  const getPublicLoopCode = useAppStore(state => state.getPublicLoopCode)
  const selectedLoopId = useAppStore(state => state.selectedLoopId)
  const setSelectedLoopId = useAppStore(state => state.setSelectedLoopId)
  const getLoopComments = useAppStore(state => state.getLoopComments)
  const createLoopComment = useAppStore(state => state.createLoopComment)
  const deleteLoopComment = useAppStore(state => state.deleteLoopComment)
  const cachedComments = useAppStore(state => state.loopCommentsCache[loop.id])

  const [isCommentsOpen, setIsCommentsOpen] = useState(false)
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const [draftComment, setDraftComment] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)

  const isLive = playbackState === 'running' && playingLoopId === loop.id
  const isActive = playingLoopId === loop.id
  const isPlaying = playbackState === 'running'

  const handleOpen = () => {
    setSelectedLoopId(loop.id)
  }

  const handleTogglePlay = (e: React.PointerEvent<HTMLDivElement>) => {
    const isRight = (e.buttons & MouseButtons.Right) !== 0
    const isRestart = ((e.buttons & MouseButtons.Middle) !== 0) || e.ctrlKey

    if (isRight) {
      handleOpen()
      if (isActive) {
        setViewSampleCount(loop.id, 0)
        stop()
        return
      }
      if (playingLoopId && isPlaying && globalSampleCount) {
        const curr = Math.max(0, Atomics.load(globalSampleCount, 0))
        setViewSampleCount(playingLoopId, curr)
        pause()
      }
      setViewSampleCount(loop.id, 0)
      return
    }

    if (isRestart) {
      if (isActive) {
        void restartLoop()
        if (playbackState !== 'running') {
          void (async () => {
            setSelectedLoopId(loop.id)
            const code = await getPublicLoopCode(loop.id)
            await playLoop(loop.id, code)
          })()
        }
        return
      }
      setViewSampleCount(loop.id, 0)
      void (async () => {
        setSelectedLoopId(loop.id)
        const code = await getPublicLoopCode(loop.id)
        await playLoop(loop.id, code)
      })()
      return
    }

    if (isActive && playbackState === 'running') {
      pause()
      return
    }

    void (async () => {
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

  const handleSubmitComment = () => {
    if (userId == null) return
    const content = draftComment.trim()
    if (!content) return
    if (isPosting) return
    setIsPosting(true)
    void createLoopComment(loop.id, content)
      .then(() => setDraftComment(''))
      .finally(() => setIsPosting(false))
  }

  const handleDeleteComment = (comment: CommentData) => {
    if (userId == null) return
    if (deletingCommentId) return
    setDeletingCommentId(comment.id)
    void deleteLoopComment(loop.id, comment.id, comment.timestamp)
      .finally(() => setDeletingCommentId(null))
  }

  const heartWeight = isLiked ? 'fill' : 'regular'
  const likeClass = canLike
    ? 'cursor-pointer hover:text-white'
    : 'cursor-default'
  const isSelected = selectedLoopId === loop.id

  return (
    <>
      <div
        data-loop-id={loop.id}
        className={`flex flex-row px-3 py-2 border-b border-neutral-700 hover:bg-neutral-900 gap-2 justify-between ${
          isSelected ? 'bg-neutral-900' : ''
        }`}
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
          </div>
        </div>
        {isLive
          ? (
            <div
              className="flex flex-col items-center justify-center cursor-pointer"
              onContextMenu={e => e.preventDefault()}
              onPointerDown={e => {
                e.stopPropagation()
                handleTogglePlay(e)
              }}
            >
              <PauseGradientIcon size={24} />
            </div>
          )
          : (
            <div
              className="flex flex-col items-center justify-center group cursor-pointer"
              onContextMenu={e => e.preventDefault()}
              onPointerDown={e => {
                e.stopPropagation()
                handleTogglePlay(e)
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
      {isCommentsOpen && (
        <CommentsPanel
          loopOwnerId={loop.artistId}
          userId={userId}
          comments={cachedComments ?? []}
          isLoading={isCommentsLoading && cachedComments == null}
          draft={draftComment}
          setDraft={setDraftComment}
          isPosting={isPosting}
          onSubmit={handleSubmitComment}
          deletingCommentId={deletingCommentId}
          onDelete={handleDeleteComment}
        />
      )}
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
          userId={userId}
          onToggleLike={() => void toggleLike(loop.id)}
        />
      ))}
    </div>
  )
}
