import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  SAMPLE_NEEDLE_DATA_OFFSET,
  SAMPLE_NEEDLE_ENTRY_SIZE,
  SAMPLE_NEEDLE_HISTORY_SIZE,
} from '../../as/assembly/constants.ts'
import type { SampleDef } from '../bytecode.ts'
import type { ProgramInstance } from './program.ts'
import { useEngineStore } from './store.ts'
import { getCurrentTheme } from './theme.ts'

type UseSampleWidgetParams = {
  program1: ProgramInstance | undefined
  sampleDefs: SampleDef[]
  dspSource: string
  showWidgets: boolean
  playbackState: 'stopped' | 'running' | 'paused'
}

type NeedleState = {
  posFrames: number
  playing: boolean
}

type WaveCanvas = OffscreenCanvas | HTMLCanvasElement

type Any2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

type WaveCache = {
  ch0Buffer: ArrayBuffer
  pxW: number
  pxH: number
  dpr: number
  bg: string
  canvas: WaveCanvas
}

function computePeaks(ch0: Float32Array, pxW: number): Float32Array {
  const len = ch0.length | 0
  const w = Math.max(1, pxW | 0)
  const out = new Float32Array(w * 2)

  if (len <= 0) {
    out.fill(0)
    return out
  }

  for (let i = 0; i < w; i++) {
    const from = Math.floor((i * len) / w)
    const to = Math.floor(((i + 1) * len) / w)
    const a = Math.max(0, Math.min(len - 1, from))
    const b = Math.max(a + 1, Math.min(len, to))

    let mn = ch0[a] ?? 0
    let mx = mn
    for (let j = a + 1; j < b; j++) {
      const v = ch0[j] ?? 0
      if (v < mn) mn = v
      if (v > mx) mx = v
    }

    const base = i * 2
    out[base] = mn
    out[base + 1] = mx
  }

  return out
}

function createWaveCanvas(pxW: number, pxH: number): WaveCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(pxW, pxH)
  const canvas = document.createElement('canvas')
  canvas.width = pxW
  canvas.height = pxH
  return canvas
}

function getWaveContext(canvas: WaveCanvas): Any2DContext | null {
  return canvas.getContext('2d') as Any2DContext | null
}

function renderWaveformToCanvas(
  canvas: WaveCanvas,
  ch0: Float32Array<ArrayBuffer>,
  w: number,
  h: number,
  dpr: number,
  bg: string,
) {
  const ctx = getWaveContext(canvas)
  if (!ctx) return

  const pxW = Math.max(1, Math.floor(w * dpr))
  const pxH = Math.max(1, Math.floor(h * dpr))

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, pxW, pxH)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  const peaks = computePeaks(ch0, pxW)
  const mid = h / 2
  const amp = h * 0.45

  ctx.strokeStyle = 'rgba(180, 180, 180, 0.9)'
  ctx.lineWidth = 1.35
  ctx.lineCap = 'round'

  ctx.beginPath()
  for (let i = 0; i < pxW; i++) {
    const base = i * 2
    const mn = peaks[base] ?? 0
    const mx = peaks[base + 1] ?? 0
    const xi = (i / pxW) * w
    const y1 = mid - mx * amp
    const y2 = mid - mn * amp
    ctx.moveTo(xi, y1)
    ctx.lineTo(xi, y2)
  }
  ctx.stroke()

  ctx.strokeStyle = 'rgba(180, 180, 180, 0.65)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, mid)
  ctx.lineTo(w, mid)
  ctx.stroke()

  ctx.restore()
}

function drawSample(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ch0: Float32Array<ArrayBuffer>,
  waveRef: React.RefObject<Map<number, WaveCache>>,
  sampleIndex: number,
  needle: NeedleState | undefined,
) {
  if (w <= 1 || h <= 1) return

  const theme = getCurrentTheme()
  c.save()
  c.translate(x, y)
  c.beginPath()
  c.rect(0, 0, w, h)
  c.clip()

  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
  const pxW = Math.max(1, Math.floor(w * dpr))
  const pxH = Math.max(1, Math.floor(h * dpr))
  const bg = theme.background

  const cached = waveRef.current.get(sampleIndex)
  let canvas = cached?.canvas
  if (!cached || cached.ch0Buffer !== ch0.buffer || cached.pxW !== pxW || cached.pxH !== pxH || cached.dpr !== dpr
    || cached.bg !== bg || !canvas)
  {
    canvas = createWaveCanvas(pxW, pxH)
    renderWaveformToCanvas(canvas, ch0, w, h, dpr, bg)
    waveRef.current.set(sampleIndex, { ch0Buffer: ch0.buffer, pxW, pxH, dpr, bg, canvas })
  }

  c.drawImage(canvas, 0, 0, w, h)

  if (needle?.playing && ch0.length > 1) {
    const pos = needle.posFrames
    const t = pos / (ch0.length - 1)
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t
    const nx = clamped * w
    c.strokeStyle = '#ff0e'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(nx, 0)
    c.lineTo(nx, h)
    c.stroke()
  }

  c.restore()
}

export function useSampleWidget({
  program1,
  sampleDefs,
  dspSource,
  showWidgets,
  playbackState,
}: UseSampleWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const lastWritePosRef = useRef<number>(0)
  const needleRef = useRef<Map<number, NeedleState>>(new Map())
  const waveRef = useRef<Map<number, WaveCache>>(new Map())

  useEffect(() => {
    lastWritePosRef.current = 0
    needleRef.current.clear()
    waveRef.current.clear()
  }, [dspSource])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    const history = program1?.program.sampleNeedleHistory
    if (!history) return

    const writePos = Math.floor(history.writePos) >>> 0
    if (playbackState !== 'running') {
      lastWritePosRef.current = writePos
      // needleRef.current.clear()
      return
    }
    const prevWritePos = lastWritePosRef.current >>> 0
    lastWritePosRef.current = writePos

    if (writePos === prevWritePos) return

    const raw = history.raw
    const MOD = 1 << 20
    const deltaRaw = (writePos - prevWritePos + MOD) % MOD
    const delta = Math.min(deltaRaw, SAMPLE_NEEDLE_HISTORY_SIZE)

    const needles = needleRef.current
    for (let k = delta; k > 0; k--) {
      const p = (writePos - k) >>> 0
      const slot = p % SAMPLE_NEEDLE_HISTORY_SIZE
      const base = SAMPLE_NEEDLE_DATA_OFFSET + slot * SAMPLE_NEEDLE_ENTRY_SIZE
      const sampleIndex = Math.floor(raw[base] ?? 0)
      const posFrames = raw[base + 1] ?? 0
      const playing = (raw[base + 2] ?? 0) > 0
      if (sampleIndex < 0) continue
      if (!playing) {
        needles.delete(sampleIndex)
        continue
      }
      needles.set(sampleIndex, { posFrames, playing: true })
    }
  }, [showWidgets, program1, playbackState])

  const draw = useCallback((
    c: CanvasRenderingContext2D,
    sampleIndex: number,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
  ) => {
    const x = viewX
    const w = viewWidth
    const h = Math.max(40, widgetHeight)

    const loaded = useEngineStore.getState().loadedSamples[sampleIndex]
    const ch0 = loaded?.ch0
    if (!ch0) return

    const needle = needleRef.current.get(sampleIndex)
    drawSample(c, x, widgetY, w, h, ch0, waveRef, sampleIndex, needle)
  }, [])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (sampleDefs.length === 0) return []

    const out: EditorWidget[] = []
    for (const def of sampleDefs) {
      out.push({
        type: 'above',
        line: def.loc.line,
        column: 1,
        length: 1,
        height: 40,
        render: (ctx, _x, y, _w, h, vx, vw) => {
          draw(ctx, def.sampleIndex, y, h, vx, vw)
        },
      })
    }
    return out
  }, [showWidgets, sampleDefs, draw])

  return { widgets, onBeforeDraw }
}
