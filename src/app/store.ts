import { CodeFile, type CodeFileState } from 'mini-code'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { LoopData, SessionData } from '../../deno/types.ts'
import { API } from './api.ts'

interface AppState {
  api: API
  sessionData: SessionData | null
  setSessionData: (data: SessionData | null) => void
  buffers: Record<string, CodeFileState>
  bases: Record<string, { code: string; ts?: number }>
  localLoops: LoopData[]
  selectedLoopId: string | null
  getCodeFile: (id: string, initialValue: string) => CodeFile
  setLoopBase: (id: string, base: string, ts?: number) => void
  getLoopBase: (id: string, fallback?: string) => string
  addLocalLoop: (loop: LoopData) => void
  updateLocalLoop: (id: string, patch: Partial<LoopData>) => void
  removeLocalLoop: (id: string) => void
  setSelectedLoopId: (id: string | null) => void
  dropBuffer: (id: string) => void
}

const api = new API((input, init) => fetch(input, { ...init, credentials: 'include' }))

const codeFiles = new Map<string, CodeFile>()
const codeFileUnsubs = new Map<string, () => void>()
const persistTimers = new Map<string, number>()

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      api,
      sessionData: null,
      setSessionData: sessionData => set({ sessionData }),

      buffers: {},
      bases: {},
      localLoops: [],
      selectedLoopId: null,

      getCodeFile: (id, initialValue) => {
        const existing = codeFiles.get(id)
        if (existing) return existing

        const codeFile = new CodeFile(initialValue)
        const cached = get().buffers[id]
        if (cached) {
          codeFile.setState(cached)
        }

        codeFiles.set(id, codeFile)

        const unsub = codeFile.subscribe(() => {
          const prev = persistTimers.get(id)
          if (prev) window.clearTimeout(prev)
          persistTimers.set(
            id,
            window.setTimeout(() => {
              set(state => ({
                buffers: {
                  ...state.buffers,
                  [id]: codeFile.getState(),
                },
              }))
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

      dropBuffer: (id: string) => {
        codeFileUnsubs.get(id)?.()
        codeFileUnsubs.delete(id)
        codeFiles.delete(id)
        const t = persistTimers.get(id)
        if (t) window.clearTimeout(t)
        persistTimers.delete(id)
        set(state => {
          const { [id]: _, ...rest } = state.buffers
          const { [id]: __, ...bases } = state.bases
          return { buffers: rest, bases }
        })
      },
    }),
    {
      name: 'app',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        buffers: state.buffers,
        bases: state.bases,
        localLoops: state.localLoops,
        selectedLoopId: state.selectedLoopId,
      }),
      version: 5,
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
            localLoops: [],
            selectedLoopId: null,
          }
        }
        if (version === 2) {
          const prev = persisted as any
          return {
            ...prev,
            localLoops: [],
            selectedLoopId: null,
          }
        }
        if (version === 3) {
          const prev = persisted as any
          return {
            ...prev,
            selectedLoopId: null,
          }
        }
        if (version === 4) {
          const prev = persisted as any
          const buffers = prev?.buffers && typeof prev.buffers === 'object' ? prev.buffers as Record<string, any> : {}
          const bases = prev?.bases && typeof prev.bases === 'object' ? prev.bases as Record<string, any> : {}
          const nextBuffers: Record<string, any> = {}
          const nextBases: Record<string, any> = {}

          for (const [id, v] of Object.entries(buffers)) {
            if (!id.startsWith('local:')) continue
            nextBuffers[id] = v
          }
          for (const [id, v] of Object.entries(bases)) {
            if (!id.startsWith('local:')) continue
            nextBases[id] = v
          }

          const localLoops = Array.isArray(prev?.localLoops)
            ? (prev.localLoops as any[])
              .filter(l => l && typeof l === 'object' && typeof l.id === 'string' && (l as any).id.startsWith('local:'))
            : []

          const selectedLoopId = typeof prev?.selectedLoopId === 'string' && prev.selectedLoopId.startsWith('local:')
            ? prev.selectedLoopId
            : null

          return {
            ...prev,
            buffers: nextBuffers,
            bases: nextBases,
            localLoops,
            selectedLoopId,
          }
        }
        return persisted as any
      },
    },
  ),
)
