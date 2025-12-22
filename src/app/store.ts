import { CodeFile, type CodeFileState, type InputState } from 'mini-code'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { LoopData, SessionData } from '../../deno/types.ts'
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
  sessionData: SessionData | null
  setSessionData: (data: SessionData | null) => void
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

const api = new API(async (input, init) => {
  await new Promise(resolve => setTimeout(resolve, 3000))
  return fetch(input, { ...init, credentials: 'include' })
})

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
      api,
      sessionData: null,
      setSessionData: sessionData => set({ sessionData }),

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

              const base = get().bases[id]?.code ?? initialValues.get(id) ?? ''
              const shouldPersist = shouldPersistBuffer(id, snapshot, base)
              const isDirty = snapshot.value !== base

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
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        buffers: state.buffers,
        bases: state.bases,
        dirtyById: state.dirtyById,
        localLoops: state.localLoops,
        selectedLoopId: state.selectedLoopId,
      }),
      version: 7,
      migrate: (persisted, version) => {
        if (version === 0 || version === 1) {
          const prev = persisted as any
          const nextBases: Record<string, { code: string }> = {}
          const bases = prev?.bases
          if (bases && typeof bases === 'object') {
            for (const [id, value] of Object.entries(bases)) {
              if (typeof value === 'string') {
                if (value.length > 0) nextBases[id] = { code: value }
              }
              else if (value && typeof value === 'object' && typeof (value as any).code === 'string') {
                const code = (value as any).code as string
                if (code.length > 0) nextBases[id] = { code }
              }
            }
          }
          return {
            ...prev,
            bases: nextBases,
            dirtyById: {},
            localLoops: [],
            selectedLoopId: null,
          }
        }
        if (version === 2) {
          const prev = persisted as any
          return {
            ...prev,
            dirtyById: {},
            localLoops: [],
            selectedLoopId: null,
          }
        }
        if (version === 3) {
          const prev = persisted as any
          return {
            ...prev,
            dirtyById: {},
            selectedLoopId: null,
          }
        }
        if (version === 4) {
          const prev = persisted as any
          const buffers = prev?.buffers && typeof prev.buffers === 'object' ? prev.buffers as Record<string, any> : {}
          const bases = prev?.bases && typeof prev.bases === 'object' ? prev.bases as Record<string, any> : {}

          const localLoops = Array.isArray(prev?.localLoops)
            ? (prev.localLoops as any[])
              .filter(l => l && typeof l === 'object' && typeof l.id === 'string' && (l as any).id.startsWith('local:'))
            : []

          const selectedLoopId = typeof prev?.selectedLoopId === 'string' ? prev.selectedLoopId : null

          return {
            ...prev,
            buffers,
            bases,
            dirtyById: {},
            localLoops,
            selectedLoopId,
          }
        }
        if (version === 5) {
          const prev = persisted as any
          const buffers = prev?.buffers && typeof prev.buffers === 'object' ? prev.buffers as Record<string, any> : {}
          const bases = prev?.bases && typeof prev.bases === 'object' ? prev.bases as Record<string, any> : {}
          const nextBuffers: Record<string, any> = {}
          for (const [id, buf] of Object.entries(buffers)) {
            const base = bases[id]?.code
            if (typeof base === 'string' && buf && typeof buf === 'object' && typeof (buf as any).value === 'string') {
              const value = (buf as any).value as string
              if (value === base && (!isLocalId(id) || value.length === 0)) continue
            }
            nextBuffers[id] = buf
          }
          return {
            ...prev,
            buffers: nextBuffers,
            bases,
            dirtyById: {},
          }
        }
        if (version === 6) {
          const prev = persisted as any
          const buffers = prev?.buffers && typeof prev.buffers === 'object' ? prev.buffers as Record<string, any> : {}
          const bases = prev?.bases && typeof prev.bases === 'object' ? prev.bases as Record<string, any> : {}
          const dirtyById: Record<string, boolean> = {}
          for (const [id, buf] of Object.entries(buffers)) {
            const base = bases[id]?.code
            const value = buf && typeof buf === 'object' ? (buf as any).value : undefined
            if (typeof value !== 'string') continue
            const dirty = typeof base === 'string' ? value !== base : value.length > 0
            if (dirty) dirtyById[id] = true
          }
          return {
            ...prev,
            buffers,
            bases,
            dirtyById,
          }
        }
        return persisted as any
      },
    },
  ),
)
