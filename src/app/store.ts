import { create } from 'zustand'
import type { SessionData } from '../../deno/types.ts'
import { API } from './api.ts'
import { mockFetch } from './mock-fetch.ts'

interface AppState {
  api: API
  sessionData: SessionData | null
  setSessionData: (data: SessionData) => void
}

const api = new API(mockFetch)

export const useAppStore = create<AppState>(set => ({
  api,
  sessionData: null,
  setSessionData: sessionData => set({ sessionData }),
}))
