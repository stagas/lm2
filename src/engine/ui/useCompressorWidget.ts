import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import type { Ring } from 'utils/ring'
import { WaveformBuffer } from '../../lib/waveform-buffer.ts'
import type { CompressorRef, ExpanderRef, GateRef, LimiterRef } from '../bytecode/bytecode.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { getCurrentTheme } from './theme.ts'

type UseCompressorWidgetParams = {
  program1: ProgramInstance | undefined
  ringPos: Uint8Array<SharedArrayBuffer> | undefined
  compressorRefs: CompressorRef[] | undefined
  expanderRefs: ExpanderRef[] | undefined
  gateRefs: GateRef[] | undefined
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

function expReductionDb(inputDb: number, th: number, ratio: number, knee: number): number {
  const t = clamp(th, -80, 0)
  const r = clamp(ratio, 1, 100)
  const w = clamp(knee, 0, 40)

  const slope = r - 1
  const halfW = w * 0.5
  const delta = inputDb - t

  if (delta >= halfW) return 0
  if (w <= 0) return slope * (t - inputDb)

  if (delta <= -halfW) return slope * (t - inputDb)

  const x = clamp((halfW - delta) / w, 0, 1)
  return slope * halfW * x * x
}

function gateReductionDb(inputDb: number, th: number, ratio: number, knee: number): number {
  return expReductionDb(inputDb, th, ratio, knee)
}

function reducerFor(
  type: 'compressor' | 'expander' | 'gate' | 'limiter',
): (inputDb: number, th: number, ratio: number, knee: number) => number {
  if (type === 'compressor') return compReductionDb
  if (type === 'expander') return expReductionDb
  if (type === 'gate') return gateReductionDb
  return compReductionDb
}

export function useCompressorWidget({
  program1,
  ringPos,
  compressorRefs,
  expanderRefs,
  gateRefs,
  limiterRefs,
  dspSource,
  showWidgets,
  isLive,
  playbackState,
  sampleRate,
}: UseCompressorWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const compressorRefs_ = compressorRefs ?? []
  const expanderRefs_ = expanderRefs ?? []
  const gateRefs_ = gateRefs ?? []
  const limiterRefs_ = limiterRefs ?? []
  // Create unified refs with type information
  const refs = [
    ...compressorRefs_.map(ref => ({ type: 'compressor' as const, ref })),
    ...expanderRefs_.map(ref => ({ type: 'expander' as const, ref })),
    ...gateRefs_.map(ref => ({ type: 'gate' as const, ref })),
    ...limiterRefs_.map(ref => ({ type: 'limiter' as const, ref })),
  ]
  const stRef = useRef<Array<CompressorState | undefined>>([])
  const seenRef = useRef<Set<number>>(new Set())
  const playheadRef = useRef(new Map<number, { db: number; ts: number }>())
  const lastLiveProgramPtrRef = useRef<number | null>(null)
  const lastLiveRefsKeyRef = useRef<string>('')

  const refsKey = useMemo(() => {
    if (refs.length === 0) return ''
    const set = new Set<number>()
    for (const { type, ref } of refs) {
      const baseIdx = (type === 'compressor'
        ? ref.compressorIndex
        : type === 'expander'
        ? ref.expanderIndex
        : type === 'gate'
        ? ref.gateIndex
        : ref.limiterIndex) | 0
      const idx = baseIdx + (type === 'compressor' ? 0 : type === 'expander' ? 64 : type === 'gate' ? 128 : 192)
      set.add(idx)
    }
    return [...set].sort((a, b) => a - b).join(',')
  }, [refs])

  useEffect(() => {
    return () => {}
  }, [])

  useEffect(() => {
    if (!isLive) return
    const programPtr = program1?.program?.ptr$ ?? 0
    if (lastLiveProgramPtrRef.current === programPtr && lastLiveRefsKeyRef.current === refsKey) return
    lastLiveProgramPtrRef.current = programPtr
    lastLiveRefsKeyRef.current = refsKey

    // Reset ring readers on program/graph switches to avoid displaying stale buffers.
    stRef.current.length = 0
    seenRef.current.clear()
    playheadRef.current.clear()
  }, [isLive, program1, refsKey])

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
      const baseIdx = (type === 'compressor'
        ? ref.compressorIndex
        : type === 'expander'
        ? ref.expanderIndex
        : type === 'gate'
        ? ref.gateIndex
        : ref.limiterIndex) | 0
      const idx = baseIdx + (type === 'compressor' ? 0 : type === 'expander' ? 64 : type === 'gate' ? 128 : 192)
      if (seen.has(idx)) {
        continue
      }
      seen.add(idx)

      let st = stRef.current[idx]
      if (!st) {
        st = { levelWave: new WaveformBuffer(), grWave: new WaveformBuffer(), levelFloats: null, grFloats: null }
        stRef.current[idx] = st
      }

      const outs = type === 'compressor'
        ? program1!.program!.compressorOuts
        : type === 'expander'
        ? program1!.program!.expanderOuts
        : type === 'gate'
        ? program1!.program!.gateOuts
        : program1!.program!.limiterOuts
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

  const normToDb = (norm: number) => {
    const u = clamp(norm, 0, 1)
    const totalRanges = ranges.length
    const rangeHeight = 1 / totalRanges
    for (let i = 0; i < totalRanges; i++) {
      const top = 1 - i * rangeHeight
      const bot = top - rangeHeight
      const inSeg = u <= top && (u > bot || i === totalRanges - 1)
      if (!inSeg) continue
      const range = ranges[i]
      const t = clamp((top - u) / rangeHeight, 0, 1)
      const span = range.start - range.end
      return clamp(range.start - t * span, minDb, maxDb)
    }
    return minDb
  }

  const toX = (db: number, chartW: number) => dbToNorm(db) * chartW
  const toY = (db: number, chartY: number, chartH: number) => chartY + (1 - dbToNorm(db)) * chartH

  const drawCompressor = useCallback((
    c: CanvasRenderingContext2D,
    type: 'compressor' | 'expander' | 'gate' | 'limiter',
    ref: CompressorRef | ExpanderRef | GateRef | LimiterRef,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
  ) => {
    const baseIdx = (type === 'compressor'
      ? (ref as CompressorRef).compressorIndex
      : type === 'expander'
      ? (ref as ExpanderRef).expanderIndex
      : type === 'gate'
      ? (ref as GateRef).gateIndex
      : (ref as LimiterRef).limiterIndex) | 0
    const idx = baseIdx + (type === 'compressor' ? 0 : type === 'expander' ? 64 : type === 'gate' ? 128 : 192)
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
    const ratio = type === 'limiter' ? Infinity : type === 'gate' ? 100 : (ref.params as { ratio: number }).ratio
    const knee = type === 'limiter' ? 0 : (ref.params as { knee: number }).knee
    const reduce = reducerFor(type)

    let curLevel = -80
    let curGr = 0
    if (level && gr) {
      const n = Math.min(level.length, gr.length)
      for (let i = n - 1; i >= 0; i--) {
        const l = level[i]
        const g = gr[i]
        if (l == null || g == null) continue
        curLevel = l
        curGr = g
        break
      }
    }
    const now = performance.now()
    const ph = playheadRef.current.get(idx) ?? { db: curLevel, ts: now }
    const dt = clamp((now - ph.ts) / 1000, 0, 0.25)
    const attack = type === 'limiter'
      ? 0.001
      : Math.max(0.001, (ref.params as { attack: number }).attack ?? 0.01)
    const release = Math.max(0.001, (ref.params as { release: number }).release ?? 0.1)
    const tc = curLevel > ph.db ? attack : release
    const a = 1 - Math.exp(-dt / tc)
    const playheadLevel = ph.db + a * (curLevel - ph.db)
    ph.db = playheadLevel
    ph.ts = now
    playheadRef.current.set(idx, ph)

    const curGrCurve = reduce(playheadLevel, th, ratio, knee)

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

    // Threshold marker (vertical, input dB)
    c.strokeStyle = 'rgba(150,150,150,0.25)'
    c.lineWidth = 1
    const thX = toX(th, chartW)
    c.beginPath()
    c.moveTo(thX, chartY)
    c.lineTo(thX, chartY + chartH)
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
    c.lineJoin = 'round'
    c.lineCap = 'round'
    c.beginPath()
    const isDownward = type === 'compressor' || type === 'limiter'
    const k = clamp(knee, 0, 40)
    const kneeStart = th - k / 2
    const kneeEnd = th + k / 2

    const diagStartIn = isDownward ? minDb : maxDb
    const diagEndIn = isDownward ? (k > 0 ? kneeStart : th) : (k > 0 ? kneeEnd : th)
    const lineStartIn = isDownward ? (k > 0 ? kneeEnd : th) : (k > 0 ? kneeStart : th)
    const lineEndIn = isDownward ? maxDb : minDb

    // 1) Diagonal (input == output)
    c.moveTo(toX(diagStartIn, chartW), toY(diagStartIn, chartY, chartH))
    c.lineTo(toX(diagEndIn, chartW), toY(diagEndIn, chartY, chartH))

    // 2) Knee: smooth quadratic Bezier curve (always convex)
    if (k > 0) {
      const kneeA = isDownward ? kneeStart : kneeEnd
      const kneeB = isDownward ? kneeEnd : kneeStart
      const outA = kneeA
      const outB = kneeB - reduce(kneeB, th, ratio, k)

      const ax = toX(kneeA, chartW)
      const ay = toY(outA, chartY, chartH)
      const bx = toX(kneeB, chartW)
      const by = toY(outB, chartY, chartH)

      // Calculate midpoint for convex quadratic Bezier control point
      const mx = (ax + bx) / 2
      const my = (ay + by) / 2

      // Calculate the perpendicular direction for convexity
      const dx = bx - ax
      const dy = by - ay
      const len = Math.hypot(dx, dy) || 1
      const nx = dy / len // perpendicular vector
      const ny = -dx / len

      // Control point offset to ensure convexity
      // For downward curves, we want the control point below the line
      // For upward curves, we want it above the line
      const offset = isDownward ? 1 : -1
      const cpDist = Math.min(len * 0.015, 12) // gentler curve with smaller max distance
      const cx = mx + nx * cpDist * offset
      const cy = my + ny * cpDist * offset

      // Use quadratic Bezier curve for guaranteed convexity
      c.quadraticCurveTo(cx, cy, bx, by)
    }

    // 3) Post-knee line
    if (type === 'limiter') {
      c.lineTo(toX(maxDb, chartW), toY(th, chartY, chartH))
    }
    else if (type === 'compressor') {
      const r = clamp(ratio, 1, 20)
      const outA = th + (lineStartIn - th) / r
      const outB = th + (lineEndIn - th) / r
      c.lineTo(toX(lineStartIn, chartW), toY(outA, chartY, chartH))
      c.lineTo(toX(lineEndIn, chartW), toY(outB, chartY, chartH))
    }
    else {
      if (type === 'gate' && k <= 0) {
        const thX = toX(th, chartW)
        const yTop = chartY + 0.5
        const yBot = chartY + chartH - 0.5
        const thY2 = clamp(toY(th, chartY, chartH), yTop, yBot)
        c.lineTo(thX, thY2)
        c.lineTo(thX, yBot)
        c.lineTo(0, yBot)
      }
      else {
        const r = clamp(ratio, 1, 100)
        const outA = th + r * (lineStartIn - th)
        const outB = th + r * (lineEndIn - th)
        c.lineTo(toX(lineStartIn, chartW), toY(outA, chartY, chartH))
        c.lineTo(toX(lineEndIn, chartW), toY(outB, chartY, chartH))
      }
    }
    c.stroke()

    // Junction points:
    // - knee start on the diagonal (input==output)
    // - knee end where we meet the ratio line
    c.fillStyle = 'rgba(255,255,0,0.85)'
    if (knee > 0) {
      const kneeStart = th - knee / 2
      const kneeEnd = th + knee / 2
      const isDownward = type === 'compressor' || type === 'limiter'
      const diagIn = isDownward ? kneeStart : kneeEnd
      const lineIn = isDownward ? kneeEnd : kneeStart

      c.beginPath()
      c.arc(toX(diagIn, chartW), toY(diagIn, chartY, chartH), 2.75, 0, Math.PI * 2)
      c.fill()

      const lineRed = reduce(lineIn, th, ratio, knee)
      const lineOut = lineIn - lineRed
      c.beginPath()
      c.arc(toX(lineIn, chartW), toY(lineOut, chartY, chartH), 2.75, 0, Math.PI * 2)
      c.fill()
    }
    else {
      c.beginPath()
      c.arc(toX(th, chartW), toY(th, chartY, chartH), 2.75, 0, Math.PI * 2)
      c.fill()
    }

    // Current operating point (single dot)
    if (Number.isFinite(playheadLevel)) {
      let dotX = toX(playheadLevel, chartW)
      let dotY = toY(playheadLevel, chartY, chartH)

      if (type === 'gate' && k <= 0 && playheadLevel < th) {
        dotY = chartY + chartH - 0.5
      }
      else if (k > 0) {
        const inA = isDownward ? kneeStart : kneeEnd
        const inB = isDownward ? kneeEnd : kneeStart
        const lo = Math.min(inA, inB)
        const hi = Math.max(inA, inB)
        if (playheadLevel >= lo && playheadLevel <= hi) {
          const outA = inA
          const outB = inB - reduce(inB, th, ratio, k)

          const ax = toX(inA, chartW)
          const ay = toY(outA, chartY, chartH)
          const bx = toX(inB, chartW)
          const by = toY(outB, chartY, chartH)

          // Calculate midpoint for convex quadratic Bezier control point
          const mx = (ax + bx) / 2
          const my = (ay + by) / 2

          // Calculate the perpendicular direction for convexity
          const dx = bx - ax
          const dy = by - ay
          const len = Math.hypot(dx, dy) || 1
          const nx = dy / len // perpendicular vector
          const ny = -dx / len

          // Control point offset to ensure convexity
          const offset = isDownward ? 1 : -1
          const cpDist = Math.min(len * 0.015, 12) // gentler curve with smaller max distance
          const cx = mx + nx * cpDist * offset
          const cy = my + ny * cpDist * offset

          // Interpolate along quadratic Bezier curve
          const t = clamp((playheadLevel - inA) / (inB - inA), 0, 1)
          const mt = 1 - t
          dotX = mt * mt * ax + 2 * mt * t * cx + t * t * bx
          dotY = mt * mt * ay + 2 * mt * t * cy + t * t * by
        }
        else if (isDownward ? playheadLevel > hi : playheadLevel < lo) {
          if (type === 'limiter') {
            dotY = toY(th, chartY, chartH)
          }
          else if (type === 'compressor') {
            const r = clamp(ratio, 1, 20)
            const outDb = th + (playheadLevel - th) / r
            dotY = toY(outDb, chartY, chartH)
          }
          else {
            const r = clamp(ratio, 1, 100)
            const outDb = th + r * (playheadLevel - th)
            dotY = toY(outDb, chartY, chartH)
          }
        }
      }
      else {
        if (type === 'limiter' && playheadLevel > th) {
          dotY = toY(th, chartY, chartH)
        }
        else if (type === 'compressor' && playheadLevel > th) {
          const r = clamp(ratio, 1, 20)
          const outDb = th + (playheadLevel - th) / r
          dotY = toY(outDb, chartY, chartH)
        }
        else if ((type === 'expander' || type === 'gate') && playheadLevel < th) {
          const r = clamp(ratio, 1, 100)
          const outDb = th + r * (playheadLevel - th)
          dotY = toY(outDb, chartY, chartH)
        }
      }

      c.fillStyle = 'rgba(255,255,0,0.85)'
      c.beginPath()
      c.arc(dotX, dotY, 2.75, 0, Math.PI * 2)
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
