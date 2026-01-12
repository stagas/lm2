export const DEBUG = true
export const TRIG_FADEOUT_SECONDS = 0.3
export const PIANOROLL_KEY_WIDTH = 20
export const PIANOROLL_BAR_COLOR_ODD = 'rgba(255, 255, 255, 0.09)'
export const PIANOROLL_BAR_COLOR_EVEN = 'rgba(255, 255, 255, 0.12)'
export const SCROLL_SMOOTHING = 0.17
export const DEFAULT_SEQUENCES = ['c4 e4 [g4 a4]*2', 'a3 c4 [d4 f4 a4]*2']

export const DEFAULT_DSP_SOURCE = `bpm=120

drums() |> out($)`

export const INTRO_SOURCE = `
trig=at(1)
sine(hz-hz+35631 (0 100k)*sine(4554 (0 10k),trig) *ad(.0001,10.0000,10,trig),trig)*ad(.0004,.1,trig)|>lp($,69.71  +200000*ad(.001,.0711,10,trig)) |> limiter($)*.5 |> out($)
drums()
`

export const LANDING_PAGE_SOURCE = `tb303=(hz,cutoff,q,k,sat,trig)->

  diodeladder(ramp(hz),cutoff,q,k,sat) |> tanh($*6)*.5 |> dc($)

trig=every(1/16) tb303([#1*o2,#1*o2,#7*o2,#5*o3].glide(1/8,10),

cutoff:100+(300 (0 5k) +2k*fractal(6)**3)*ad(.01,3,30,trig),

q:.91,k:.002,sat:1.15,trig)*.2+drums() |> limiter($) |> out($)`

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
