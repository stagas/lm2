import { ArrowLeftIcon, ChatIcon, HeartIcon, PauseIcon, PlayIcon, RepeatIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { useAppStore } from '../../app/store.ts'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { SpinnerSmall } from '../../components/Spinner.tsx'
import { useEngineDspStore, useEngineRuntimeStore } from '../store.ts'
import { EditorWithTimeline } from './EditorWithTimeline.tsx'
import { Link, useRouter } from './router.tsx'
import { toSlug } from './util.ts'

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

export function BrowseLoop() {
  const { pathname, navigate } = useRouter()
  const sessionData = useAppStore(state => state.sessionData)
  const toggleLike = useAppStore(state => state.toggleLike)
  const getPublicLoopCode = useAppStore(state => state.getPublicLoopCode)
  const getLoopComments = useAppStore(state => state.getLoopComments)
  const getLoopRemixes = useAppStore(state => state.getLoopRemixes)
  const createLoopComment = useAppStore(state => state.createLoopComment)
  const deleteLoopComment = useAppStore(state => state.deleteLoopComment)
  const playLoop = useEngineDspStore(state => state.playLoop)
  const pause = useEngineRuntimeStore(state => state.pause)
  const playbackState = useEngineRuntimeStore(state => state.playbackState)
  const playingLoopId = useEngineRuntimeStore(state => state.playingLoopId)
  const cachedComments = useAppStore(state => {
    const loopId = pathname.match(/^\/browse\/loop\/([^/]+)$/)?.[1]
    return loopId ? state.loopCommentsCache[loopId] : undefined
  })
  const cachedRemixes = useAppStore(state => {
    const loopId = pathname.match(/^\/browse\/loop\/([^/]+)$/)?.[1]
    return loopId ? state.loopRemixesCache[loopId] : undefined
  })

  const loopId = useMemo(() => {
    const match = pathname.match(/^\/browse\/loop\/([^/]+)$/)
    return match ? match[1] : null
  }, [pathname])

  const publicLoopsCache = useAppStore(state => state.publicLoopsCache)
  const hotLoopsCache = useAppStore(state => state.hotLoopsCache)
  const bestLoopsCache = useAppStore(state => state.bestLoopsCache)
  const likedLoopsCache = useAppStore(state => state.likedLoopsCache)

  const loop = useMemo(() => {
    if (!loopId) return null
    return publicLoopsCache.find(l => l.id === loopId)
      ?? hotLoopsCache.find(l => l.id === loopId)
      ?? bestLoopsCache.find(l => l.id === loopId)
      ?? likedLoopsCache.find(l => l.id === loopId)
      ?? null
  }, [loopId, publicLoopsCache, hotLoopsCache, bestLoopsCache, likedLoopsCache])

  const remixOf = useMemo(() => {
    if (!loop?.remixOfId) return null
    return publicLoopsCache.find(l => l.id === loop.remixOfId)
      ?? hotLoopsCache.find(l => l.id === loop.remixOfId)
      ?? bestLoopsCache.find(l => l.id === loop.remixOfId)
      ?? likedLoopsCache.find(l => l.id === loop.remixOfId)
      ?? null
  }, [loop?.remixOfId, publicLoopsCache, hotLoopsCache, bestLoopsCache, likedLoopsCache])

  const [code, setCode] = useState<string>('')
  const [isLoadingCode, setIsLoadingCode] = useState(true)
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const [isRemixesOpen, setIsRemixesOpen] = useState(false)
  const [isRemixesLoading, setIsRemixesLoading] = useState(false)
  const [draftComment, setDraftComment] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)

  const userId = sessionData?.user.id ?? null
  const likedLoopIds = useMemo(() => (sessionData?.likedLoopIds ?? []), [sessionData])
  const isLiked = loop ? likedLoopIds.includes(loop.id) : false
  const canLike = userId != null && loop?.artistId !== userId

  const editorId = loopId ? `browse-loop-${loopId}` : null
  const editorLoopId = editorId ? `docs:${editorId}` : null
  const isPlaying = editorLoopId ? playingLoopId === editorLoopId && playbackState === 'running' : false
  const isActive = editorLoopId ? playingLoopId === editorLoopId : false

  const handlePlay = async () => {
    if (!loopId || !code) return
    if (isPlaying) {
      pause()
      return
    }
    // When resuming a paused loop, route through playLoop() so edits are applied
    if (isActive && playbackState !== 'running') {
      void playLoop(editorLoopId!, code, undefined)
      return
    }
    void playLoop(editorLoopId!, code, 0)
  }

  useEffect(() => {
    if (!loopId) return
    setIsLoadingCode(true)
    void getPublicLoopCode(loopId)
      .then(c => setCode(c))
      .catch(err => {
        console.error('Failed to load loop code:', err)
        setCode('')
      })
      .finally(() => setIsLoadingCode(false))
  }, [loopId, getPublicLoopCode])

  useEffect(() => {
    if (cachedComments != null) return
    setIsCommentsLoading(true)
    if (!loopId) return
    void getLoopComments(loopId).finally(() => setIsCommentsLoading(false))
  }, [cachedComments, loopId, getLoopComments])

  useEffect(() => {
    if (!isRemixesOpen) return
    if (cachedRemixes != null) return
    setIsRemixesLoading(true)
    if (!loopId) return
    void getLoopRemixes(loopId).finally(() => setIsRemixesLoading(false))
  }, [isRemixesOpen, cachedRemixes, loopId, getLoopRemixes])

  const handleSubmitComment = () => {
    if (userId == null) return
    if (!loopId) return
    const content = draftComment.trim()
    if (!content) return
    if (isPosting) return
    setIsPosting(true)
    void createLoopComment(loopId, content)
      .then(() => setDraftComment(''))
      .finally(() => setIsPosting(false))
  }

  const handleDeleteComment = (comment: any) => {
    if (userId == null) return
    if (!loopId) return
    if (deletingCommentId) return
    if (!confirm(`Are you sure you want to delete this comment?`)) return
    setDeletingCommentId(comment.id)
    void deleteLoopComment(loopId, comment.id, comment.timestamp)
      .finally(() => setDeletingCommentId(null))
  }

  if (!loopId) {
    return (
      <div className="min-h-screen bg-black text-white relative">
        <RadialGradient>
          <div className="mx-auto px-6 py-12 text-center">
            <p className="text-neutral-400 text-lg">Loop not found</p>
            <Link to="/browse" className="text-orange-600 hover:text-yellow-400 mt-4 inline-block">
              ← Back to Browse
            </Link>
          </div>
        </RadialGradient>
      </div>
    )
  }

  if (!loop) {
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
            <div className="w-[1000px] mx-auto">
              <div className="mb-8">
                <Link to="/browse"
                  className="inline-flex items-center gap-2 text-orange-600 hover:text-yellow-400 mb-6"
                >
                  <ArrowLeftIcon size={20} />
                  <span>Back to Browse</span>
                </Link>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-row items-center gap-4">
                    {code && (
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
                    )}
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                      <div className="flex flex-row items-center gap-2 flex-wrap">
                        <Link
                          to={`/browse/artist/${loop.artistId}/${toSlug(loop.artist)}`}
                          className="text-orange-600 hover:text-yellow-400 font-semibold text-2xl"
                        >
                          {loop.artist}
                        </Link>
                        <span className="text-neutral-500">-</span>
                        <span className="text-white font-semibold text-2xl">{loop.title}</span>
                      </div>
                      {remixOf && (
                        <div className="flex flex-row text-sm text-neutral-500 font-normal items-center gap-1">
                          <span>remix of:</span>
                          <Link
                            to={`/browse/loop/${remixOf.id}`}
                            className="hover:text-orange-500 hover:font-light"
                          >
                            {remixOf.artist} - {remixOf.title}
                          </Link>
                        </div>
                      )}
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
                          <HeartIcon weight={isLiked ? 'fill' : 'regular'} size={20} />
                          <span>{loop.likesCount}</span>
                        </button>
                        <a
                          href="#comments"
                          className="flex flex-row items-center gap-1 hover:text-white cursor-pointer"
                        >
                          <ChatIcon size={20} />
                          <span>{loop.commentsCount}</span>
                        </a>
                        <button
                          className="flex flex-row items-center gap-1 hover:text-white cursor-pointer"
                          onClick={() => setIsRemixesOpen(!isRemixesOpen)}
                        >
                          <RepeatIcon size={20} />
                          <span>{loop.remixesCount}</span>
                        </button>
                        <span>{formatAge(loop.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {isLoadingCode
                ? (
                  <div className="flex items-center justify-center py-20">
                    <RadialGradient>
                      <SpinnerSmall />
                    </RadialGradient>
                  </div>
                )
                : code
                ? (
                  <div className="mb-8 w-full h-[70dvh]">
                    <EditorWithTimeline loopId={editorLoopId!} code={code} />
                  </div>
                )
                : null}

              <div id="comments" className="bg-black rounded-lg p-6 mb-8">
                <h3 className="text-xl font-semibold mb-4 text-white">Comments</h3>
                {isCommentsLoading && cachedComments == null
                  ? (
                    <div className="flex items-center justify-center py-8">
                      <RadialGradient>
                        <SpinnerSmall />
                      </RadialGradient>
                    </div>
                  )
                  : (
                    <div className="flex flex-col gap-4">
                      {(cachedComments ?? []).length === 0
                        ? <div className="text-neutral-500 text-sm">No comments yet.</div>
                        : (
                          (cachedComments ?? []).sort((a, b) => a.timestamp - b.timestamp).map(c => {
                            const canDelete = userId != null && (loop.artistId === userId || c.author.id === userId)
                            return (
                              <div key={c.id}
                                className="flex flex-row items-start gap-3 border-b border-neutral-800 pb-3"
                              >
                                <div className="flex-1 flex flex-col gap-1">
                                  <div className="text-sm text-neutral-400 flex flex-row items-center justify-between gap-2">
                                    <div>
                                      <span className="text-neutral-300 font-semibold">{c.author.name}</span>{' '}
                                      <span className="text-neutral-600">{formatAge(c.timestamp)}</span>
                                    </div>
                                    {canDelete && (
                                      <button
                                        className="text-neutral-600 hover:text-neutral-200 disabled:text-neutral-800"
                                        disabled={deletingCommentId === c.id}
                                        onClick={() => handleDeleteComment(c)}
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                  <div className="text-sm text-neutral-300 whitespace-pre-wrap">{c.content}</div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      {userId
                        ? (
                          <div className="flex flex-col gap-2 pt-4 border-t border-neutral-800">
                            <textarea
                              value={draftComment}
                              placeholder="Leave a comment…"
                              className="w-full text-sm bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-orange-600"
                              rows={3}
                              onChange={e => setDraftComment((e.target as HTMLTextAreaElement).value)}
                              onKeyDown={e => {
                                if (e.key !== 'Enter') return
                                if (!e.ctrlKey && !e.metaKey) return
                                e.preventDefault()
                                handleSubmitComment()
                              }}
                            />
                            <div className="flex flex-row items-center justify-between">
                              <div className="text-xs text-neutral-600">Ctrl+Enter to post</div>
                              {isPosting ? <SpinnerSmall /> : (
                                <button
                                  className="text-sm px-4 py-2 rounded-md bg-gradient-to-br from-orange-400 to-red-600 text-white hover:from-orange-500 hover:to-red-700 disabled:opacity-30"
                                  disabled={draftComment.trim().length === 0}
                                  onClick={handleSubmitComment}
                                >
                                  Post
                                </button>
                              )}
                            </div>
                          </div>
                        )
                        : (
                          <div className="text-sm text-neutral-600 pt-4 border-t border-neutral-800">
                            Sign in to leave a comment.
                          </div>
                        )}
                    </div>
                  )}
              </div>

              {isRemixesOpen && (
                <div className="border-2 border-orange-600 bg-black rounded-lg p-6">
                  <h3 className="text-xl font-semibold mb-4 text-white">Remixes</h3>
                  {isRemixesLoading && cachedRemixes == null
                    ? (
                      <div className="flex items-center justify-center py-8">
                        <RadialGradient>
                          <SpinnerSmall />
                        </RadialGradient>
                      </div>
                    )
                    : (
                      <div className="flex flex-col gap-2">
                        {(cachedRemixes ?? []).length === 0
                          ? <div className="text-neutral-500 text-sm">No remixes yet.</div>
                          : (
                            (cachedRemixes ?? [])
                              .slice()
                              .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
                              .map(r => (
                                <Link
                                  key={r.id}
                                  to={`/browse/loop/${r.id}`}
                                  className="text-left flex flex-row items-start gap-2 border-b border-neutral-800 pb-2 px-2 hover:bg-neutral-900 rounded-md"
                                >
                                  <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                                    <div className="text-sm text-neutral-400 flex flex-row items-center justify-between gap-2">
                                      <div className="min-w-0 truncate">
                                        <span className="text-neutral-300 font-semibold">{r.artist}</span>
                                        <span className="text-neutral-500">-</span>
                                        <span className="text-neutral-400">{r.title}</span>
                                      </div>
                                      <span className="text-neutral-600 shrink-0">{formatAge(r.timestamp)}</span>
                                    </div>
                                  </div>
                                </Link>
                              ))
                          )}
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        </div>
      </RadialGradient>
    </div>
  )
}
