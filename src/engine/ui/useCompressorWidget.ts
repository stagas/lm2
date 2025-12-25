import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Ring } from 'utils/ring'
import { WaveformBuffer } from '../../lib/waveform-buffer.ts'
import type { CompressorRef } from '../bytecode/bytecode.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { getCurrentTheme } from './theme.ts'

type UseCompressorWidgetParams = {
  program1: ProgramInstance | undefined
  ringPos: Uint8Array<SharedArrayBuffer> | undefined
  compressorRefs: CompressorRef[] | undefined
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
  const r = clamp(ratio, 1, 20)
  const k = clamp(knee, 0, 40)
  const t = clamp(th, -80, 0)
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
  dspSource,
  showWidgets,
  isLive,
  playbackState,
  sampleRate,
}: UseCompressorWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const refs = compressorRefs ?? []
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

    const canRead = !!program1?.program?.compressorOuts && !!ringPos
    if (!canRead) return

    const currentChunkPos = Atomics.load(ringPos!, 0)
    const stArr = stRef.current
    const seen = seenRef.current
    seen.clear()

    for (const ref of refs) {
      const idx = ref.compressorIndex | 0
      if (seen.has(idx)) continue
      seen.add(idx)

      let st = stArr[idx]
      if (!st) {
        st = { levelWave: new WaveformBuffer(), grWave: new WaveformBuffer(), levelFloats: null, grFloats: null }
        stArr[idx] = st
      }

      const levelRing = program1!.program!.compressorOuts.levelDb[idx] as Ring | undefined
      const grRing = program1!.program!.compressorOuts.grDb[idx] as Ring | undefined
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

  const drawCompressor = useCallback((
    c: CanvasRenderingContext2D,
    ref: CompressorRef,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
  ) => {
    const idx = ref.compressorIndex | 0
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
    const ratio = ref.params.ratio
    const knee = ref.params.knee

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
    c.strokeRect(0.5, chartY + 0.5, chartW - 1, chartH - 1)

    const minDb = -80
    const maxDb = 0
    // Piecewise-linear dB mapping: keep equal dB spacing (like the GR meter),
    // but allocate more pixels to the -24..0 region by compressing -80..-24.
    const splitDb = -24
    const topFrac = 0.62
    const dbToNorm = (db: number) => {
      const d = clamp(db, minDb, maxDb)
      const cut = 1 - topFrac
      const lowSpan = splitDb - minDb
      const highSpan = maxDb - splitDb

      // Top region (-24..0): strictly linear so 6dB ticks are evenly spaced.
      if (d >= splitDb) {
        const t = highSpan > 0 ? (d - splitDb) / highSpan : 0
        return clamp(cut + t * topFrac, 0, 1)
      }

      // Bottom region (-80..-24): compress, but force -48dB to land at the midpoint between -24 and -80.
      // This keeps the -24..0 area expanded while making -48 visually centered in the compressed area.
      const u = lowSpan > 0 ? clamp((d - minDb) / lowSpan, 0, 1) : 0
      const u48 = lowSpan > 0 ? clamp((-48 - minDb) / lowSpan, 1e-6, 1 - 1e-6) : 0.5
      const pMid = Math.log(0.5) / Math.log(u48)
      const p = Number.isFinite(pMid) ? Math.max(1e-3, pMid) : 1
      const low = (uu: number) => cut * Math.pow(clamp(uu, 0, 1), p)

      // Blend only in the last few dB below -24 to avoid a sharp slope change at the split.
      const blendDb = 6
      const db1 = splitDb - blendDb
      if (d <= db1) return clamp(low(u), 0, 1)

      const uu1 = lowSpan > 0 ? clamp((db1 - minDb) / lowSpan, 0, 1) : 0
      const y1 = low(uu1)
      const y2 = cut

      const span = splitDb - db1
      const t = span > 0 ? clamp((d - db1) / span, 0, 1) : 1
      const tt = t * t
      const ttt = tt * t
      const h00 = 2 * ttt - 3 * tt + 1
      const h10 = ttt - 2 * tt + t
      const h01 = -2 * ttt + 3 * tt
      const h11 = ttt - tt

      const slopeLowDb = lowSpan > 0 ? (cut * p * Math.pow(uu1, Math.max(0, p - 1))) / lowSpan : 0
      const slopeHighDb = highSpan > 0 ? topFrac / highSpan : 0
      const m1 = slopeLowDb * span
      const m2 = slopeHighDb * span
      const y = h00 * y1 + h10 * m1 + h01 * y2 + h11 * m2
      return clamp(y, 0, 1)
    }
    const toX = (db: number) => dbToNorm(db) * chartW
    const toY = (db: number) => chartY + (1 - dbToNorm(db)) * chartH

    const dbMarks = [0, -6, -12, -18, -24, -48, -80]
    for (const v of dbMarks) {
      const yy = toY(v)
      c.beginPath()
      c.moveTo(chartW + 0.5, yy + 0.5)
      c.lineTo(chartW + 6.5, yy + 0.5)
      c.stroke()
      c.fillText(String(v), chartW + rightLabelW - 2, yy)
    }
    c.restore()

    // Threshold marker (horizontal)
    c.strokeStyle = 'rgba(150,150,150,0.25)'
    c.lineWidth = 1
    const thY = toY(th)
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
        const y1 = toY(hi)
        c.fillRect(0, y1, chartW, Math.max(1, (chartY + chartH) - y1))
      }
    }

    c.strokeStyle = 'rgba(180,180,180,0.25)'
    c.beginPath()
    c.moveTo(0, toY(minDb))
    c.lineTo(chartW, toY(maxDb))
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
      const px = toX(inDb)
      const py = toY(outDb)
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
      c.arc(toX(kneeStart), toY(kneeStart), 2.75, 0, Math.PI * 2)
      c.fill()

      const endRed = compReductionDb(kneeEnd, th, ratio, knee)
      const endOut = kneeEnd - endRed
      c.beginPath()
      c.arc(toX(kneeEnd), toY(endOut), 2.75, 0, Math.PI * 2)
      c.fill()
    }
    else {
      c.beginPath()
      c.arc(toX(th), toY(th), 2.75, 0, Math.PI * 2)
      c.fill()
    }

    // Current operating point (single dot)
    if (Number.isFinite(curLevel) && Number.isFinite(curGr)) {
      const outDb = curLevel - curGr
      c.fillStyle = 'rgba(255,255,0,0.85)'
      c.beginPath()
      c.arc(toX(curLevel), toY(outDb), 2.75, 0, Math.PI * 2)
      c.fill()
    }

    c.fillStyle = 'rgba(180,180,180,0.9)'
    c.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
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

    for (const ref of refs) {
      out.push({
        type: 'above',
        line: ref.aboveLoc.line,
        column: ref.aboveLoc.column,
        length: Math.max(1, ref.aboveLoc.length),
        height: 40,
        render: (ctx, x, y, w, h, vx, vw) => {
          drawCompressor(ctx, ref, y, h, x, w)
        },
      })
    }

    return out
  }, [showWidgets, refs, drawCompressor, isLive])

  return { widgets, onBeforeDraw }
}
