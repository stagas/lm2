import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Ring } from 'utils/ring'
import WaveFFT from '../../vendor/WaveFFT/WaveFFT.js'
import type { AnalyserRef } from '../bytecode.ts'
import { WaveformBuffer } from '../lib/waveform-buffer.ts'
import type { ProgramInstance } from './program.ts'
import { getCurrentTheme } from './theme.ts'

type UseAnalyserWidgetParams = {
  program1: ProgramInstance | undefined
  ringPos: Uint8Array<SharedArrayBuffer> | undefined
  analyserRefs: AnalyserRef[]
  dspSource: string
  showWidgets: boolean
  playbackState: 'stopped' | 'running' | 'paused'
  sampleRate: number | undefined
}

type AnalyserState = {
  waveform: WaveformBuffer
  floats: Float32Array | null
}

type FftState = {
  fft: any
  window: Float32Array
  windowed: Float32Array
}

type Offscreen2d = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type AmpCanvas = OffscreenCanvas | HTMLCanvasElement

type AmpCanvasState = {
  canvas: AmpCanvas
  ctx: Offscreen2d
  pxW: number
  pxH: number
  dpr: number
  col: number
  bg: string
}

type SpectrumCache = {
  barCount: number
  sr: number
  frequencyBinCount: number
  binIndex: Int32Array
  binFrac: Float32Array
  prefix: Float32Array
}

const INV_LN10 = 1 / Math.LN10

function drawWaveform(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  floats: Float32Array,
) {
  if (w <= 1 || h <= 1) return

  const w0 = w | 0
  if (w0 <= 1) return

  const scale = floats.length / w0
  const mid = y + h / 2
  const amp = h * 0.5

  c.beginPath()
  c.moveTo(x, mid - floats[0]! * amp)
  for (let i = 1; i < w0; i++) {
    const idx = (i * scale) | 0
    c.lineTo(x + i, mid - floats[idx]! * amp)
  }
  c.strokeStyle = 'rgba(180, 180, 180, 0.9)'
  c.lineWidth = 1.35
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.stroke()
}

function drawSpectrum(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  floats: Float32Array,
  fftState: FftState | null,
  animatedHeightsArr: Array<Float32Array | undefined>,
  analyserIndex: number,
  sampleRate: number | undefined,
  cacheMap: Map<number, SpectrumCache>,
) {
  if (w <= 1 || h <= 1) return
  if (!fftState) return

  const { fft, window, windowed } = fftState
  const fftSize = windowed.length

  if (floats.length < fftSize) return

  for (let i = 0; i < fftSize; i++) {
    windowed[i] = floats[i]! * window[i]!
  }

  const result = fft.fft(windowed)
  const magnitudes = fft.getMagnitudeSpectrum(result) as Float32Array
  const frequencyBinCount = magnitudes.length
  if (frequencyBinCount <= 1) return

  const sr = (sampleRate ?? 48000) | 0
  const nyquist = Math.max(1, sr / 2)
  const minFreq = 20
  const maxFreq = Math.min(20000, nyquist)

  const w0 = w | 0
  const barCount = Math.max(1, Math.min(256, w0, frequencyBinCount))
  const barWidth = w / barCount

  let animatedHeights = animatedHeightsArr[analyserIndex]
  if (!animatedHeights || animatedHeights.length !== barCount) {
    animatedHeights = new Float32Array(barCount)
    animatedHeightsArr[analyserIndex] = animatedHeights
  }

  const minDecibels = -40
  const maxDecibels = 65
  const gravity = 0.025 * h

  const cacheKey = barCount * 1_000_000_000 + sr * 10_000 + frequencyBinCount
  let cache = cacheMap.get(cacheKey)
  if (!cache) {
    const binIndex = new Int32Array(barCount)
    const binFrac = new Float32Array(barCount)

    const ratio = maxFreq / minFreq
    const logRatio = Math.log(ratio)
    const binScale = (frequencyBinCount - 1) / nyquist
    const maxIdx = Math.max(0, frequencyBinCount - 2)

    for (let i = 0; i < barCount; i++) {
      const t = i / barCount
      const freq = minFreq * Math.exp(logRatio * t)
      const exact = freq * binScale
      let idx = Math.floor(exact)
      let frac = exact - idx
      if (idx < 0) {
        idx = 0
        frac = 0
      }
      else if (idx > maxIdx) {
        idx = maxIdx
        frac = 1
      }
      else if (frac < 0) frac = 0
      else if (frac > 1) frac = 1

      binIndex[i] = idx
      binFrac[i] = frac
    }

    cache = {
      barCount,
      sr,
      frequencyBinCount,
      binIndex,
      binFrac,
      prefix: new Float32Array(barCount + 1),
    }
    cacheMap.set(cacheKey, cache)
  }

  c.fillStyle = '#777'
  for (let i = 0; i < barCount; i++) {
    const idx = cache.binIndex[i]!
    const frac = cache.binFrac[i]!
    const value1 = magnitudes[idx]!
    const value2 = magnitudes[idx + 1]!
    const interpolatedValue = value1 + (value2 - value1) * frac

    const value = 20 * Math.log(interpolatedValue + 1e-10) * INV_LN10
    const norm = (value - minDecibels) / (maxDecibels - minDecibels)
    const clamped = norm < 0 ? 0 : norm > 1 ? 1 : norm

    const targetHeight = clamped * h
    const currentHeight = animatedHeights[i]!
    const newHeight = targetHeight > currentHeight ? targetHeight : Math.max(0, currentHeight - gravity)
    animatedHeights[i] = newHeight

    const bx = x + i * barWidth
    const by = y + h - newHeight
    c.fillRect(bx, by, Math.max(1, barWidth + 1), newHeight)
  }

  c.save()
  c.strokeStyle = '#ddd'
  c.lineWidth = 2
  c.beginPath()

  const movingAvgWindow = 8
  const halfWin = Math.floor(movingAvgWindow / 2)
  const prefix = cache.prefix
  prefix[0] = 0
  for (let i = 0; i < barCount; i++) {
    prefix[i + 1] = prefix[i]! + animatedHeights[i]!
  }

  for (let i = 0; i < barCount; i++) {
    const start = Math.max(0, i - halfWin)
    const end = Math.min(barCount - 1, i + halfWin)
    const count = end - start + 1
    const sum = prefix[end + 1]! - prefix[start]!
    const avgHeight = count ? sum / count : 0
    const cx = x + i * barWidth + barWidth / 2
    const cy = y + h - avgHeight
    if (i === 0) c.moveTo(cx, cy)
    else c.lineTo(cx, cy)
  }
  c.stroke()
  c.restore()
}

function drawAmplitudeScroller(
  c: CanvasRenderingContext2D,
  floats: Float32Array,
  x: number,
  y: number,
  w: number,
  h: number,
  ampCanvasArr: Array<AmpCanvasState | undefined>,
  analyserIndex: number,
  playbackState: 'stopped' | 'running' | 'paused',
  bg: string,
) {
  if (w <= 1 || h <= 1) return

  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
  const pxW = Math.max(1, Math.floor(w * dpr))
  const pxH = Math.max(1, Math.floor(h * dpr))

  const key = analyserIndex
  let st = ampCanvasArr[key]

  const ensureInitialized = (state: AmpCanvasState) => {
    const { canvas, ctx } = state
    canvas.width = state.pxW
    canvas.height = state.pxH
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = state.bg
    ctx.fillRect(0, 0, state.pxW, state.pxH)
    const cy = (state.pxH / 2) | 0
    ctx.strokeStyle = 'rgba(180, 180, 180, 0.9)'
    ctx.lineWidth = 1.35 * dpr
    ctx.beginPath()
    ctx.moveTo(0, cy)
    ctx.lineTo(state.pxW, cy)
    ctx.stroke()
  }

  if (!st) {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(pxW, pxH)
      : (() => {
        const el = document.createElement('canvas')
        el.width = pxW
        el.height = pxH
        return el
      })()

    const ctx2 = canvas.getContext('2d') as Offscreen2d | null
    if (!ctx2) return

    st = { canvas, ctx: ctx2, pxW, pxH, dpr, col: pxW - 1, bg }
    ensureInitialized(st)
    ampCanvasArr[key] = st
  }
  else if (st.pxW !== pxW || st.pxH !== pxH || st.dpr !== dpr || st.bg !== bg) {
    st.pxW = pxW
    st.pxH = pxH
    st.dpr = dpr
    st.bg = bg
    st.col = Math.min(st.col, pxW - 1)
    ensureInitialized(st)
  }

  const offscreen = st.canvas
  const offCtx = st.ctx

  let peak = 0
  const N = Math.min(floats.length, 1024)
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(floats[i]!))

  if (playbackState === 'running') {
    st.col = (st.col + 1) % st.pxW
  }

  const drawX = st.col
  const cy = (st.pxH / 2) | 0

  offCtx.fillStyle = st.bg
  offCtx.fillRect(drawX, 0, 1, st.pxH)

  offCtx.strokeStyle = 'rgba(180, 180, 180, 0.9)'
  offCtx.lineWidth = 1.35 * dpr
  offCtx.beginPath()
  offCtx.moveTo(drawX, cy)
  offCtx.lineTo(drawX + 1, cy)
  offCtx.stroke()

  const ampBarHeight = Math.max(1, Math.min(st.pxH, peak * st.pxH))
  const ampY = (st.pxH - ampBarHeight) / 2
  if (Number.isFinite(peak) && Number.isFinite(ampBarHeight) && Number.isFinite(ampY)) {
    const grad = offCtx.createLinearGradient(drawX, ampY, drawX, ampY + ampBarHeight)
    if (peak > 1) {
      grad.addColorStop(0, '#999')
      grad.addColorStop(0.5, '#999')
      grad.addColorStop(1, '#999')
    }
    else {
      grad.addColorStop(0.2, 'rgba(150, 150, 150, 0.5)')
      grad.addColorStop(0.5, 'rgba(180, 180, 180, 0.9)')
      grad.addColorStop(0.8, 'rgba(150, 150, 150, 0.5)')
    }
    offCtx.fillStyle = grad
    offCtx.fillRect(drawX, ampY, 1, ampBarHeight)
  }

  const smoothing = c.imageSmoothingEnabled
  c.imageSmoothingEnabled = false
  const start = (st.col + 1) % st.pxW
  const w1 = st.pxW - start
  const dw1 = w * (w1 / st.pxW)
  c.drawImage(offscreen as unknown as CanvasImageSource, start, 0, w1, st.pxH, x, y, dw1, h)
  if (start > 0) {
    c.drawImage(offscreen as unknown as CanvasImageSource, 0, 0, start, st.pxH, x + dw1, y, w - dw1, h)
  }
  c.imageSmoothingEnabled = smoothing
}

export function useAnalyserWidget({
  program1,
  ringPos,
  analyserRefs,
  dspSource,
  showWidgets,
  playbackState,
  sampleRate,
}: UseAnalyserWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const analyserStateRef = useRef<Array<AnalyserState | undefined>>([])
  const fftRef = useRef<FftState | null>(null)
  const ampCanvasRef = useRef<Array<AmpCanvasState | undefined>>([])
  const animatedSpectrumHeightsRef = useRef<Array<Float32Array | undefined>>([])
  const spectrumCacheRef = useRef<Map<number, SpectrumCache>>(new Map())
  const seenRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (fftRef.current) return
    let isAlive = true

    const fftSize = 8192
    const fft = new WaveFFT(fftSize)
    void fft.init().then(() => {
      if (!isAlive) return
      fftRef.current = {
        fft,
        window: WaveFFT.blackman(fftSize),
        windowed: new Float32Array(fftSize),
      }
    })

    return () => {
      isAlive = false
    }
  }, [])

  // useEffect(() => {
  //   // for (const st of analyserStateRef.current) {
  //   //   st?.waveform.reset()
  //   //   if (st) st.floats = null
  //   // }
  //   ampCanvasRef.current.length = 0
  //   animatedSpectrumHeightsRef.current.length = 0
  //   spectrumCacheRef.current.clear()
  //   seenRef.current.clear()
  // }, [dspSource])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!program1?.program?.analyserOuts || !ringPos) return
    if (analyserRefs.length === 0) return

    const currentChunkPos = Atomics.load(ringPos, 0)
    const stArr = analyserStateRef.current
    const seen = seenRef.current
    seen.clear()
    for (const ref of analyserRefs) {
      const analyserIndex = ref.analyserIndex | 0
      if (seen.has(analyserIndex)) continue
      seen.add(analyserIndex)

      const ring = program1.program.analyserOuts[analyserIndex] as Ring | undefined
      if (!ring) continue

      let st = stArr[analyserIndex]
      if (!st) {
        st = { waveform: new WaveformBuffer(), floats: null }
        stArr[analyserIndex] = st
      }

      const floats = st.waveform.update(ring, currentChunkPos)
      if (floats) st.floats = floats
    }
  }, [showWidgets, program1, ringPos, analyserRefs])

  const drawAnalyser = useCallback((
    c: CanvasRenderingContext2D,
    analyserIndex: number,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
  ) => {
    const st = analyserStateRef.current[analyserIndex]
    const floats = st?.floats
    if (!floats) return

    const x = viewX
    const w = viewWidth
    const h = Math.max(40, widgetHeight)

    c.save()
    c.translate(x, widgetY)
    c.beginPath()
    c.rect(0, 0, w, h)
    c.clip()

    const theme = getCurrentTheme()
    c.fillStyle = theme.background
    c.fillRect(0, 0, w, h)

    const third = Math.floor(w / 3)
    const leftW = third
    const midW = third
    const rightW = w - leftW - midW

    drawSpectrum(
      c,
      0,
      0,
      leftW,
      h,
      floats,
      fftRef.current,
      animatedSpectrumHeightsRef.current,
      analyserIndex,
      sampleRate,
      spectrumCacheRef.current,
    )
    drawAmplitudeScroller(
      c,
      floats,
      leftW,
      0,
      midW,
      h,
      ampCanvasRef.current,
      analyserIndex,
      playbackState,
      theme.background,
    )
    drawWaveform(c, leftW + midW, 0, rightW, h, floats)

    c.restore()
  }, [playbackState, sampleRate])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (analyserRefs.length === 0) return []

    const out: EditorWidget[] = []
    for (const ref of analyserRefs) {
      out.push({
        type: 'above',
        line: ref.loc.line,
        column: 1,
        length: 1,
        height: 70,
        render: (ctx, _x, y, _w, h, vx, vw) => {
          drawAnalyser(ctx, ref.analyserIndex, y, h, vx, vw)
        },
      })
    }
    return out
  }, [showWidgets, analyserRefs, drawAnalyser])

  return { widgets, onBeforeDraw }
}
