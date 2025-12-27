import { CodeFile, type CodeFileState, type InputState } from 'mini-code'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CommentData, LoopData, SessionData } from '../../deno/types.ts'
import { isLocalId, newId } from '../utils/id.ts'
import { API } from './api.ts'

type EditorViewState = {
  caret: InputState['caret']
  selection: InputState['selection']
  scrollX: number
  scrollY: number
}

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
  hasFetchedPublicLoops: boolean
  publicLoopsCache: LoopData[]
  hotLoopsCache: LoopData[]
  bestLoopsCache: LoopData[]
  likedLoopsCache: LoopData[]
  isPublicLoopsCacheStale: boolean
  isHotLoopsCacheStale: boolean
  isBestLoopsCacheStale: boolean
  isLikedLoopsCacheStale: boolean
  publicLoopCodeCache: Record<string, string>
  loopCommentsCache: Record<string, CommentData[]>
  loopRemixesCache: Record<string, LoopData[]>
  loopEpochById: Record<string, string>
  bumpLoopEpoch: (loopId: string) => string
  isLoopEpochLatest: (loopId: string, epoch: string) => boolean
  renameLoopEpoch: (fromId: string, toId: string) => void
  dropLoopEpoch: (loopId: string) => void
  refreshPublicLoops: () => Promise<void>
  refreshHotLoops: () => Promise<void>
  refreshBestLoops: () => Promise<void>
  refreshLikedLoops: () => Promise<void>
  upsertPublicLoopCache: (loop: LoopData) => void
  removePublicLoopCache: (id: string) => void
  optimisticUpsertBrowseLoop: (loop: LoopData) => void
  optimisticDeleteBrowseLoop: (id: string) => void
  invalidateBrowseCaches: (what: { public?: boolean; hot?: boolean; best?: boolean; liked?: boolean }) => void
  toggleLike: (loopId: string) => Promise<void>
  prefetchPublicLoopCodes: (loopIds: string[]) => Promise<void>
  getPublicLoopCode: (loopId: string) => Promise<string>
  getLoopRemixes: (loopId: string) => Promise<LoopData[]>
  getLoopComments: (loopId: string) => Promise<CommentData[]>
  createLoopComment: (loopId: string, content: string) => Promise<CommentData>
  deleteLoopComment: (loopId: string, commentId: string, timestamp: number) => Promise<void>
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
const dirtyRafTimers = new Map<string, number>()
const initialValues = new Map<string, string>()
const publicLoopPrefetching = new Set<string>()
const publicLoopFetching = new Map<string, Promise<string>>()
let likedLoopsRefreshReq = 0

const SESSION_VIEWS_KEY = 'app:views:v1'

const updateLoopCommentsCountInList = (list: LoopData[], loopId: string, delta: number) =>
  list.map(loop =>
    loop.id === loopId
      ? { ...loop, commentsCount: Math.max(0, loop.commentsCount + delta) }
      : loop
  )

const updateLoopLikesCountInList = (list: LoopData[], loopId: string, delta: number) =>
  list.map(loop =>
    loop.id === loopId
      ? { ...loop, likesCount: Math.max(0, loop.likesCount + delta) }
      : loop
  )

const updateLoopInList = (list: LoopData[], loopId: string, patch: Partial<LoopData>) =>
  list.map(loop => loop.id === loopId ? { ...loop, ...patch } : loop)

const removeLoopFromList = (list: LoopData[], loopId: string) => list.filter(l => l.id !== loopId)

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

type SetAppState = (next: ((state: AppState) => Partial<AppState> | AppState) | Partial<AppState> | AppState) => void
type GetAppState = () => AppState

const scheduleDirtyUpdate = (id: string, codeFile: CodeFile, get: GetAppState, set: SetAppState) => {
  if (typeof window === 'undefined') return
  if (dirtyRafTimers.has(id)) return
  const rafId = window.requestAnimationFrame(() => {
    dirtyRafTimers.delete(id)
    const baseEntry = get().bases[id]
    const initial = initialValues.get(id) ?? ''
    const base = baseEntry?.code ?? initial
    const baseKnown = baseEntry != null || isLocalId(id) || initial.length > 0
    const isDirty = baseKnown ? codeFile.value !== base : false
    set(state => {
      const wasDirty = state.dirtyById[id] === true
      const dirtyChanged = isDirty ? !wasDirty : wasDirty
      if (!dirtyChanged) return state
      if (isDirty) return { dirtyById: { ...state.dirtyById, [id]: true } }
      const { [id]: _, ...rest } = state.dirtyById
      return { dirtyById: rest }
    })
  })
  dirtyRafTimers.set(id, rafId)
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
      hasFetchedPublicLoops: false,
      publicLoopsCache: [],
      hotLoopsCache: [],
      bestLoopsCache: [],
      likedLoopsCache: [],
      isPublicLoopsCacheStale: false,
      isHotLoopsCacheStale: false,
      isBestLoopsCacheStale: false,
      isLikedLoopsCacheStale: false,
      publicLoopCodeCache: {},
      loopCommentsCache: {},
      loopRemixesCache: {},
      loopEpochById: {},
      bumpLoopEpoch: loopId => {
        const epoch = newId(8)
        set(state => ({ loopEpochById: { ...state.loopEpochById, [loopId]: epoch } }))
        return epoch
      },
      isLoopEpochLatest: (loopId, epoch) => get().loopEpochById[loopId] === epoch,
      renameLoopEpoch: (fromId, toId) => {
        set(state => {
          const epoch = state.loopEpochById[fromId]
          if (!epoch) return state
          const next = { ...state.loopEpochById, [toId]: epoch }
          delete next[fromId]
          return { loopEpochById: next } as AppState
        })
      },
      dropLoopEpoch: loopId => {
        set(state => {
          if (state.loopEpochById[loopId] == null) return state
          const next = { ...state.loopEpochById }
          delete next[loopId]
          return { loopEpochById: next } as AppState
        })
      },

      setSessionData: sessionData => {
        if (!sessionData) {
          set({
            sessionState: 'signedOut',
            sessionData: null,
            serverLoopsUserId: null,
            serverLoopsCache: [],
            likedLoopsCache: [],
            loopRemixesCache: {},
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
        set({ publicLoopsCache: loops, isPublicLoopsCacheStale: false, hasFetchedPublicLoops: true })
      },

      refreshHotLoops: async () => {
        const api = get().api
        const loops = await api.fetchHotLoops()
        set({ hotLoopsCache: loops, isHotLoopsCacheStale: false })
      },

      refreshBestLoops: async () => {
        const api = get().api
        const loops = await api.fetchBestLoops()
        set({ bestLoopsCache: loops, isBestLoopsCacheStale: false })
      },

      refreshLikedLoops: async () => {
        const api = get().api
        const req = ++likedLoopsRefreshReq
        const loops = await api.fetchLikedLoops()
        if (req !== likedLoopsRefreshReq) return
        set({ likedLoopsCache: loops, isLikedLoopsCacheStale: false })
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

      optimisticUpsertBrowseLoop: loop => {
        set(state => {
          const loopId = loop.id
          const isPublic = loop.isPublic ?? false
          const { code, comments: _comments, remixOf: _remixOf, ...rest } = loop
          const summary = rest as LoopData

          const nextPublic = (() => {
            if (!isPublic) return removeLoopFromList(state.publicLoopsCache, loopId)
            const idx = state.publicLoopsCache.findIndex(l => l.id === loopId)
            const nextLoop = idx === -1 ? summary : { ...state.publicLoopsCache[idx]!, ...summary }
            return idx === -1
              ? [nextLoop, ...state.publicLoopsCache]
              : state.publicLoopsCache.map((l, i) => i === idx ? nextLoop : l)
          })()

          const nextHot = (() => {
            if (!isPublic) return removeLoopFromList(state.hotLoopsCache, loopId)
            if (!state.hotLoopsCache.some(l => l.id === loopId)) return state.hotLoopsCache
            return updateLoopInList(state.hotLoopsCache, loopId, summary)
          })()

          const nextBest = (() => {
            if (!isPublic) return removeLoopFromList(state.bestLoopsCache, loopId)
            if (!state.bestLoopsCache.some(l => l.id === loopId)) return state.bestLoopsCache
            return updateLoopInList(state.bestLoopsCache, loopId, summary)
          })()

          const nextLiked = (() => {
            if (!isPublic) return removeLoopFromList(state.likedLoopsCache, loopId)
            if (!state.likedLoopsCache.some(l => l.id === loopId)) return state.likedLoopsCache
            return updateLoopInList(state.likedLoopsCache, loopId, summary)
          })()

          const nextPublicLoopCodeCache = (() => {
            if (!isPublic) {
              if (state.publicLoopCodeCache[loopId] == null) return state.publicLoopCodeCache
              const next = { ...state.publicLoopCodeCache }
              delete next[loopId]
              return next
            }
            if (code == null) return state.publicLoopCodeCache
            if (state.publicLoopCodeCache[loopId] === code) return state.publicLoopCodeCache
            return { ...state.publicLoopCodeCache, [loopId]: code }
          })()

          return ({
            publicLoopsCache: nextPublic,
            hotLoopsCache: nextHot,
            bestLoopsCache: nextBest,
            likedLoopsCache: nextLiked,
            publicLoopCodeCache: nextPublicLoopCodeCache,
          }) as AppState
        })
      },

      optimisticDeleteBrowseLoop: id => {
        set(state => {
          const nextPublicLoopCodeCache = (() => {
            if (state.publicLoopCodeCache[id] == null) return state.publicLoopCodeCache
            const next = { ...state.publicLoopCodeCache }
            delete next[id]
            return next
          })()

          const nextLoopCommentsCache = (() => {
            if (state.loopCommentsCache[id] == null) return state.loopCommentsCache
            const next = { ...state.loopCommentsCache }
            delete next[id]
            return next
          })()

          const nextLoopRemixesCache = (() => {
            if (state.loopRemixesCache[id] == null) return state.loopRemixesCache
            const next = { ...state.loopRemixesCache }
            delete next[id]
            return next
          })()

          return ({
            publicLoopsCache: removeLoopFromList(state.publicLoopsCache, id),
            hotLoopsCache: removeLoopFromList(state.hotLoopsCache, id),
            bestLoopsCache: removeLoopFromList(state.bestLoopsCache, id),
            likedLoopsCache: removeLoopFromList(state.likedLoopsCache, id),
            publicLoopCodeCache: nextPublicLoopCodeCache,
            loopCommentsCache: nextLoopCommentsCache,
            loopRemixesCache: nextLoopRemixesCache,
          }) as AppState
        })
      },

      invalidateBrowseCaches: what => {
        set(state => ({
          isPublicLoopsCacheStale: what.public ? true : state.isPublicLoopsCacheStale,
          isHotLoopsCacheStale: what.hot ? true : state.isHotLoopsCacheStale,
          isBestLoopsCacheStale: what.best ? true : state.isBestLoopsCacheStale,
          isLikedLoopsCacheStale: what.liked ? true : state.isLikedLoopsCacheStale,
        }))
      },

      toggleLike: async loopId => {
        const prevSession = get().sessionData
        if (!prevSession) return
        const epoch = get().bumpLoopEpoch(loopId)

        const wasLiked = prevSession.likedLoopIds.includes(loopId)
        const optimisticLiked = !wasLiked
        const optimisticSession: SessionData = {
          ...prevSession,
          likedLoopIds: optimisticLiked
            ? [...prevSession.likedLoopIds, loopId]
            : prevSession.likedLoopIds.filter(id => id !== loopId),
        }

        get().setSessionData(optimisticSession)

        const optimisticDelta = optimisticLiked ? 1 : -1
        set(state => {
          const item = state.publicLoopsCache.find(l => l.id === loopId)
            ?? state.hotLoopsCache.find(l => l.id === loopId)
            ?? state.bestLoopsCache.find(l => l.id === loopId)
            ?? state.likedLoopsCache.find(l => l.id === loopId)

          return ({
            publicLoopsCache: updateLoopLikesCountInList(state.publicLoopsCache, loopId, optimisticDelta),
            hotLoopsCache: updateLoopLikesCountInList(state.hotLoopsCache, loopId, optimisticDelta),
            bestLoopsCache: updateLoopLikesCountInList(state.bestLoopsCache, loopId, optimisticDelta),
            likedLoopsCache: (() => {
              if (optimisticLiked) {
                if (state.likedLoopsCache.some(l => l.id === loopId)) {
                  return updateLoopLikesCountInList(state.likedLoopsCache, loopId, optimisticDelta)
                }
                if (!item) return state.likedLoopsCache
                return [{ ...item, likesCount: Math.max(0, item.likesCount + optimisticDelta) },
                  ...state.likedLoopsCache]
              }
              return state.likedLoopsCache.filter(l => l.id !== loopId)
            })(),
          }) as AppState
        })

        try {
          const res = await get().api.toggleLike(loopId, epoch)
          if (!get().isLoopEpochLatest(loopId, epoch)) return
          const serverSession = res.sessionData
          const actualLiked = serverSession.likedLoopIds.includes(loopId)

          const currSession = get().sessionData
          if (!currSession) return

          const nextLikedLoopIds = actualLiked
            ? (currSession.likedLoopIds.includes(loopId)
              ? currSession.likedLoopIds
              : [...currSession.likedLoopIds, loopId])
            : currSession.likedLoopIds.filter(id => id !== loopId)

          get().setSessionData({ ...serverSession, likedLoopIds: nextLikedLoopIds })
          const correctionDelta = (actualLiked ? 1 : 0) - (optimisticLiked ? 1 : 0)
          if (correctionDelta === 0) return

          set(state => {
            const item = state.publicLoopsCache.find(l => l.id === loopId)
              ?? state.hotLoopsCache.find(l => l.id === loopId)
              ?? state.bestLoopsCache.find(l => l.id === loopId)
              ?? state.likedLoopsCache.find(l => l.id === loopId)

            return ({
              publicLoopsCache: updateLoopLikesCountInList(state.publicLoopsCache, loopId, correctionDelta),
              hotLoopsCache: updateLoopLikesCountInList(state.hotLoopsCache, loopId, correctionDelta),
              bestLoopsCache: updateLoopLikesCountInList(state.bestLoopsCache, loopId, correctionDelta),
              likedLoopsCache: (() => {
                if (actualLiked) {
                  if (state.likedLoopsCache.some(l => l.id === loopId)) {
                    return updateLoopLikesCountInList(state.likedLoopsCache, loopId, correctionDelta)
                  }
                  if (!item) return state.likedLoopsCache
                  return [{ ...item, likesCount: Math.max(0, item.likesCount + correctionDelta) },
                    ...state.likedLoopsCache]
                }
                return state.likedLoopsCache.filter(l => l.id !== loopId)
              })(),
            }) as AppState
          })
        }
        catch {
          if (!get().isLoopEpochLatest(loopId, epoch)) return
          const currSession = get().sessionData
          if (currSession) {
            const nextLikedLoopIds = wasLiked
              ? (currSession.likedLoopIds.includes(loopId)
                ? currSession.likedLoopIds
                : [...currSession.likedLoopIds, loopId])
              : currSession.likedLoopIds.filter(id => id !== loopId)
            get().setSessionData({ ...currSession, likedLoopIds: nextLikedLoopIds })
          }
          const revertDelta = wasLiked ? 1 : -1
          set(state => {
            const item = state.publicLoopsCache.find(l => l.id === loopId)
              ?? state.hotLoopsCache.find(l => l.id === loopId)
              ?? state.bestLoopsCache.find(l => l.id === loopId)
              ?? state.likedLoopsCache.find(l => l.id === loopId)

            return ({
              publicLoopsCache: updateLoopLikesCountInList(state.publicLoopsCache, loopId, revertDelta),
              hotLoopsCache: updateLoopLikesCountInList(state.hotLoopsCache, loopId, revertDelta),
              bestLoopsCache: updateLoopLikesCountInList(state.bestLoopsCache, loopId, revertDelta),
              likedLoopsCache: (() => {
                if (wasLiked) {
                  if (state.likedLoopsCache.some(l => l.id === loopId)) {
                    return updateLoopLikesCountInList(state.likedLoopsCache, loopId, revertDelta)
                  }
                  if (!item) return state.likedLoopsCache
                  return [{ ...item, likesCount: Math.max(0, item.likesCount + revertDelta) }, ...state.likedLoopsCache]
                }
                return state.likedLoopsCache.filter(l => l.id !== loopId)
              })(),
            }) as AppState
          })
        }
      },

      prefetchPublicLoopCodes: async loopIds => {
        const cache = get().publicLoopCodeCache
        const ids = loopIds
          .filter(id => cache[id] == null)
          .filter(id => !publicLoopPrefetching.has(id))
        if (ids.length === 0) return

        for (const id of ids) publicLoopPrefetching.add(id)
        try {
          const codes = await get().api.prefetchPublicLoopCodes(ids)
          set(state => ({
            publicLoopCodeCache: { ...state.publicLoopCodeCache, ...codes },
          }))
        }
        finally {
          for (const id of ids) publicLoopPrefetching.delete(id)
        }
      },

      getPublicLoopCode: async loopId => {
        const cached = get().publicLoopCodeCache[loopId]
        if (cached != null) return cached
        const inflight = publicLoopFetching.get(loopId)
        if (inflight) return inflight

        const promise = (async () => {
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
        })()

        publicLoopFetching.set(loopId, promise)
        try {
          return await promise
        }
        finally {
          publicLoopFetching.delete(loopId)
        }
      },

      getLoopRemixes: async loopId => {
        const cached = get().loopRemixesCache[loopId]
        if (cached != null) return cached
        const remixes = await get().api.fetchPublicLoopRemixes(loopId)
        set(state => ({
          loopRemixesCache: { ...state.loopRemixesCache, [loopId]: remixes },
        }))
        return remixes
      },

      getLoopComments: async loopId => {
        const cached = get().loopCommentsCache[loopId]
        if (cached != null) return cached
        const comments = await get().api.fetchLoopComments(loopId)
        set(state => {
          const prev = state.loopCommentsCache[loopId]
          if (!prev) {
            return {
              loopCommentsCache: { ...state.loopCommentsCache, [loopId]: comments },
            }
          }

          const byId = new Map<string, CommentData>()
          for (const c of prev) byId.set(c.id, c)
          for (const c of comments) byId.set(c.id, c)
          const merged = Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp)
          return {
            loopCommentsCache: { ...state.loopCommentsCache, [loopId]: merged },
          }
        })
        return comments
      },

      createLoopComment: async (loopId, content) => {
        const comment = await get().api.createLoopComment(loopId, content)
        set(state => ({
          loopCommentsCache: {
            ...state.loopCommentsCache,
            [loopId]: (() => {
              const prev = state.loopCommentsCache[loopId]
              if (!prev) return [comment]
              if (prev.some(c => c.id === comment.id)) return prev
              return [comment, ...prev]
            })(),
          },
          publicLoopsCache: updateLoopCommentsCountInList(state.publicLoopsCache, loopId, 1),
          likedLoopsCache: updateLoopCommentsCountInList(state.likedLoopsCache, loopId, 1),
          serverLoopsCache: updateLoopCommentsCountInList(state.serverLoopsCache, loopId, 1),
        }))
        return comment
      },

      deleteLoopComment: async (loopId, commentId, timestamp) => {
        await get().api.deleteLoopComment(loopId, commentId, timestamp)
        set(state => ({
          loopCommentsCache: (() => {
            const prev = state.loopCommentsCache[loopId]
            if (!prev) return state.loopCommentsCache
            return { ...state.loopCommentsCache, [loopId]: prev.filter(c => c.id !== commentId) }
          })(),
          publicLoopsCache: updateLoopCommentsCountInList(state.publicLoopsCache, loopId, -1),
          likedLoopsCache: updateLoopCommentsCountInList(state.likedLoopsCache, loopId, -1),
          serverLoopsCache: updateLoopCommentsCountInList(state.serverLoopsCache, loopId, -1),
        }))
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
          scheduleDirtyUpdate(id, codeFile, get, set)
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

        const raf1 = dirtyRafTimers.get(fromId)
        if (raf1 != null) window.cancelAnimationFrame(raf1)
        dirtyRafTimers.delete(fromId)
        const raf2 = dirtyRafTimers.get(toId)
        if (raf2 != null) window.cancelAnimationFrame(raf2)
        dirtyRafTimers.delete(toId)

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
            scheduleDirtyUpdate(toId, codeFile, get, set)
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

                const baseEntry = get().bases[toId]
                const initial = initialValues.get(toId) ?? ''
                const base = baseEntry?.code ?? initial
                const shouldPersist = shouldPersistBuffer(toId, snapshot, base)
                const baseKnown = baseEntry != null || isLocalId(toId) || initial.length > 0
                const isDirty = baseKnown ? snapshot.value !== base : false

                set(state => {
                  const has = state.buffers[toId] != null
                  const wasDirty = state.dirtyById[toId] === true
                  const dirtyChanged = isDirty ? !wasDirty : wasDirty
                  if (shouldPersist) {
                    if (!dirtyChanged && has && state.buffers[toId] === snapshot) return state
                    return {
                      buffers: {
                        ...state.buffers,
                        [toId]: snapshot,
                      },
                      dirtyById: isDirty
                        ? { ...state.dirtyById, [toId]: true }
                        : (() => {
                          if (!wasDirty) return state.dirtyById
                          const { [toId]: _, ...rest } = state.dirtyById
                          return rest
                        })(),
                    }
                  }
                  if (!has && !dirtyChanged) return state
                  const next: Partial<AppState> = {}
                  if (has) {
                    const { [toId]: _, ...rest } = state.buffers
                    next.buffers = rest
                  }
                  if (dirtyChanged) {
                    if (isDirty) {
                      next.dirtyById = { ...state.dirtyById, [toId]: true }
                    }
                    else {
                      const { [toId]: _, ...rest } = state.dirtyById
                      next.dirtyById = rest
                    }
                  }
                  return next as AppState
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

        // `moveBuffer()` can cancel a pending persist timer (from the source id) that would've updated `dirtyById`.
        // Sync the destination id immediately so the loops list reflects dirty state without requiring another edit.
        const moved = codeFiles.get(toId)
        if (!moved) return
        const snapshot = moved.getState()
        sessionViews[toId] = {
          caret: snapshot.inputState.caret,
          selection: snapshot.inputState.selection,
          scrollX: snapshot.scrollX,
          scrollY: snapshot.scrollY,
        }
        schedulePersistSessionViews()
        const baseEntry = get().bases[toId]
        const initial = initialValues.get(toId) ?? ''
        const base = baseEntry?.code ?? initial
        const shouldPersist = shouldPersistBuffer(toId, snapshot, base)
        const baseKnown = baseEntry != null || isLocalId(toId) || initial.length > 0
        set(state => {
          const isDirty = baseKnown ? snapshot.value !== base : false
          const hasDirty = state.dirtyById[toId] === true

          const needsDirtyChange = isDirty ? !hasDirty : hasDirty
          const hasBuffer = state.buffers[toId] != null
          const shouldDropBuffer = !shouldPersist && hasBuffer
          const shouldSetBuffer = shouldPersist && (!hasBuffer || state.buffers[toId] !== snapshot)

          if (!needsDirtyChange && !shouldDropBuffer && !shouldSetBuffer) return state

          const next: Partial<AppState> = {}

          if (shouldSetBuffer) {
            next.buffers = { ...state.buffers, [toId]: snapshot }
          }
          else if (shouldDropBuffer) {
            const { [toId]: _, ...rest } = state.buffers
            next.buffers = rest
          }

          if (needsDirtyChange) {
            if (isDirty) {
              next.dirtyById = { ...state.dirtyById, [toId]: true }
            }
            else {
              const { [toId]: _, ...rest } = state.dirtyById
              next.dirtyById = rest
            }
          }

          return next as AppState
        })
      },

      dropBuffer: (id: string) => {
        const raf = dirtyRafTimers.get(id)
        if (raf != null) window.cancelAnimationFrame(raf)
        dirtyRafTimers.delete(id)
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
