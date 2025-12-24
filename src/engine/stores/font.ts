import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface FontState {
  currentFont: string
  previewFont: string | null
  setFont: (font: string) => void
  setPreviewFont: (font: string | null) => void
}

export const useFontStore = create<FontState>()(persist(
  set => ({
    currentFont: 'Space Mono',
    previewFont: null,
    setFont: (font: string) => set({ currentFont: font }),
    setPreviewFont: (previewFont: string | null) => set({ previewFont }),
  }),
  {
    name: 'lm2-font-store',
  },
))
