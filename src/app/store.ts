import { CodeFile, type CodeFileState, type InputState } from 'mini-code'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CommentData, LoopData, SessionData } from '../../deno/types.ts'
import { API } from './api.ts'

type EditorViewState = {
  caret: InputState['caret']
  selection: InputState['selection']
  scrollX: number
  scrollY: number
}

const isLocalId = (id: string) => id.startsWith('local:')

const shouldPersistBuffer = (id: string, snapshot: CodeFileState, base: string) => {
  const isDirty = snapshot.value !== base
  if (isDirty) return true
  if (isLocalId(id) && snapshot.value.length > 0) return true
  return false
}

interface AppState {
  api: API
  sessionState: 'signedOut' | 'signedIn'
  sessionFetchState: 'idle' | 'loading' | 'done'
  sessionData: SessionData | null
  setSessionData: (data: SessionData | null) => void
  setSessionFetchState: (state: 'idle' | 'loading' | 'done') => void
  hasHydrated: boolean
  setHasHydrated: (hasHydrated: boolean) => void
  serverLoopsUserId: string | null
  serverLoopsCache: LoopData[]
  upsertServerLoopCache: (loop: LoopData) => void
  publicLoopsCache: LoopData[]
  likedLoopsCache: LoopData[]
  publicLoopCodeCache: Record<string, string>
  loopCommentsCache: Record<string, CommentData[]>
  refreshPublicLoops: () => Promise<void>
  refreshLikedLoops: () => Promise<void>
  upsertPublicLoopCache: (loop: LoopData) => void
  removePublicLoopCache: (id: string) => void
  toggleLike: (loopId: string) => Promise<void>
  getPublicLoopCode: (loopId: string) => Promise<string>
  getLoopComments: (loopId: string) => Promise<CommentData[]>
  buffers: Record<string, CodeFileState>
  bases: Record<string, { code: string; ts?: number }>
  dirtyById: Record<string, boolean>
  localLoops: LoopData[]
  selectedLoopId: string | null
  isLoopLoading: boolean
  setLoopLoading: (isLoading: boolean) => void
  getCodeFile: (id: string, initialValue: string) => CodeFile
  setLoopBase: (id: string, base: string, ts?: number) => void
  getLoopBase: (id: string, fallback?: string) => string
  addLocalLoop: (loop: LoopData) => void
  updateLocalLoop: (id: string, patch: Partial<LoopData>) => void
  removeLocalLoop: (id: string) => void
  setSelectedLoopId: (id: string | null) => void
  moveBuffer: (fromId: string, toId: string) => void
  dropBuffer: (id: string) => void
}

const codeFiles = new Map<string, CodeFile>()
const codeFileUnsubs = new Map<string, () => void>()
const persistTimers = new Map<string, number>()
const initialValues = new Map<string, string>()

const SESSION_VIEWS_KEY = 'app:views:v1'

const readSessionViews = (): Record<string, EditorViewState> => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem(SESSION_VIEWS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, EditorViewState>
  }
  catch {
    return {}
  }
}

let sessionViews: Record<string, EditorViewState> = readSessionViews()
let sessionViewsTimer: number | null = null

const schedulePersistSessionViews = () => {
  if (typeof window === 'undefined') return
  if (sessionViewsTimer != null) window.clearTimeout(sessionViewsTimer)
  sessionViewsTimer = window.setTimeout(() => {
    sessionViewsTimer = null
    try {
      window.sessionStorage.setItem(SESSION_VIEWS_KEY, JSON.stringify(sessionViews))
    }
    catch {
      // ignore write errors (quota, privacy mode, etc.)
    }
  }, 120)
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      api: new API(async (input, init) => {
        await new Promise(resolve => setTimeout(resolve, 3000))
        const res = await fetch(input, { ...init, credentials: 'include' })
        if (res.status === 401) {
          queueMicrotask(() => get().setSessionData(null))
        }
        return res
      }),
      sessionState: 'signedOut',
      sessionFetchState: 'idle',
      sessionData: null,
      hasHydrated: false,
      setHasHydrated: hasHydrated => set({ hasHydrated }),
      serverLoopsUserId: null,
      serverLoopsCache: [],
      publicLoopsCache: [],
      likedLoopsCache: [],
      publicLoopCodeCache: {},
      loopCommentsCache: {},

      setSessionData: sessionData => {
        if (!sessionData) {
          set({
            sessionState: 'signedOut',
            sessionData: null,
            serverLoopsUserId: null,
            serverLoopsCache: [],
            likedLoopsCache: [],
          })
          return
        }

        const likedLoopIds = Array.isArray((sessionData as unknown as { likedLoopIds?: unknown }).likedLoopIds)
          ? (sessionData as unknown as { likedLoopIds: string[] }).likedLoopIds
          : []
        const nextSessionData: SessionData = { ...sessionData, likedLoopIds }
        set({ sessionState: 'signedIn', sessionData: nextSessionData })

        const prevUserId = get().serverLoopsUserId
        const prevCache = get().serverLoopsCache

        const userId = nextSessionData.user.id
        const prevById = new Map<string, LoopData>(
          prevUserId === userId ? prevCache.map(l => [l.id, l]) : [],
        )

        const merged = nextSessionData.loops.map(loop => {
          const prev = prevById.get(loop.id)
          if (!prev) return loop
          if (loop.code != null) return loop
          if (prev.code == null) return loop
          return { ...loop, code: prev.code }
        })

        set({
          serverLoopsUserId: userId,
          serverLoopsCache: merged,
        })

        for (const loop of merged) {
          if (loop.code != null) {
            get().setLoopBase(loop.id, loop.code, loop.timestamp)
          }
        }
      },

      setSessionFetchState: sessionFetchState => {
        set({ sessionFetchState })
      },

      upsertServerLoopCache: loop => {
        const userId = get().serverLoopsUserId
        const ownId = userId != null && loop.artistId === userId

        set(state => {
          const idx = state.serverLoopsCache.findIndex(l => l.id === loop.id)
          if (idx === -1 && !ownId) return state

          const prev = idx === -1 ? null : state.serverLoopsCache[idx]!
          const nextLoop = (() => {
            if (!prev) return loop
            if (loop.code != null) return { ...prev, ...loop }
            if (prev.code == null) return { ...prev, ...loop }
            return { ...prev, ...loop, code: prev.code }
          })()

          const nextCache = idx === -1
            ? [nextLoop, ...state.serverLoopsCache]
            : state.serverLoopsCache.map((l, i) => i === idx ? nextLoop : l)

          const sessionData = state.sessionData
          if (!sessionData) {
            return {
              serverLoopsCache: nextCache,
              publicLoopsCache: (() => {
                if (!ownId) return state.publicLoopsCache
                if (nextLoop.isPublic) {
                  const idx = state.publicLoopsCache.findIndex(l => l.id === nextLoop.id)
                  const { code: _code, comments: _comments, ...summary } = nextLoop
                  const nextSummary = summary as LoopData
                  return idx === -1
                    ? [nextSummary, ...state.publicLoopsCache]
                    : state.publicLoopsCache.map((l, i) => i === idx ? { ...l, ...nextSummary } : l)
                }
                return state.publicLoopsCache.filter(l => l.id !== nextLoop.id)
              })(),
            } as AppState
          }

          const { code: _, ...sessionLoop } = nextLoop
          const nextSessionLoops = (() => {
            const sidx = sessionData.loops.findIndex(l => l.id === loop.id)
            if (sidx === -1) return ownId ? [sessionLoop, ...sessionData.loops] : sessionData.loops
            return sessionData.loops.map(l => l.id === loop.id ? sessionLoop : l)
          })()

          return {
            serverLoopsCache: nextCache,
            sessionData: { ...sessionData, loops: nextSessionLoops },
            publicLoopsCache: (() => {
              if (!ownId) return state.publicLoopsCache
              if (nextLoop.isPublic) {
                const idx = state.publicLoopsCache.findIndex(l => l.id === nextLoop.id)
                const { code: _code, comments: _comments, ...summary } = nextLoop
                const nextSummary = summary as LoopData
                return idx === -1
                  ? [nextSummary, ...state.publicLoopsCache]
                  : state.publicLoopsCache.map((l, i) => i === idx ? { ...l, ...nextSummary } : l)
              }
              return state.publicLoopsCache.filter(l => l.id !== nextLoop.id)
            })(),
          } as AppState
        })

        if (loop.code != null) {
          get().setLoopBase(loop.id, loop.code, loop.timestamp)
        }
      },

      refreshPublicLoops: async () => {
        const api = get().api
        const loops = await api.fetchPublicLoops()
        set({ publicLoopsCache: loops })
      },

      refreshLikedLoops: async () => {
        const api = get().api
        const loops = await api.fetchLikedLoops()
        set({ likedLoopsCache: loops })
      },

      upsertPublicLoopCache: loop => {
        set(state => {
          const idx = state.publicLoopsCache.findIndex(l => l.id === loop.id)
          const nextLoop = idx === -1 ? loop : { ...state.publicLoopsCache[idx]!, ...loop }
          const next = idx === -1
            ? [nextLoop, ...state.publicLoopsCache]
            : state.publicLoopsCache.map((l, i) => i === idx ? nextLoop : l)
          return { publicLoopsCache: next } as AppState
        })
      },

      removePublicLoopCache: id => {
        set(state => ({ publicLoopsCache: state.publicLoopsCache.filter(l => l.id !== id) }))
      },

      toggleLike: async loopId => {
        const prevSession = get().sessionData
        const wasLiked = prevSession?.likedLoopIds.includes(loopId) ?? false
        const nextSession = await get().api.toggleLike(loopId)
        get().setSessionData(nextSession)
        const isLiked = nextSession.likedLoopIds.includes(loopId)
        const delta = (isLiked ? 1 : 0) - (wasLiked ? 1 : 0)

        if (delta !== 0) {
          set(state => ({
            publicLoopsCache: state.publicLoopsCache.map(l =>
              l.id === loopId ? { ...l, likesCount: Math.max(0, l.likesCount + delta) } : l
            ),
            likedLoopsCache: (() => {
              if (isLiked) {
                const item = state.publicLoopsCache.find(l => l.id === loopId)
                if (!item) return state.likedLoopsCache
                if (state.likedLoopsCache.some(l => l.id === loopId)) return state.likedLoopsCache
                return [item, ...state.likedLoopsCache]
              }
              return state.likedLoopsCache.filter(l => l.id !== loopId)
            })(),
          }))
        }
      },

      getPublicLoopCode: async loopId => {
        const cached = get().publicLoopCodeCache[loopId]
        if (cached != null) return cached
        const data = await get().api.fetchPublicLoopData(loopId)
        const code = data.code ?? ''
        set(state => ({
          publicLoopCodeCache: { ...state.publicLoopCodeCache, [loopId]: code },
          publicLoopsCache: (() => {
            const idx = state.publicLoopsCache.findIndex(l => l.id === loopId)
            if (idx === -1) return state.publicLoopsCache
            const prev = state.publicLoopsCache[idx]!
            const { code: _code, comments: _comments, ...rest } = data
            return state.publicLoopsCache.map((l, i) => i === idx ? { ...prev, ...rest } : l)
          })(),
        }))
        return code
      },

      getLoopComments: async loopId => {
        const cached = get().loopCommentsCache[loopId]
        if (cached != null) return cached
        const comments = await get().api.fetchLoopComments(loopId)
        set(state => ({
          loopCommentsCache: { ...state.loopCommentsCache, [loopId]: comments },
        }))
        return comments
      },

      buffers: {},
      bases: {},
      dirtyById: {},
      localLoops: [],
      selectedLoopId: null,
      isLoopLoading: false,

      getCodeFile: (id, initialValue) => {
        const existing = codeFiles.get(id)
        if (existing) return existing

        initialValues.set(id, initialValue)
        const codeFile = new CodeFile(initialValue)
        const cached = get().buffers[id]
        if (cached) {
          codeFile.setState(cached)
        }
        else {
          const view = sessionViews[id]
          if (view) {
            codeFile.setState({
              inputState: {
                ...codeFile.inputState,
                caret: view.caret,
                selection: view.selection,
              },
              scrollX: view.scrollX,
              scrollY: view.scrollY,
            })
          }
        }

        codeFiles.set(id, codeFile)

        const unsub = codeFile.subscribe(() => {
          const prev = persistTimers.get(id)
          if (prev) window.clearTimeout(prev)
          persistTimers.set(
            id,
            window.setTimeout(() => {
              const snapshot = codeFile.getState()

              sessionViews[id] = {
                caret: snapshot.inputState.caret,
                selection: snapshot.inputState.selection,
                scrollX: snapshot.scrollX,
                scrollY: snapshot.scrollY,
              }
              schedulePersistSessionViews()

              const baseEntry = get().bases[id]
              const initial = initialValues.get(id) ?? ''
              const base = baseEntry?.code ?? initial
              const shouldPersist = shouldPersistBuffer(id, snapshot, base)
              const baseKnown = baseEntry != null || isLocalId(id) || initial.length > 0
              const isDirty = baseKnown ? snapshot.value !== base : false

              set(state => {
                const has = state.buffers[id] != null
                const wasDirty = state.dirtyById[id] === true
                const dirtyChanged = isDirty ? !wasDirty : wasDirty
                if (shouldPersist) {
                  if (!dirtyChanged && has && state.buffers[id] === snapshot) return state
                  return {
                    buffers: {
                      ...state.buffers,
                      [id]: snapshot,
                    },
                    dirtyById: isDirty
                      ? { ...state.dirtyById, [id]: true }
                      : (() => {
                        if (!wasDirty) return state.dirtyById
                        const { [id]: _, ...rest } = state.dirtyById
                        return rest
                      })(),
                  }
                }
                if (!has && !dirtyChanged) return state
                const next: Partial<AppState> = {}
                if (has) {
                  const { [id]: _, ...rest } = state.buffers
                  next.buffers = rest
                }
                if (dirtyChanged) {
                  if (isDirty) {
                    next.dirtyById = { ...state.dirtyById, [id]: true }
                  }
                  else {
                    const { [id]: _, ...rest } = state.dirtyById
                    next.dirtyById = rest
                  }
                }
                return next as AppState
              })
            }, 120),
          )
        })
        codeFileUnsubs.set(id, unsub)

        return codeFile
      },

      setLoopBase: (id: string, base: string, ts?: number) => {
        set(state => {
          if (state.bases[id]?.code === base && state.bases[id]?.ts === ts) return state
          return {
            bases: {
              ...state.bases,
              [id]: { code: base, ts },
            },
          }
        })
        const codeFile = codeFiles.get(id)
        if (codeFile) {
          const snapshot = codeFile.getState()
          const shouldPersist = shouldPersistBuffer(id, snapshot, base)
          set(state => {
            const isDirty = snapshot.value !== base
            const hasDirty = state.dirtyById[id] === true
            const dirtyChanged = isDirty ? !hasDirty : hasDirty
            const hasBuffer = state.buffers[id] != null
            const shouldDropBuffer = !shouldPersist && hasBuffer
            if (!shouldDropBuffer && !dirtyChanged) return state
            const next: Partial<AppState> = {}
            if (shouldDropBuffer) {
              const { [id]: _, ...rest } = state.buffers
              next.buffers = rest
            }
            if (dirtyChanged) {
              if (isDirty) {
                next.dirtyById = { ...state.dirtyById, [id]: true }
              }
              else {
                const { [id]: _, ...rest } = state.dirtyById
                next.dirtyById = rest
              }
            }
            return next as AppState
          })
        }
      },

      getLoopBase: (id: string, fallback = '') => {
        return get().bases[id]?.code ?? fallback
      },

      addLocalLoop: (loop: LoopData) => {
        set(state => {
          if (state.localLoops.some(l => l.id === loop.id)) return state
          return { localLoops: [loop, ...state.localLoops] }
        })
      },

      updateLocalLoop: (id: string, patch: Partial<LoopData>) => {
        set(state => ({
          localLoops: state.localLoops.map(loop => loop.id === id ? { ...loop, ...patch } : loop),
        }))
      },

      removeLocalLoop: (id: string) => {
        set(state => ({ localLoops: state.localLoops.filter(loop => loop.id !== id) }))
      },

      setSelectedLoopId: (id: string | null) => {
        set({ selectedLoopId: id })
      },

      setLoopLoading: isLoopLoading => {
        set({ isLoopLoading })
      },

      moveBuffer: (fromId: string, toId: string) => {
        if (fromId === toId) return

        const movedInitial = initialValues.get(fromId)
        if (movedInitial != null) {
          initialValues.delete(fromId)
          initialValues.set(toId, movedInitial)
        }

        const movedView = sessionViews[fromId]
        if (movedView) {
          delete sessionViews[fromId]
          sessionViews[toId] = movedView
          schedulePersistSessionViews()
        }

        // Move the in-memory CodeFile + its persistence subscription to the new id.
        const codeFile = codeFiles.get(fromId)
        if (codeFile) {
          codeFileUnsubs.get(fromId)?.()
          codeFileUnsubs.delete(fromId)
          const t = persistTimers.get(fromId)
          if (t) window.clearTimeout(t)
          persistTimers.delete(fromId)
          codeFiles.delete(fromId)

          codeFileUnsubs.get(toId)?.()
          codeFileUnsubs.delete(toId)
          const t2 = persistTimers.get(toId)
          if (t2) window.clearTimeout(t2)
          persistTimers.delete(toId)

          codeFiles.set(toId, codeFile)

          const unsub = codeFile.subscribe(() => {
            const prev = persistTimers.get(toId)
            if (prev) window.clearTimeout(prev)
            persistTimers.set(
              toId,
              window.setTimeout(() => {
                const snapshot = codeFile.getState()

                sessionViews[toId] = {
                  caret: snapshot.inputState.caret,
                  selection: snapshot.inputState.selection,
                  scrollX: snapshot.scrollX,
                  scrollY: snapshot.scrollY,
                }
                schedulePersistSessionViews()

                const base = get().bases[toId]?.code ?? initialValues.get(toId) ?? ''
                const shouldPersist = shouldPersistBuffer(toId, snapshot, base)

                set(state => {
                  const has = state.buffers[toId] != null
                  if (shouldPersist) {
                    return {
                      buffers: {
                        ...state.buffers,
                        [toId]: snapshot,
                      },
                    }
                  }
                  if (!has) return state
                  const { [toId]: _, ...rest } = state.buffers
                  return { buffers: rest }
                })
              }, 120),
            )
          })
          codeFileUnsubs.set(toId, unsub)
        }

        set(state => {
          const buffers = { ...state.buffers }
          const bases = { ...state.bases }
          const dirtyById = { ...state.dirtyById }

          const movedBuffer = buffers[fromId]
          if (movedBuffer) {
            delete buffers[fromId]
            buffers[toId] = movedBuffer
          }

          const movedBase = bases[fromId]
          if (movedBase) {
            delete bases[fromId]
            bases[toId] = movedBase
          }

          const movedDirty = dirtyById[fromId]
          if (movedDirty != null) {
            delete dirtyById[fromId]
            dirtyById[toId] = movedDirty
          }

          const selectedLoopId = state.selectedLoopId === fromId ? toId : state.selectedLoopId
          return { buffers, bases, dirtyById, selectedLoopId }
        })
      },

      dropBuffer: (id: string) => {
        codeFileUnsubs.get(id)?.()
        codeFileUnsubs.delete(id)
        codeFiles.delete(id)
        const t = persistTimers.get(id)
        if (t) window.clearTimeout(t)
        persistTimers.delete(id)
        initialValues.delete(id)
        if (sessionViews[id]) {
          delete sessionViews[id]
          schedulePersistSessionViews()
        }
        set(state => {
          const { [id]: _, ...rest } = state.buffers
          const { [id]: __, ...bases } = state.bases
          const { [id]: ___, ...dirtyById } = state.dirtyById
          return { buffers: rest, bases, dirtyById }
        })
      },
    }),
    {
      name: 'app',
      partialize: state => ({
        sessionState: state.sessionState,
        // sessionFetchState is runtime-only
        sessionData: state.sessionData,
        // hasHydrated is runtime-only
        serverLoopsUserId: state.serverLoopsUserId,
        serverLoopsCache: state.serverLoopsCache,
        buffers: state.buffers,
        bases: state.bases,
        dirtyById: state.dirtyById,
        localLoops: state.localLoops,
        selectedLoopId: state.selectedLoopId,
      }),
      version: 11,
      onRehydrateStorage: () => (_state, _err) => {
        _state?.setHasHydrated?.(true)
      },
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted
        const p = persisted as any
        const sd = p.sessionData
        if (sd && typeof sd === 'object') {
          if (!Array.isArray(sd.likedLoopIds)) sd.likedLoopIds = []
        }
        return p
      },
    },
  ),
)
