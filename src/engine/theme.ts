import type { Theme } from 'mini-code'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useFontStore } from './store.ts'

export const availableFonts = [
  'IBM Plex Mono',
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'Space Mono',
] as const

export type FontName = (typeof availableFonts)[number]

const getFontString = (fontName: string): string => {
  return `12pt "${fontName}", monospace`
}

const createBaseTheme = (colors: any, rainbowColors: string[], errorColor: string, background: string,
  gutterBackground: string, gutterBorder: string, gutterText: string, selection: string, caret: string,
  braceMatch: string, scrollbarThumb: string, scrollbarThumbHover: string, errorPopup: any, functionSignaturePopup: any,
  autocompletePopup: any): Omit<Theme, 'font'> => ({
    colors,
    rainbowColors,
    errorColor,
    errorGutterColor: errorColor,
    errorSquigglyColor: errorColor,
    background,
    gutterBackground,
    gutterBorder,
    gutterText,
    selection,
    caret,
    braceMatch,
    scrollbarTrack: 'transparent',
    scrollbarThumb,
    scrollbarThumbHover,
    errorPopup,
    functionSignaturePopup,
    autocompletePopup,
  })

export const themes: Record<string, Omit<Theme, 'font'>> = {
  monokai: createBaseTheme(
    {
      keyword: '#e06c31',
      string: '#dcb77e',
      number: '#ffbb00',
      function: '#55ddff',
      parameter: '#c39076',
      argument: '#ff6622',
      comment: '#a98054',
      operator: '#dbb049',
      punctuation: '#a88',
      default: '#f6e7d6',
    },
    ['#88ff88', '#faf', '#4af'],
    '#ff5555',
    '#222',
    '#222',
    '#3e3d32',
    '#75715e',
    '#49483e',
    '#f8f8f0',
    '#f8f8f0',
    '#4b5563',
    '#6b7280',
    {
      background: '#3a1f1f',
      border: '#ff5555',
      text: '#f6e7d6',
    },
    {
      background: '#2a2a2a',
      border: '#4a4a40',
      text: '#f6e7d6',
      activeParameterBackground: '#49483e',
      activeParameterText: '#f6e7d6',
      functionName: '#55ddff',
      returnType: '#55ddff',
      parameterName: '#c39076',
      parameterType: '#ffbb00',
      description: '#a98054',
      separator: '#8f8',
    },
    {
      background: '#2a2a2a',
      border: '#4a4a40',
      text: '#f6e7d6',
      selectedBackground: '#49483e',
      selectedText: '#f6e7d6',
      hoverBackground: '#2a2a2a',
    },
  ),
  dracula: createBaseTheme(
    {
      keyword: '#ff79c6',
      string: '#f1fa8c',
      number: '#bd93f9',
      function: '#50fa7b',
      parameter: '#8be9fd',
      argument: '#ffb86c',
      comment: '#6272a4',
      operator: '#ff79c6',
      punctuation: '#f8f8f2',
      default: '#f8f8f2',
    },
    ['#ff79c6', '#bd93f9', '#50fa7b'],
    '#ff5555',
    '#282a36',
    '#282a36',
    '#44475a',
    '#6272a4',
    '#44475a',
    '#f8f8f0',
    '#f8f8f0',
    '#44475a',
    '#6272a4',
    {
      background: '#3a1f1f',
      border: '#ff5555',
      text: '#f8f8f2',
    },
    {
      background: '#323544',
      border: '#505266',
      text: '#f8f8f2',
      activeParameterBackground: '#44475a',
      activeParameterText: '#f8f8f2',
      functionName: '#50fa7b',
      returnType: '#50fa7b',
      parameterName: '#8be9fd',
      parameterType: '#bd93f9',
      description: '#6272a4',
      separator: '#6272a4',
    },
    {
      background: '#323544',
      border: '#505266',
      text: '#f8f8f2',
      selectedBackground: '#44475a',
      selectedText: '#f8f8f2',
      hoverBackground: '#21222c',
    },
  ),
  nord: createBaseTheme(
    {
      keyword: '#81a1c1',
      string: '#a3be8c',
      number: '#b48ead',
      function: '#88c0d0',
      parameter: '#8fbcbb',
      argument: '#ebcb8b',
      comment: '#616e88',
      operator: '#81a1c1',
      punctuation: '#d8dee9',
      default: '#d8dee9',
    },
    ['#a3be8c', '#b48ead', '#88c0d0'],
    '#bf616a',
    '#2e3440',
    '#2e3440',
    '#3b4252',
    '#616e88',
    '#3b4252',
    '#d8dee9',
    '#d8dee9',
    '#3b4252',
    '#434c5e',
    {
      background: '#3b1f1f',
      border: '#bf616a',
      text: '#d8dee9',
    },
    {
      background: '#3a4250',
      border: '#47505e',
      text: '#d8dee9',
      activeParameterBackground: '#3b4252',
      activeParameterText: '#d8dee9',
      functionName: '#88c0d0',
      returnType: '#88c0d0',
      parameterName: '#8fbcbb',
      parameterType: '#b48ead',
      description: '#616e88',
      separator: '#616e88',
    },
    {
      background: '#3a4250',
      border: '#47505e',
      text: '#d8dee9',
      selectedBackground: '#3b4252',
      selectedText: '#d8dee9',
      hoverBackground: '#252933',
    },
  ),
  monochrome: createBaseTheme(
    {
      keyword: '#ffffff',
      string: '#cccccc',
      number: '#aaaaaa',
      function: '#ffffff',
      parameter: '#dddddd',
      argument: '#eeeeee',
      comment: '#666666',
      operator: '#ffffff',
      punctuation: '#bbbbbb',
      default: '#ffffff',
    },
    ['#ffffff', '#cccccc', '#888888'],
    '#ff0000',
    '#000000',
    '#000000',
    '#333333',
    '#666666',
    '#333333',
    '#ffffff',
    '#ffffff',
    '#333333',
    '#444444',
    {
      background: '#1a0000',
      border: '#ff0000',
      text: '#ffffff',
    },
    {
      background: '#0a0a0a',
      border: '#404040',
      text: '#ffffff',
      activeParameterBackground: '#333333',
      activeParameterText: '#ffffff',
      functionName: '#ffffff',
      returnType: '#ffffff',
      parameterName: '#dddddd',
      parameterType: '#aaaaaa',
      description: '#666666',
      separator: '#666666',
    },
    {
      background: '#0a0a0a',
      border: '#404040',
      text: '#ffffff',
      selectedBackground: '#333333',
      selectedText: '#ffffff',
      hoverBackground: '#0a0a0a',
    },
  ),
  duochrome: createBaseTheme(
    {
      keyword: '#ffffff',
      string: '#cccccc',
      number: '#aaaaaa',
      function: '#f97316',
      parameter: '#dddddd',
      argument: '#eeeeee',
      comment: '#666666',
      operator: '#ffffff',
      punctuation: '#bbbbbb',
      default: '#ffffff',
    },
    ['#ffffff', '#cccccc', '#888888'],
    '#ff0000',
    '#000000',
    '#000000',
    '#333333',
    '#666666',
    '#333333',
    '#ffffff',
    '#ffffff',
    '#333333',
    '#444444',
    {
      background: '#1a0000',
      border: '#ff0000',
      text: '#ffffff',
    },
    {
      background: '#0a0a0a',
      border: '#404040',
      text: '#ffffff',
      activeParameterBackground: '#333333',
      activeParameterText: '#ffffff',
      functionName: '#f97316',
      returnType: '#f97316',
      parameterName: '#dddddd',
      parameterType: '#aaaaaa',
      description: '#666666',
      separator: '#666666',
    },
    {
      background: '#0a0a0a',
      border: '#404040',
      text: '#ffffff',
      selectedBackground: '#333333',
      selectedText: '#ffffff',
      hoverBackground: '#0a0a0a',
    },
  ),
}

interface ThemeState {
  currentTheme: string
  previewTheme: string | null
  setTheme: (theme: string) => void
  setPreviewTheme: (theme: string | null) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    set => ({
      currentTheme: 'monokai',
      previewTheme: null,
      setTheme: (theme: string) => set({ currentTheme: theme }),
      setPreviewTheme: (previewTheme: string | null) => set({ previewTheme }),
    }),
    {
      name: 'theme-storage',
    },
  ),
)

export function useTheme(): Theme {
  const currentTheme = useThemeStore(state => state.currentTheme)
  const previewTheme = useThemeStore(state => state.previewTheme)
  const currentFont = useFontStore(state => state.currentFont)
  const previewFont = useFontStore(state => state.previewFont)
  const themeName = previewTheme ?? currentTheme
  const fontName = previewFont ?? currentFont
  const baseTheme = themes[themeName] ?? themes.monokai
  return {
    ...baseTheme,
    font: getFontString(fontName),
  }
}

export const getBaseTheme = (themeName: string): Omit<Theme, 'font'> => {
  return themes[themeName] ?? themes.monokai
}

export const getCurrentTheme = (): Theme => {
  return themes[useThemeStore.getState().currentTheme] as Theme
}
