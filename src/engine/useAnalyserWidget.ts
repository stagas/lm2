import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Ring } from 'utils/ring'
import WaveFFT from '../../vendor/WaveFFT/WaveFFT.js'
import type { AnalyserRef } from '../bytecode.ts'
import { WaveformBuffer } from '../lib/waveform-buffer.ts'
import type { ProgramInstance } from './program.ts'

type UseAnalyserWidgetParams = {
  program1: ProgramInstance | undefined
  ringPos: Uint8Array<SharedArrayBuffer> | undefined
  analyserRefs: AnalyserRef[]
  dspSource: string
  showWidgets: boolean
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

function drawWaveform(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  floats: Float32Array,
) {
  if (w <= 1 || h <= 1) return

  const scale = floats.length / w
  const mid = y + h / 2
  const amp = h * 0.45

  c.beginPath()
  c.moveTo(x, mid - floats[0]! * amp)
  for (let i = 1; i < w; i++) {
    const idx = (i * scale) | 0
    c.lineTo(x + i, mid - floats[idx]! * amp)
  }
  c.strokeStyle = 'rgba(255, 255, 255, 0.9)'
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

  const minDecibels = -40
  const maxDecibels = 65

  const barCount = w
  const barWidth = w / barCount

  for (let i = 0; i < barCount; i++) {
    const t = i / (barCount - 1 || 1)
    const idx = Math.floor(
      (frequencyBinCount - 1) * Math.pow(frequencyBinCount - 1 || 1, t) / (frequencyBinCount - 1 || 1),
    )
    const magnitude = magnitudes[idx] ?? 0
    const value = 20 * Math.log10(magnitude + 1e-10)
    const norm = (value - minDecibels) / (maxDecibels - minDecibels)
    const clamped = norm < 0 ? 0 : norm > 1 ? 1 : norm
    const barHeight = clamped * h
    const bx = x + i * barWidth
    c.fillStyle = 'rgba(0, 255, 120, 0.9)'
    c.fillRect(bx, y + h - barHeight, barWidth, barHeight)
  }
}

export function useAnalyserWidget({
  program1,
  ringPos,
  analyserRefs,
  dspSource,
  showWidgets,
}: UseAnalyserWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const analyserStateRef = useRef<Map<number, AnalyserState>>(new Map())
  const fftRef = useRef<FftState | null>(null)

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

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!program1?.program?.analyserOuts || !ringPos) return
    if (analyserRefs.length === 0) return

    const currentChunkPos = Atomics.load(ringPos, 0)
    const stMap = analyserStateRef.current

    const seen = new Set<number>()
    for (const ref of analyserRefs) {
      const analyserIndex = ref.analyserIndex | 0
      if (seen.has(analyserIndex)) continue
      seen.add(analyserIndex)

      const ring = program1.program.analyserOuts[analyserIndex] as Ring | undefined
      if (!ring) continue

      let st = stMap.get(analyserIndex)
      if (!st) {
        st = { waveform: new WaveformBuffer(), floats: null }
        stMap.set(analyserIndex, st)
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
    const st = analyserStateRef.current.get(analyserIndex)
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

    c.fillStyle = 'rgba(0, 0, 0, 0.35)'
    c.fillRect(0, 0, w, h)

    const leftW = Math.floor(w / 2)
    const rightW = w - leftW

    c.fillStyle = 'rgba(0, 0, 0, 0.25)'
    c.fillRect(0, 0, leftW, h)
    c.fillRect(leftW, 0, rightW, h)

    c.strokeStyle = 'rgba(255, 255, 255, 0.12)'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(leftW + 0.5, 0)
    c.lineTo(leftW + 0.5, h)
    c.stroke()

    drawWaveform(c, 0, 0, leftW, h, floats)
    drawSpectrum(c, leftW, 0, rightW, h, floats, fftRef.current)

    c.restore()
  }, [])

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
  }, [showWidgets, analyserRefs, dspSource, drawAnalyser])

  return { widgets, onBeforeDraw }
}
