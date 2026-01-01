export const DEBUG = true
export const PIANOROLL_KEY_WIDTH = 20
export const PIANOROLL_BAR_COLOR_ODD = 'rgba(255, 255, 255, 0.09)'
export const PIANOROLL_BAR_COLOR_EVEN = 'rgba(255, 255, 255, 0.12)'
export const SCROLL_SMOOTHING = 0.17
export const DEFAULT_SEQUENCES = ['c4 e4 [g4 a4]*2', 'a3 c4 [d4 f4 a4]*2']
export const DEFAULT_DSP_SOURCE = `mini('c4 e4 [g4 a4]*2', (trig, velocity, hz) -> {
  env = adsr(attack:0.01, decay:0.3, sustain:0.2, release:0.4, trig)
  sine(hz, trig) * env * velocity * 0.25
}) |> analyser(%) |> out(%)`
export const KEYWORDS = [
  'do',
  'case',
  'break',
  'continue',
  'else',
  'for',
  'of',
  'if',
  'return',
  'switch',
  'throw',
  'try',
  'while',
  'null',
  'true',
  'false',
  'undefined',
]
