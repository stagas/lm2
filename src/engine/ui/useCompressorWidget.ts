import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import type { Ring } from 'utils/ring'
import { WaveformBuffer } from '../../lib/waveform-buffer.ts'
import type { CompressorRef, LimiterRef } from '../bytecode/bytecode.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { getCurrentTheme } from './theme.ts'

type UseCompressorWidgetParams = {
  program1: ProgramInstance | undefined
  ringPos: Uint8Array<SharedArrayBuffer> | undefined
  compressorRefs: CompressorRef[] | undefined
  limiterRefs: LimiterRef[] | undefined
  dspSource: string
  showWidgets: boolean
  isLive: boolean
  playbackState: 'stopped' | 'running' | 'paused'
  sampleRate: number | undefined
}

type CompressorState = {
  levelWave: WaveformBuffer
  grWave: WaveformBuffer
  levelFloats: Float32Array | null
  grFloats: Float32Array | null
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function compReductionDb(inputDb: number, th: number, ratio: number, knee: number): number {
  const r = ratio === Infinity ? Infinity : clamp(ratio, 1, 20)
  const k = clamp(knee, 0, 40)
  const t = clamp(th, -80, 0)
  if (r === Infinity) {
    // Hard limiting: anything above threshold gets reduced to exactly the threshold
    return inputDb > t ? inputDb - t : 0
  }
  const ratioFactor = 1 - 1 / r
  if (k > 0) {
    const kneeStart = t - k / 2
    const kneeEnd = t + k / 2
    if (inputDb <= kneeStart) return 0
    if (inputDb >= kneeEnd) return (inputDb - t) * ratioFactor
    const d = inputDb - kneeStart
    return ratioFactor * (d * d) / (2 * k)
  }
  return inputDb > t ? (inputDb - t) * ratioFactor : 0
}

export function useCompressorWidget({
  program1,
  ringPos,
  compressorRefs,
  limiterRefs,
  dspSource,
  showWidgets,
  isLive,
  playbackState,
  sampleRate,
}: UseCompressorWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const compressorRefs_ = compressorRefs ?? []
  const limiterRefs_ = limiterRefs ?? []
  // Create unified refs with type information
  const refs = [
    ...compressorRefs_.map(ref => ({ type: 'compressor' as const, ref })),
    ...limiterRefs_.map(ref => ({ type: 'limiter' as const, ref })),
  ]
  const stRef = useRef<Array<CompressorState | undefined>>([])
  const seenRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    return () => {}
  }, [])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (refs.length === 0) return
    if (!isLive) return
    if (playbackState === 'stopped') return

    const canRead = !!program1?.program && !!ringPos
    if (!canRead) return

    const currentChunkPos = Atomics.load(ringPos!, 0)
    const stArr = stRef.current
    const seen = seenRef.current
    seen.clear()

    for (const { type, ref } of refs) {
      const baseIdx = (type === 'compressor' ? ref.compressorIndex : ref.limiterIndex) | 0
      const idx = type === 'compressor' ? baseIdx : baseIdx + 64 // Use different ranges
      if (seen.has(idx)) continue
      seen.add(idx)

      let st = stRef.current[idx]
      if (!st) {
        st = { levelWave: new WaveformBuffer(), grWave: new WaveformBuffer(), levelFloats: null, grFloats: null }
        stRef.current[idx] = st
      }

      const outs = type === 'compressor' ? program1!.program!.compressorOuts : program1!.program!.limiterOuts
      const levelRing = outs.levelDb[baseIdx] as Ring | undefined
      const grRing = outs.grDb[baseIdx] as Ring | undefined
      if (!levelRing || !grRing) {
        st.levelFloats = null
        st.grFloats = null
        continue
      }

      const levelFloats = st.levelWave.update(levelRing, currentChunkPos)
      const grFloats = st.grWave.update(grRing, currentChunkPos)
      if (levelFloats) st.levelFloats = levelFloats
      if (grFloats) st.grFloats = grFloats
    }
  }, [showWidgets, refs, isLive, playbackState, program1, ringPos])

  const minDb = -60
  const maxDb = 0
  // Define the ranges that should have equal visual height
  const ranges = [
    { start: 0, end: -6 }, // 6dB
    { start: -6, end: -12 }, // 6dB
    { start: -12, end: -18 }, // 6dB
    { start: -18, end: -24 }, // 6dB
    { start: -24, end: -30 }, // 6dB
    { start: -30, end: -36 }, // 6dB
    { start: -36, end: -48 }, // 12dB
    { start: -48, end: -60 }, // 12dB
  ]

  const dbToNorm = (db: number) => {
    const d = clamp(db, minDb, maxDb)

    // Each range should occupy the same visual height
    const totalRanges = ranges.length
    const rangeHeight = 1 / totalRanges

    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i]
      if (d >= range.start) {
        // Linear mapping within this range
        const span = range.start - range.end
        const t = span > 0 ? (range.start - d) / span : 0
        return clamp(1 - i * rangeHeight - t * rangeHeight, 0, 1)
      }
    }

    return 0
  }

  const toX = (db: number, chartW: number) => dbToNorm(db) * chartW
  const toY = (db: number, chartY: number, chartH: number) => chartY + (1 - dbToNorm(db)) * chartH

  const drawCompressor = useCallback((
    c: CanvasRenderingContext2D,
    type: 'compressor' | 'limiter',
    ref: CompressorRef | LimiterRef,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
  ) => {
    const baseIdx = (type === 'compressor' ? (ref as CompressorRef).compressorIndex : (ref as LimiterRef).limiterIndex)
      | 0
    const idx = type === 'compressor' ? baseIdx : baseIdx + 64
    const st = stRef.current[idx]
    const level = isLive ? st?.levelFloats : null
    const gr = isLive ? st?.grFloats : null

    const x = viewX
    const w = viewWidth
    const h = Math.max(56, widgetHeight)

    c.save()
    c.translate(x, widgetY)
    c.beginPath()
    c.rect(0, 0, w, h)
    c.clip()

    const theme = getCurrentTheme()
    c.fillStyle = theme.background
    c.fillRect(0, 0, w, h)

    const pad = 6
    const meterLabelW = 14
    const meterW = 14
    const rightLabelW = 26
    const chartX = meterLabelW + meterW + pad * 2
    const chartW = Math.max(1, w - chartX - rightLabelW - pad)
    const chartY = pad
    const chartH = Math.max(1, h - pad * 2)

    const th = ref.params.threshold
    const ratio = type === 'limiter' ? Infinity : (ref.params as { ratio: number }).ratio
    const knee = type === 'limiter' ? 0 : (ref.params as { knee: number }).knee

    const curLevel = level && level.length > 0 ? Math.max(...level) : -80
    const curGr = gr && gr.length > 0 ? Math.max(...gr) : 0

    const grMax = 24
    const grNorm = clamp(curGr / grMax, 0, 1)
    const meterH = chartH
    const meterX = meterLabelW + pad
    const meterY = pad

    // Gain reduction dB scale (left of meter)
    c.save()
    c.font = '9px "Outfit"'
    c.textAlign = 'right'
    c.textBaseline = 'middle'
    c.fillStyle = 'rgba(180,180,180,0.7)'
    c.strokeStyle = 'rgba(180,180,180,0.25)'
    c.lineWidth = 1
    const grMarks = [0, 6, 12, 18, 24]
    for (const v of grMarks) {
      const yy = meterY + (v / grMax) * meterH
      c.beginPath()
      c.moveTo(meterX, yy + 0.5)
      c.lineTo(meterX + meterW, yy + 0.5)
      c.stroke()
      c.fillText(`-${v}`, meterX - 6, yy)
    }
    c.restore()

    c.fillStyle = 'rgba(120,120,120,0.25)'
    c.fillRect(meterX, meterY, meterW, meterH)

    const g = c.createLinearGradient(0, meterY + meterH, 0, meterY)
    g.addColorStop(0, '#404040')
    g.addColorStop(0.35, '#ea580c')
    g.addColorStop(1, '#ff0')
    c.fillStyle = g
    c.fillRect(meterX, meterY, meterW, grNorm * meterH)

    c.strokeStyle = 'rgba(180,180,180,0.15)'
    c.lineWidth = 1
    c.strokeRect(meterX + 0.5, meterY + 0.5, meterW - 1, meterH - 1)

    c.save()
    c.translate(chartX, 0)

    // Right-side dB scale for the transfer/threshold area
    c.save()
    c.font = '9px "Outfit"'
    c.textAlign = 'right'
    c.textBaseline = 'middle'
    c.fillStyle = 'rgba(180,180,180,0.7)'
    c.strokeStyle = 'rgba(180,180,180,0.22)'
    c.lineWidth = 1

    c.strokeStyle = 'rgba(150,150,150,0.25)'
    c.lineWidth = 1
    c.strokeRect(0.5, chartY + 0.5, chartW - 1, chartH)

    // Piecewise-linear dB mapping: keep equal dB spacing (like the GR meter),
    // but allocate more pixels to the -24..0 region by compressing -80..-24.

    const dbMarks = chartH < 80 ? [-0, -12, -24, -36, -60] : [-0, -6, -12, -18, -24, -30, -36, -48, -60]
    for (const v of dbMarks) {
      const yy = toY(v, chartY, chartH)
      c.beginPath()
      c.moveTo(chartW + 0.5, yy + 0.5)
      c.lineTo(chartW + 6.5, yy + 0.5)
      c.stroke()
      c.fillText(v == 0 ? '-0' : String(v), chartW + rightLabelW - 2, yy)
    }
    c.restore()

    // Threshold marker (horizontal)
    c.strokeStyle = 'rgba(150,150,150,0.25)'
    c.lineWidth = 1
    const thY = toY(th, chartY, chartH)
    c.beginPath()
    c.moveTo(0, thY)
    c.lineTo(chartW, thY)
    c.stroke()

    // Signal presence band (x-range of recent input levels)
    if (level) {
      let lo = 0
      let hi = -Infinity
      const N = Math.min(level.length, 512)
      for (let i = level.length - N; i < level.length; i++) {
        const v = level[i]
        if (v == null) continue
        // if (v < lo) lo = v
        if (v > hi) hi = v
      }
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        c.fillStyle = 'rgba(120,120,120,0.25)'
        // Convert horizontal band (x-range) to vertical band (y-range, down to up)
        const y1 = toY(hi, chartY, chartH)
        c.fillRect(1, Math.ceil(y1), chartW - 2, Math.ceil(Math.max(1, (chartY + chartH) - y1)))
      }
    }

    c.strokeStyle = 'rgba(180,180,180,0.25)'
    c.beginPath()
    c.moveTo(0, toY(minDb, chartY, chartH))
    c.lineTo(chartW, toY(maxDb, chartY, chartH))
    c.stroke()

    c.strokeStyle = '#ea580c'
    c.lineWidth = 1.35
    c.beginPath()
    const steps = Math.min(256, Math.max(64, chartW | 0))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const inDb = minDb + (maxDb - minDb) * t
      const red = compReductionDb(inDb, th, ratio, knee)
      const outDb = inDb - red
      const px = toX(inDb, chartW)
      const py = toY(outDb, chartY, chartH)
      if (i === 0) c.moveTo(px, py)
      else c.lineTo(px, py)
    }
    c.stroke()

    // Junction points:
    // - knee start on the diagonal (input==output)
    // - knee end where we meet the ratio line
    c.fillStyle = 'rgba(255,255,0,0.85)'
    if (knee > 0) {
      const kneeStart = th - knee / 2
      const kneeEnd = th + knee / 2

      c.beginPath()
      c.arc(toX(kneeStart, chartW), toY(kneeStart, chartY, chartH), 2.75, 0, Math.PI * 2)
      c.fill()

      const endRed = compReductionDb(kneeEnd, th, ratio, knee)
      const endOut = kneeEnd - endRed
      c.beginPath()
      c.arc(toX(kneeEnd, chartW), toY(endOut, chartY, chartH), 2.75, 0, Math.PI * 2)
      c.fill()
    }
    else {
      c.beginPath()
      c.arc(toX(th, chartW), toY(th, chartY, chartH), 2.75, 0, Math.PI * 2)
      c.fill()
    }

    // Current operating point (single dot)
    if (Number.isFinite(curLevel) && Number.isFinite(curGr)) {
      const outDb = curLevel - curGr
      c.fillStyle = 'rgba(255,255,0,0.85)'
      c.beginPath()
      c.arc(toX(curLevel, chartW), toY(outDb, chartY, chartH), 2.75, 0, Math.PI * 2)
      c.fill()
    }

    c.fillStyle = 'rgba(180,180,180,0.9)'
    c.font = '7pt "Space Mono"'
    c.textBaseline = 'top'
    let txt = `${curLevel.toFixed(1).padStart(5, ' ')}dB in`
    c.fillText(txt, 6, 2)
    txt = `${curGr.toFixed(1).padStart(5, ' ')}dB gr`
    c.fillText(txt, 72, 2)

    c.restore()
    c.restore()
  }, [isLive])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (refs.length === 0) return []

    const out: EditorWidget[] = []

    for (const { type, ref } of refs) {
      out.push({
        type: 'above',
        line: ref.aboveLoc.line,
        column: ref.aboveLoc.column,
        length: Math.max(1, ref.aboveLoc.length),
        height: 40,
        render: (ctx, x, y, w, h, vx, vw) => {
          drawCompressor(ctx, type, ref, y, h, x, w)
        },
      })
    }

    return out
  }, [showWidgets, refs, drawCompressor, isLive])

  return { widgets, onBeforeDraw }
}
