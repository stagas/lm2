import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import type { Ring } from 'utils/ring'
import WaveFFT from '../../../vendor/WaveFFT/WaveFFT.js'
import { WaveformBuffer } from '../../lib/waveform-buffer.ts'
import type { AnalyserRef } from '../bytecode/bytecode.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { createGreyVerticalGradient } from './grey-gradient.ts'
import { getCurrentTheme } from './theme.ts'

type UseAnalyserWidgetParams = {
  program1: ProgramInstance | undefined
  ringPos: Uint8Array<SharedArrayBuffer> | undefined
  analyserRefs: AnalyserRef[]
  dspSource: string
  showWidgets: boolean
  isLive: boolean
  playbackState: 'stopped' | 'running' | 'paused'
  sampleRate: number | undefined
  loopId: string
  playingLoopId: string | null
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
  avgHeights: Float32Array
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
  for (let i = 1; i < w0; i += 2) {
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

  w += 1
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
      avgHeights: new Float32Array(barCount),
    }
    cacheMap.set(cacheKey, cache)
  }

  const fadeWidth = Math.min(64, w * 0.05)
  const fadeStart = Math.max(0, w - fadeWidth)
  // Also fade in
  const getFadeFactor = (pos: number) => {
    return 1
    if (fadeWidth <= 0) return 1
    // Fade-in
    if (pos < fadeWidth) {
      const inFactor = pos / fadeWidth
      return inFactor < 0 ? 0 : inFactor > 1 ? 1 : inFactor
    }
    // Fade-out
    if (pos > fadeStart) {
      const outFactor = 1 - (pos - fadeStart) / fadeWidth
      return outFactor < 0 ? 0 : outFactor > 1 ? 1 : outFactor
    }
    return 1
  }

  c.fillStyle = '#666'
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
    const barRight = (i + 1) * barWidth
    const fadeFactor = getFadeFactor(barRight)
    const drawHeight = newHeight * fadeFactor
    const bx = x + i * barWidth
    const by = y + h / 2 - drawHeight / 2 - 5
    c.fillRect(bx, by, Math.max(1, barWidth + 1), drawHeight)
  }

  c.save()
  c.strokeStyle = 'rgba(180, 180, 180, 0.7)'
  c.lineWidth = 1.35
  c.beginPath()

  const movingAvgWindow = 8
  const halfWin = Math.floor(movingAvgWindow / 2)
  const prefix = cache.prefix
  prefix[0] = 0
  const avgHeights = cache.avgHeights
  for (let i = 0; i < barCount; i++) {
    prefix[i + 1] = prefix[i]! + animatedHeights[i]!
  }

  for (let i = 0; i < barCount; i++) {
    const start = Math.max(0, i - halfWin)
    const end = Math.min(barCount - 1, i + halfWin)
    const count = end - start + 1
    const sum = prefix[end + 1]! - prefix[start]!
    avgHeights[i] = count ? sum / count : 0
  }

  const centerY = Math.floor(y + h / 2) - 0.35
  c.beginPath()
  for (let i = 0; i < barCount; i++) {
    const cx = x + i * barWidth + barWidth / 2
    const localPos = i * barWidth + barWidth / 2
    const drawAvg = avgHeights[i]! * getFadeFactor(localPos)
    const cyTop = centerY - drawAvg / 2
    if (i === 0) c.moveTo(cx, cyTop)
    else c.lineTo(cx, cyTop)
  }
  c.stroke()

  c.beginPath()
  for (let i = 0; i < barCount; i++) {
    const cx = x + i * barWidth + barWidth / 2
    const localPos = i * barWidth + barWidth / 2
    const drawAvg = avgHeights[i]! * getFadeFactor(localPos)
    const cyBottom = centerY + drawAvg / 2
    if (i === 0) c.moveTo(cx, cyBottom)
    else c.lineTo(cx, cyBottom)
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

  offCtx.fillStyle = '#000' // st.bg
  offCtx.fillRect(drawX, 0, 1, st.pxH)

  offCtx.strokeStyle = 'rgba(180, 180, 180, 0.9)'
  offCtx.lineWidth = 1.35 * dpr
  offCtx.beginPath()
  offCtx.moveTo(drawX, cy)
  offCtx.lineTo(drawX + 1, cy)
  offCtx.stroke()

  const ampBarHeight = Math.max(1, Math.min(st.pxH, (peak ** .5) * st.pxH))
  const ampY = (st.pxH - ampBarHeight) / 2
  if (Number.isFinite(peak) && Number.isFinite(ampBarHeight) && Number.isFinite(ampY)) {
    const grad = peak > 1 ? '#f00' : createGreyVerticalGradient(offCtx, drawX, ampY, ampY + ampBarHeight)
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

function drawInitLines(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  leftW: number,
  midW: number,
  rightW: number,
) {
  if (w <= 1 || h <= 1) return
  const cy = h / 2
  c.strokeStyle = 'rgba(180, 180, 180, 0.9)'
  c.lineWidth = 1.35
  c.lineCap = 'round'
  c.lineJoin = 'round'

  c.beginPath()
  c.moveTo(0, cy)
  c.lineTo(leftW, cy)
  c.moveTo(leftW, cy)
  c.lineTo(leftW + midW, cy)
  c.moveTo(leftW + midW, cy)
  c.lineTo(w, cy)
  c.stroke()
}

function drawLevelMeter(
  c: CanvasRenderingContext2D,
  floats: Float32Array,
  x: number,
  y: number,
  w: number,
  h: number,
  levels: Array<number | undefined>,
  analyserIndex: number,
) {
  if (w <= 1 || h <= 1) return

  const N = Math.min(floats.length, 1024)
  let sumSq = 0
  let peak = 0
  for (let i = 0; i < N; i++) {
    const v = floats[i]!
    sumSq += v * v
    peak = Math.max(peak, Math.abs(v))
  }
  const rms = Math.sqrt(sumSq / Math.max(1, N))

  const minDb = -60
  const maxDb = 0
  const db = 20 * Math.log10(rms + 1e-10)
  const norm = (db - minDb) / (maxDb - minDb)
  const clamped = norm < 0 ? 0 : norm > 1 ? 1 : norm

  const prev = levels[analyserIndex] ?? 0
  const fall = 0.035
  const next = clamped > prev ? clamped : Math.max(0, prev - fall)
  levels[analyserIndex] = next

  c.save()
  c.translate(x, y)

  const pad = 0
  const innerW = Math.max(1, w - pad * 2)
  const innerH = Math.max(1, h - pad * 2)

  const fillW = Math.max(1, innerW * next)
  const barX = pad
  const barY = pad

  // Create horizontal gradient from left to right
  const grad = c.createLinearGradient(barX, 0, barX + innerW, 0)
  grad.addColorStop(0, '#07f')
  grad.addColorStop(0.2, '#0f0')
  grad.addColorStop(0.7, '#ff0')
  grad.addColorStop(0.95, '#f00')

  c.fillStyle = grad
  c.fillRect(barX, barY + innerH - 13, fillW, 10)

  const peakDb = 20 * Math.log10(peak + 1e-10)
  c.fillStyle = 'rgba(255, 255, 255, 0.7)'
  c.font = '7pt "Space Mono"'
  c.textAlign = 'right'
  c.textBaseline = 'middle'
  // c.fillText(`${db.toFixed(1)} dB`, w - 6, h / 2 - 7)
  c.fillText(`${peakDb.toFixed(1)} dB`, w - 6, h - 20)
  c.restore()
}

function drawPrintValues(
  c: CanvasRenderingContext2D,
  floats: Float32Array,
  x: number,
  y: number,
  w: number,
  h: number,
  analyserIndex: number,
) {
  if (w <= 1 || h <= 1) return

  const N = floats.length
  const last = N > 0 ? floats[N - 1]! : 0
  const a = N > 1 ? floats[(N * 0.25) | 0]! : last
  const b = N > 2 ? floats[(N * 0.5) | 0]! : last
  const d = N > 3 ? floats[(N * 0.75) | 0]! : last

  let peak = 0
  const M = Math.min(N, 1024)
  for (let i = 0; i < M; i++) peak = Math.max(peak, Math.abs(floats[i]!))

  c.save()
  c.translate(x, y)

  c.fillStyle = 'rgba(255, 255, 255, 0.75)'
  c.font = '10pt "Space Mono"'
  c.textAlign = 'right'
  c.textBaseline = 'bottom'

  const line = `${last.toFixed(2)}`
  c.fillText(line, w - 2, h - 2)
  c.restore()
}

export function useAnalyserWidget({
  program1,
  ringPos,
  analyserRefs,
  dspSource,
  showWidgets,
  isLive,
  playbackState,
  sampleRate,
  loopId,
  playingLoopId,
}: UseAnalyserWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const analyserStateRef = useRef<Array<AnalyserState | undefined>>([])
  const fftRef = useRef<FftState | null>(null)
  const ampCanvasRef = useRef<Array<AmpCanvasState | undefined>>([])
  const animatedSpectrumHeightsRef = useRef<Array<Float32Array | undefined>>([])
  const levelRef = useRef<Array<number | undefined>>([])
  const spectrumCacheRef = useRef<Map<number, SpectrumCache>>(new Map())
  const seenRef = useRef<Set<number>>(new Set())
  const renderedThisFrameRef = useRef<Set<number>>(new Set())
  const lastLiveProgramPtrRef = useRef<number | null>(null)
  const lastLiveAnalyserKeyRef = useRef<string>('')

  const analyserKey = useMemo(() => {
    if (analyserRefs.length === 0) return ''
    const set = new Set<number>()
    for (const ref of analyserRefs) set.add(ref.analyserIndex | 0)
    return [...set].sort((a, b) => a - b).join(',')
  }, [analyserRefs])

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

  const lastLoopIdRef = useRef<string>('')

  useEffect(() => {
    const programPtr = program1?.program?.ptr$ ?? 0
    if (lastLiveProgramPtrRef.current === programPtr && lastLiveAnalyserKeyRef.current === analyserKey) return
    lastLiveProgramPtrRef.current = programPtr
    lastLiveAnalyserKeyRef.current = analyserKey

    // When switching programs (or analyser sets), reset ring readers so we don't display stale buffers.
    analyserStateRef.current.length = 0
    ampCanvasRef.current.length = 0
    animatedSpectrumHeightsRef.current.length = 0
    levelRef.current.length = 0
    spectrumCacheRef.current.clear()
    seenRef.current.clear()
    renderedThisFrameRef.current.clear()
  }, [analyserKey, program1])

  useEffect(() => {
    if (lastLoopIdRef.current === loopId) return
    lastLoopIdRef.current = loopId

    // When switching loops/projects, reset animated state so widgets don't show stale animations
    animatedSpectrumHeightsRef.current.length = 0
    levelRef.current.length = 0
    for (const ampState of ampCanvasRef.current) {
      if (ampState) ampState.col = 0
    }
  }, [loopId])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (analyserRefs.length === 0) return

    // Reset the rendered set for this frame
    renderedThisFrameRef.current.clear()

    const stArr = analyserStateRef.current
    const seen = seenRef.current
    seen.clear()

    // When not viewing the currently-loaded (playingLoopId) loop, clear analyser floats
    // so widgets show placeholders instead of stale data, unless nothing is currently playing
    // (in which case we preserve the last data).
    const shouldClear = playingLoopId !== null && playingLoopId !== loopId
    if (shouldClear) {
      for (const ref of analyserRefs) {
        const analyserIndex = ref.analyserIndex | 0
        const st = stArr[analyserIndex]
        if (st) st.floats = null
      }
      // Reset animated state when clearing to prevent stale animations
      animatedSpectrumHeightsRef.current.length = 0
      levelRef.current.length = 0
      for (const ampState of ampCanvasRef.current) {
        if (ampState) ampState.col = 0
      }
      return
    }

    if (!isLive) return

    const canRead = !!program1?.program?.analyserOuts && !!ringPos
    if (!canRead) return

    const currentChunkPos = Atomics.load(ringPos!, 0)
    for (const ref of analyserRefs) {
      const analyserIndex = ref.analyserIndex | 0
      if (seen.has(analyserIndex)) continue
      seen.add(analyserIndex)

      let st = stArr[analyserIndex]
      if (!st) {
        st = { waveform: new WaveformBuffer(), floats: null }
        stArr[analyserIndex] = st
      }

      const ring = program1!.program!.analyserOuts[analyserIndex] as Ring | undefined
      if (!ring) {
        continue
      }

      const floats = st.waveform.update(ring, currentChunkPos)
      if (floats) st.floats = floats
    }
  }, [showWidgets, analyserRefs, isLive, playbackState, program1, ringPos, loopId, playingLoopId])

  const drawWidget = useCallback((
    c: CanvasRenderingContext2D,
    kind: AnalyserRef['kind'],
    analyserIndex: number,
    widgetX: number,
    widgetY: number,
    widgetWidth: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
  ) => {
    const x = kind === 'analyser' ? viewX : widgetX
    const w = kind === 'analyser' ? viewWidth : widgetWidth
    const h = Math.max(40, widgetHeight)

    c.save()
    c.translate(x, widgetY)
    c.beginPath()
    c.rect(0, 0, w, h)
    c.clip()

    const theme = getCurrentTheme()
    c.fillStyle = theme.background
    c.fillRect(0, 0, w, h)

    const st = analyserStateRef.current[analyserIndex]
    const floats = st?.floats

    if (!floats) {
      if (kind === 'analyser') {
        const third = Math.floor(w / 3)
        const leftW = third
        const midW = third
        const rightW = w - leftW - midW
        drawInitLines(c, w, h, leftW, midW, rightW)
      }
      c.restore()
      return
    }

    const kindId = kind === 'analyser'
      ? 0
      : kind === 'spectrum'
      ? 1
      : kind === 'amplitude'
      ? 2
      : kind === 'waveform'
      ? 3
      : kind === 'level'
      ? 4
      : kind === 'print'
      ? 5
      : 5
    const renderKey = analyserIndex * 8 + kindId

    // Only do the expensive rendering work once per analyser+kind per frame
    if (!renderedThisFrameRef.current.has(renderKey)) {
      renderedThisFrameRef.current.add(renderKey)

      if (kind === 'analyser') {
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
      }
      else if (kind === 'spectrum') {
        drawSpectrum(
          c,
          0,
          0,
          w,
          h,
          floats,
          fftRef.current,
          animatedSpectrumHeightsRef.current,
          analyserIndex,
          sampleRate,
          spectrumCacheRef.current,
        )
      }
      else if (kind === 'amplitude') {
        drawAmplitudeScroller(
          c,
          floats,
          0,
          0,
          w,
          h,
          ampCanvasRef.current,
          analyserIndex,
          playbackState,
          theme.background,
        )
      }
      else if (kind === 'waveform') {
        drawWaveform(c, 0, 0, w, h, floats)
      }
      else if (kind === 'level') {
        drawLevelMeter(c, floats, 0, 0, w, h, levelRef.current, analyserIndex)
      }
      else {
        drawPrintValues(c, floats, 0, 0, w, h, analyserIndex)
      }
    }
    else {
      c.fillStyle = 'rgba(255, 255, 255, 0.05)'
      c.fillRect(0, 0, w, h)
    }

    c.restore()
  }, [playbackState, sampleRate])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (analyserRefs.length === 0) return []

    const out: EditorWidget[] = []
    for (const ref of analyserRefs) {
      out.push({
        type: 'above',
        line: ref.aboveLoc.line,
        column: ref.aboveLoc.column,
        length: Math.max(1, ref.aboveLoc.length),
        height: 40,
        culling: false,
        render: (ctx, x, y, w, h, vx, vw, vy) => {
          const widgetY = ref.kind === 'analyser' ? vy : y
          const widgetW = w
          drawWidget(ctx, ref.kind, ref.analyserIndex, x, widgetY, widgetW, h, vx, vw)
        },
      })
    }
    return out
  }, [showWidgets, analyserRefs, drawWidget])

  return { widgets, onBeforeDraw }
}
