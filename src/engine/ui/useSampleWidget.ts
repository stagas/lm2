import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import {
  CHUNK_SIZE,
  SAMPLE_NEEDLE_DATA_OFFSET,
  SAMPLE_NEEDLE_ENTRY_SIZE,
  SAMPLE_NEEDLE_HISTORY_SIZE,
} from '../../../as/assembly/constants.ts'
import type { SampleDef } from '../bytecode/bytecode.ts'
import { computePeaks } from '../dsp/peaks.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { useEngineDspStore } from '../store.ts'
import { createGreyVerticalGradient } from './grey-gradient.ts'
import { getCurrentTheme } from './theme.ts'
import { updatePredictedSampleCount } from './update-predicted-sample-count.ts'
import {
  createWidgetCanvas,
  getWidgetContext,
  type Widget2DContext,
  type WidgetCanvas,
} from './widget-canvas.ts'

type UseSampleWidgetParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  sampleDefs: SampleDef[]
  dspSource: string
  showWidgets: boolean
  playbackState: 'stopped' | 'running' | 'paused'
}

type NeedleState = {
  posFrames: number
  rawPosFrames: number
  atSampleCount: number
  speed: number
  playing: boolean
}

type WaveCache = {
  pxW: number
  pxH: number
  dpr: number
  bg: string
  canvas: WidgetCanvas
}

function renderWaveformToCanvas(
  canvas: WidgetCanvas,
  ch0: Float32Array<ArrayBuffer>,
  w: number,
  h: number,
  dpr: number,
  bg: string,
) {
  const ctx = getWidgetContext(canvas) as Widget2DContext | null
  if (!ctx) return

  const pxW = Math.max(1, Math.floor(w * dpr))
  const pxH = Math.max(1, Math.floor(h * dpr))

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, pxW, pxH)

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, pxW, pxH)

  const peaks = computePeaks(ch0, pxW)
  const mid = pxH / 2
  const amp = pxH * 0.45

  ctx.lineWidth = 1.35 * dpr
  ctx.lineCap = 'round'

  for (let i = 0; i < pxW; i++) {
    const base = i * 2
    const mn = peaks[base] ?? 0
    const mx = peaks[base + 1] ?? 0
    const y1 = mid - mx * amp
    const y2 = mid - mn * amp
    const isHot = Math.max(Math.abs(mn), Math.abs(mx)) > 1
    ctx.strokeStyle = createGreyVerticalGradient(ctx, i + 0.5, y1, y2, isHot)
    ctx.beginPath()
    ctx.moveTo(i + 0.5, y1)
    ctx.lineTo(i + 0.5, y2)
    ctx.stroke()
  }

  // ctx.strokeStyle = 'rgba(180, 180, 180, 0.65)'
  // ctx.lineWidth = 1 * dpr
  // ctx.beginPath()
  // ctx.moveTo(0, mid + 0.5)
  // ctx.lineTo(pxW, mid + 0.5)
  // ctx.stroke()

  ctx.restore()
}

function drawPlaceholder(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (w <= 1 || h <= 1) return

  const theme = getCurrentTheme()
  c.save()
  c.translate(x, y)
  c.beginPath()
  c.rect(0, 0, w, h)
  c.clip()

  c.fillStyle = theme.background
  c.fillRect(0, 0, w, h)

  const mid = h / 2
  c.strokeStyle = 'rgba(180, 180, 180, 0.65)'
  c.lineWidth = 1.35
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(0, mid)
  c.lineTo(w, mid)
  c.stroke()

  c.restore()
}

function drawSample(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ch0: Float32Array<ArrayBuffer>,
  waveRef: preact.RefObject<WeakMap<ArrayBuffer, Map<string, WaveCache>>>,
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

  const key = `${pxW}:${pxH}:${dpr}:${bg}`
  const buf = ch0.buffer
  let byBuf = waveRef.current.get(buf)
  if (!byBuf) {
    byBuf = new Map()
    waveRef.current.set(buf, byBuf)
  }

  const cached = byBuf.get(key)
  let canvas = cached?.canvas
  if (!cached || cached.pxW !== pxW || cached.pxH !== pxH || cached.dpr !== dpr || cached.bg !== bg || !canvas) {
    canvas = createWidgetCanvas(pxW, pxH)
    renderWaveformToCanvas(canvas, ch0, w, h, dpr, bg)
    byBuf.set(key, { pxW, pxH, dpr, bg, canvas })
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
  audioContext,
  globalSampleCount,
  sampleDefs,
  dspSource,
  showWidgets,
  playbackState,
}: UseSampleWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const lastWritePosRef = useRef<number>(0)
  const needleRef = useRef<Map<number, NeedleState>>(new Map())
  const waveRef = useRef<WeakMap<ArrayBuffer, Map<string, WaveCache>>>(new WeakMap())
  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)
  const lastSampleCountRef = useRef<number | null>(null)
  const latencySamplesRef = useRef<number>(0)

  useEffect(() => {
    lastWritePosRef.current = 0
    needleRef.current.clear()
    predictedSampleCountRef.current = null
    lastWallTimeRef.current = null
    isFirstFrameRef.current = true
    lastSampleCountRef.current = null
    latencySamplesRef.current = 0
  }, [dspSource])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    const history = program1?.program.sampleNeedleHistory
    if (!history) return

    const writePos = Math.floor(history.writePos) >>> 0
    if (playbackState !== 'running') {
      lastWritePosRef.current = writePos
      predictedSampleCountRef.current = null
      lastWallTimeRef.current = null
      isFirstFrameRef.current = true
      lastSampleCountRef.current = null
      latencySamplesRef.current = 0
      return
    }
    const pred = updatePredictedSampleCount(audioContext, globalSampleCount, {
      predictedSampleCountRef,
      lastWallTimeRef,
      isFirstFrameRef,
    }, { isPlaying: true })
    if (!pred) return
    const { sampleRate, sampleCount } = pred
    if (!globalSampleCount) return

    const lastSampleCount = lastSampleCountRef.current ?? sampleCount
    lastSampleCountRef.current = sampleCount
    const dtSec = Math.max(0, (sampleCount - lastSampleCount) / sampleRate)

    const latencySeconds = (audioContext?.outputLatency || 0) - (audioContext?.baseLatency || 0)
    const latencySamplesNow = latencySeconds * sampleRate
    const latencyTau = 0.35
    const latencyA = 1 - Math.exp(-dtSec / latencyTau)
    const latencySamples = latencySamplesRef.current + (latencySamplesNow - latencySamplesRef.current) * latencyA
    latencySamplesRef.current = latencySamples
    const MOD = 1 << 20
    const rawNow = (Atomics.load(globalSampleCount, 0) >>> 0) as number
    const rawNowEnd = rawNow + CHUNK_SIZE
    const nowMod = rawNowEnd & (MOD - 1)

    const prevWritePos = lastWritePosRef.current >>> 0
    lastWritePosRef.current = writePos

    const needles = needleRef.current

    if (writePos !== prevWritePos) {
      const raw = history.raw
      const deltaRaw = (writePos - prevWritePos + MOD) % MOD
      const delta = Math.min(deltaRaw, SAMPLE_NEEDLE_HISTORY_SIZE)

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

        const tsRaw = raw[base + 3] ?? 0
        const tsMod = Math.floor(tsRaw) >>> 0

        const prev = needles.get(sampleIndex)
        let speed = prev?.speed ?? 1
        const deltaSamples = prev ? (tsMod - prev.atSampleCount + MOD) % MOD : 0
        if (prev && prev.playing && deltaSamples >= CHUNK_SIZE) {
          speed = (posFrames - prev.rawPosFrames) / deltaSamples
        }

        const compensated = posFrames - latencySamples * speed
        const initPos = (!prev || !prev.playing) ? compensated : prev.posFrames

        const jump = prev ? (posFrames - prev.rawPosFrames) : 0
        const isRetrig = prev && prev.playing && jump < -64
        const isTeleport = prev && prev.playing && Math.abs(jump) > 200000

        needles.set(sampleIndex, {
          posFrames: (isRetrig || isTeleport) ? compensated : initPos,
          rawPosFrames: posFrames,
          atSampleCount: tsMod,
          speed,
          playing: true,
        })
      }
    }

    for (const st of needles.values()) {
      if (!st.playing) continue
      const ageSamples = (nowMod - st.atSampleCount + MOD) % MOD
      const target = st.rawPosFrames + ageSamples * st.speed - latencySamples * st.speed
      const diff = target - st.posFrames
      if (Math.abs(diff) > 200000) {
        st.posFrames = target
        continue
      }
      const tau = latencySeconds / 2
      const a = 1 - Math.exp(-dtSec / tau)
      st.posFrames = st.posFrames + diff * a
    }
  }, [showWidgets, program1, audioContext, globalSampleCount, playbackState])

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

    const loaded = useEngineDspStore.getState().loadedSamples[sampleIndex]
    const ch0 = loaded?.ch0
    if (!ch0) {
      drawPlaceholder(c, x, widgetY, w, h)
      return
    }

    const needle = needleRef.current.get(sampleIndex)
    drawSample(c, x, widgetY, w, h, ch0, waveRef, needle)
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
