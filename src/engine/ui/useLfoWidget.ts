import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import { LFO_DATA_OFFSET, LFO_ENTRY_SIZE, LFO_HISTORY_SIZE } from '../../../as/assembly/constants.ts'
import type { LfoRef } from '../bytecode/bytecode.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { getCurrentTheme } from './theme.ts'
type UseLfoWidgetParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  bpmValue: Float32Array<SharedArrayBuffer> | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  lfoRefs: LfoRef[] | undefined
  dspSource: string
  showWidgets: boolean
  isLive: boolean
  playbackState: 'stopped' | 'running' | 'paused'
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function fract(n: number): number {
  return n - Math.floor(n)
}

function samplesPerWholeNote(sampleRate: number, bpm: number): number {
  const safeBpm = Math.max(1e-6, bpm)
  return (60 / safeBpm) * sampleRate * 4
}

function lfoValue(type: LfoRef['lfoType'], phase01: number): number {
  const p = fract(phase01)
  if (type === 'sine') return 0.5 + 0.5 * Math.sin(p * Math.PI * 2)
  if (type === 'tri') {
    const q = fract(p + 0.25)
    const y11 = q < 0.5 ? 4 * q - 1 : 3 - 4 * q
    return 0.5 + 0.5 * y11
  }
  if (type === 'saw') return fract(p + 0.5)
  if (type === 'ramp') return 1 - fract(p + 0.5)
  if (type === 'sqr') return p < 0.5 ? phase01 >= 1 ? 0 : 1 : 0
  return 0
}

export function useLfoWidget({
  program1,
  audioContext,
  bpmValue,
  globalSampleCount,
  lfoRefs,
  dspSource,
  showWidgets,
  isLive,
  playbackState,
}: UseLfoWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const refs = lfoRefs ?? []

  type Pt = { tsMod: number; bar: number; offset: number; phase01: number; value: number }
  type St = { pts: Pt[]; bar: number; offset: number; phase01: number; value: number }

  const lastWritePosRef = useRef<number>(0)
  const stRef = useRef<Array<St | undefined>>([])
  const smoothedPlayheadRef = useRef<Array<{ phase01: number; value: number } | undefined>>([])

  useEffect(() => {
    lastWritePosRef.current = 0
    stRef.current.length = 0
    smoothedPlayheadRef.current.length = 0
  }, [dspSource])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!refs.length) return
    if (!isLive) return

    const history = program1?.program.lfoHistory
    if (!history) return

    const writePos = Math.floor(history.writePos) >>> 0
    if (playbackState !== 'running') {
      lastWritePosRef.current = writePos
      return
    }

    const pred = useEngineRuntimeStore.getState().predictedSampleCountResult
    if (!pred) return

    const MOD = 1 << 20
    const nowMod = (Math.floor(pred.sampleCount) >>> 0) & (MOD - 1)

    const prevWritePos = lastWritePosRef.current >>> 0
    lastWritePosRef.current = writePos

    if (writePos !== prevWritePos) {
      const raw = history.raw
      const deltaRaw = (writePos - prevWritePos + MOD) % MOD
      const delta = Math.min(deltaRaw, LFO_HISTORY_SIZE)

      for (let k = delta; k > 0; k--) {
        const p = (writePos - k) >>> 0
        const slot = p % LFO_HISTORY_SIZE
        const base = LFO_DATA_OFFSET + slot * LFO_ENTRY_SIZE

        const idx = Math.floor(raw[base] ?? 0)
        const bar = raw[base + 2] ?? 0
        const offset = raw[base + 3] ?? 0
        const phase01 = raw[base + 4] ?? 0
        const value = raw[base + 5] ?? 0
        const tsMod = (Math.floor(raw[base + 6] ?? 0) >>> 0) & (MOD - 1)
        if (idx < 0 || idx > 255) continue

        let st = stRef.current[idx]
        if (!st) {
          st = { pts: [], bar, offset, phase01, value }
          stRef.current[idx] = st
        }

        const pts = st.pts
        pts.push({ tsMod, bar, offset, phase01, value })
        const keep = 256
        if (pts.length > keep) pts.splice(0, pts.length - keep)
      }
    }

    const stArr = stRef.current
    for (let idx = 0; idx < stArr.length; idx++) {
      const st = stArr[idx]
      if (!st) continue
      const pts = st.pts
      if (!pts.length) continue

      let best: Pt | null = null
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i]!
        const ahead = (p.tsMod - nowMod + MOD) % MOD
        if (ahead !== 0 && ahead < MOD / 2) continue
        best = p
        break
      }
      best ??= pts[0]!

      st.bar = best.bar
      st.offset = best.offset
      st.phase01 = best.phase01
      st.value = best.value
    }
  }, [showWidgets, refs.length, isLive, playbackState, program1, audioContext, globalSampleCount])

  const drawLfo = useCallback((
    c: CanvasRenderingContext2D,
    ref: LfoRef,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
  ) => {
    const x = viewX
    const w = viewWidth
    const h = widgetHeight

    c.save()
    c.translate(x, widgetY)

    const theme = getCurrentTheme()
    c.fillStyle = theme.background
    c.fillRect(0, 0, w, h)

    const pad = 0
    const chartX = 0
    const chartY = pad
    const chartW = w // Math.max(1, w - pad * 2)
    const chartH = Math.max(1, h - pad * 2)

    const st = stRef.current[ref.lfoIndex | 0]
    const bar = Math.max(1e-6, st?.bar ?? ref.params.bar)
    const offset = st?.offset ?? ref.params.offset
    const rawPhase01 = st?.phase01 ?? 0
    const rawValue = st?.value ?? 0

    // Apply smoothing to playhead position
    let smoothed = smoothedPlayheadRef.current[ref.lfoIndex | 0]
    if (!smoothed) {
      smoothed = { phase01: rawPhase01, value: rawValue }
      smoothedPlayheadRef.current[ref.lfoIndex | 0] = smoothed
    }

    // Determine LFO type for smoothing logic
    const isSah = ref.lfoType === 'sah'
    const isSmooth = ref.lfoType === 'smooth'
    const isFractal = ref.lfoType === 'fractal'

    if (isSah) {
      // No smoothing for sah
      smoothed.phase01 = rawPhase01
      smoothed.value = rawValue
    } else {
      const smoothing = playbackState === 'running' ? 0.5 : 1.0
      const prevPhase01 = smoothed.phase01

      // For smooth and fractal, smooth both ways
      if (isSmooth || isFractal) {
        smoothed.phase01 += (rawPhase01 - smoothed.phase01) * smoothing
        smoothed.value += (rawValue - smoothed.value) * smoothing
      } else {
        // For other types, only smooth when phase is increasing (forward motion)
        if (rawPhase01 >= prevPhase01) {
          smoothed.phase01 += (rawPhase01 - smoothed.phase01) * smoothing
          smoothed.value += (rawValue - smoothed.value) * smoothing
        } else {
          // Instant update when wrapping around
          smoothed.phase01 = rawPhase01
          smoothed.value = rawValue
        }
      }
    }

    const phase01 = smoothed.phase01
    const value = smoothed.value

    const yToPx = (y: number) => chartY + (1 - clamp(y, 0, 1)) * chartH

    c.strokeStyle = 'rgba(150,150,150,0.22)'
    c.lineWidth = 1
    c.strokeRect(chartX + 0.5, chartY + 0.5, chartW - 1, chartH - 1)

    c.save()
    c.translate(chartX, 0)

    c.strokeStyle = '#ea580c'
    c.lineWidth = 1.35
    c.beginPath()
    const steps = 96 * 4
    const isSaw = ref.lfoType === 'saw'
    const isRamp = ref.lfoType === 'ramp'
    const xWrap = chartW
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      let yy = 0
      if (isSah || isSmooth || isFractal) {
        yy = t
      }
      else if (isSaw) {
        yy = fract(t + 0.5)
      }
      else if (isRamp) {
        yy = 1 - fract(t + 0.5)
      }
      else {
        yy = lfoValue(ref.lfoType, t)
      }
      const px = t * xWrap
      const py = yToPx(yy)
      if (i === 0) c.moveTo(px, py)
      else c.lineTo(px, py)
    }
    c.stroke()

    if (isSah || isSmooth || isFractal) {
      const t = clamp(value, 0, 1)
      const px = t * chartW
      const py = chartY + (1 - t) * chartH
      c.strokeStyle = 'rgba(255,255,0,0.9)'
      c.lineWidth = 1.35
      c.beginPath()
      c.moveTo(px, chartY)
      c.lineTo(px, chartY + chartH)
      c.stroke()

      c.fillStyle = 'rgba(255,255,0,0.9)'
      c.beginPath()
      c.arc(px, py, 2.2, 0, Math.PI * 2)
      c.fill()
    }
    else {
      const playX = clamp(phase01, 0, 1) * chartW
      c.strokeStyle = 'rgba(255,255,0,0.9)'
      c.lineWidth = 1.35
      c.beginPath()
      c.moveTo(playX, chartY)
      c.lineTo(playX, chartY + chartH)
      c.stroke()

      const yy = lfoValue(ref.lfoType, phase01)
      const py = yToPx(yy)
      c.fillStyle = 'rgba(255,255,0,0.9)'
      c.beginPath()
      c.arc(playX, py, 2.2, 0, Math.PI * 2)
      c.fill()
    }

    c.restore()
    c.restore()
  }, [playbackState])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (refs.length === 0) return []

    const out: EditorWidget[] = []
    for (const ref of refs) {
      out.push({
        type: 'above',
        line: ref.aboveLoc.line,
        column: ref.aboveLoc.column,
        length: Math.max(1, ref.aboveLoc.length),
        height: 40,
        render: (ctx, x, y, w, h, _vx, _vw) => {
          drawLfo(ctx, ref, y, h, x, w)
        },
      })
    }

    return out
  }, [showWidgets, refs, drawLfo])

  return { widgets, onBeforeDraw }
}
