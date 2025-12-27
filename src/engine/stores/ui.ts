import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SidebarTab } from '../ui/Sidebar.tsx'

export type EngineUiState = {
  viewSampleCountByLoopId: Record<string, number>
  zeroBasedTimelines: boolean
  showFunctionDefinitions: boolean
  sidebarTab: SidebarTab

  setViewSampleCount: (loopId: string, sampleCount: number) => void
  renameLoopId: (oldId: string, nextId: string) => void
  setZeroBasedTimelines: (zeroBased: boolean) => void
  setShowFunctionDefinitions: (showFunctionDefinitions: boolean) => void
  setSidebarTab: (sidebarTab: SidebarTab) => void
}

export const useEngineUiStore = create<EngineUiState>()(persist(set => {
  return {
    viewSampleCountByLoopId: {},
    zeroBasedTimelines: false,
    showFunctionDefinitions: true,
    sidebarTab: 'loops',

    setViewSampleCount: (loopId: string, sampleCount: number) => {
      const next = Math.max(0, Math.floor(sampleCount))
      set(state => {
        const prev = state.viewSampleCountByLoopId[loopId]
        if (prev === next) return state
        return {
          ...state,
          viewSampleCountByLoopId: {
            ...state.viewSampleCountByLoopId,
            [loopId]: next,
          },
        }
      })
    },

    renameLoopId: (oldId: string, nextId: string) => {
      if (oldId === nextId) return
      set(state => {
        const prevById = state.viewSampleCountByLoopId
        const prev = prevById[oldId]
        if (prev === undefined) return state
        const out = { ...prevById }
        if (!(nextId in out)) out[nextId] = prev
        delete out[oldId]
        return { ...state, viewSampleCountByLoopId: out }
      })
    },

    setZeroBasedTimelines: (zeroBased: boolean) => {
      set({ zeroBasedTimelines: zeroBased })
    },

    setShowFunctionDefinitions: (showFunctionDefinitions: boolean) => {
      set({ showFunctionDefinitions: showFunctionDefinitions })
    },

    setSidebarTab: (sidebarTab: SidebarTab) => {
      set({ sidebarTab: sidebarTab })
    },
  }
}, {
  name: 'lm2-ui-store',
  version: 2,
  migrate: persisted => {
    if (!persisted || typeof persisted !== 'object') return persisted as EngineUiState
    const p = persisted as EngineUiState
    if ((p.sidebarTab as unknown as string) === 'liked') {
      return { ...p, sidebarTab: 'browse' }
    }
    return p
  },
}))
