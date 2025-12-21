import { CodeFile, type CodeFileState } from 'mini-code'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { LoopData, SessionData } from '../../deno/types.ts'
import { API } from './api.ts'
import { mockFetch } from './mock-fetch.ts'

interface AppState {
  api: API
  sessionData: SessionData | null
  setSessionData: (data: SessionData) => void
  buffers: Record<string, CodeFileState>
  bases: Record<string, { code: string; ts?: number }>
  localLoops: LoopData[]
  getCodeFile: (id: string, initialValue: string) => CodeFile
  setLoopBase: (id: string, base: string, ts?: number) => void
  getLoopBase: (id: string, fallback?: string) => string
  addLocalLoop: (loop: LoopData) => void
  updateLocalLoop: (id: string, patch: Partial<LoopData>) => void
  removeLocalLoop: (id: string) => void
  dropBuffer: (id: string) => void
}

const api = new API(mockFetch)

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
          localLoops: state.localLoops.map(loop =>
            loop.id === id ? { ...loop, ...patch } : loop
          ),
        }))
      },

      removeLocalLoop: (id: string) => {
        set(state => ({ localLoops: state.localLoops.filter(loop => loop.id !== id) }))
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
      partialize: state => ({ buffers: state.buffers, bases: state.bases, localLoops: state.localLoops }),
      version: 3,
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
          }
        }
        if (version === 2) {
          const prev = persisted as any
          return {
            ...prev,
            localLoops: [],
          }
        }
        return persisted as any
      },
    },
  ),
)
