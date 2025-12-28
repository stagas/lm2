import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import { FILTER_DATA_OFFSET, FILTER_ENTRY_SIZE, FILTER_HISTORY_SIZE } from '../../../as/assembly/constants.ts'
import type { FilterRef } from '../bytecode/types.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { getCurrentTheme } from './theme.ts'
import { updatePredictedSampleCount } from './update-predicted-sample-count.ts'

type UseFilterWidgetParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  filterRefs: FilterRef[] | undefined
  dspSource: string
  showWidgets: boolean
  isLive: boolean
  playbackState: 'stopped' | 'running' | 'paused'
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

type BiquadCoeffs = {
  a0: number
  a1: number
  a2: number
  b0: number
  b1: number
  b2: number
}

function biquadCoeffs(type: string, cutHz: number, q: number, gainDb: number, sampleRate: number): BiquadCoeffs {
  const nyquist = Math.max(1, sampleRate / 2)
  const freq = clamp(cutHz, 20, nyquist)
  const Q = clamp(q, 0.01, 20)
  const gain = clamp(gainDb, -40, 40)
  const omega = (Math.PI * 2 * freq) / sampleRate
  const sn = Math.sin(omega)
  const cs = Math.cos(omega)

  if (type === 'lp') {
    const alpha = sn / (2 * Q)
    return {
      b0: (1 - cs) / 2,
      b1: 1 - cs,
      b2: (1 - cs) / 2,
      a0: 1 + alpha,
      a1: -2 * cs,
      a2: 1 - alpha,
    }
  }

  if (type === 'hp') {
    const alpha = sn / (2 * Q)
    return {
      b0: (1 + cs) / 2,
      b1: -(1 + cs),
      b2: (1 + cs) / 2,
      a0: 1 + alpha,
      a1: -2 * cs,
      a2: 1 - alpha,
    }
  }

  if (type === 'bp') {
    const alpha = sn / (2 * Q)
    return {
      b0: alpha,
      b1: 0,
      b2: -alpha,
      a0: 1 + alpha,
      a1: -2 * cs,
      a2: 1 - alpha,
    }
  }

  if (type === 'bs') {
    const alpha = sn / (2 * Q)
    return {
      b0: 1,
      b1: -2 * cs,
      b2: 1,
      a0: 1 + alpha,
      a1: -2 * cs,
      a2: 1 - alpha,
    }
  }

  if (type === 'ls') {
    const A = Math.pow(10, gain / 40)
    const beta = Math.sqrt(A) / 1
    return {
      b0: A * (A + 1 - (A - 1) * cs + beta * sn),
      b1: 2 * A * (A - 1 - (A + 1) * cs),
      b2: A * (A + 1 - (A - 1) * cs - beta * sn),
      a0: A + 1 + (A - 1) * cs + beta * sn,
      a1: -2 * (A - 1 + (A + 1) * cs),
      a2: A + 1 + (A - 1) * cs - beta * sn,
    }
  }

  if (type === 'hs') {
    const A = Math.pow(10, gain / 40)
    const beta = Math.sqrt(A) / 1
    return {
      b0: A * (A + 1 + (A - 1) * cs + beta * sn),
      b1: -2 * A * (A - 1 + (A + 1) * cs),
      b2: A * (A + 1 + (A - 1) * cs - beta * sn),
      a0: A + 1 - (A - 1) * cs + beta * sn,
      a1: 2 * (A - 1 - (A + 1) * cs),
      a2: A + 1 - (A - 1) * cs - beta * sn,
    }
  }

  if (type === 'peak') {
    const A = Math.pow(10, gain / 40)
    const alpha = sn / (2 * Q)
    return {
      b0: 1 + alpha * A,
      b1: -2 * cs,
      b2: 1 - alpha * A,
      a0: 1 + alpha / A,
      a1: -2 * cs,
      a2: 1 - alpha / A,
    }
  }

  if (type === 'ap') {
    const alpha = sn / (2 * Q)
    return {
      b0: 1 - alpha,
      b1: -2 * cs,
      b2: 1 + alpha,
      a0: 1 + alpha,
      a1: -2 * cs,
      a2: 1 - alpha,
    }
  }

  return { a0: 1, a1: 0, a2: 0, b0: 1, b1: 0, b2: 0 }
}

function biquadMagDb(type: string, freqHz: number, cutHz: number, q: number, gainDb: number,
  sampleRate: number): number
{
  const { a0, a1, a2, b0, b1, b2 } = biquadCoeffs(type, cutHz, q, gainDb, sampleRate)
  const w = (Math.PI * 2 * clamp(freqHz, 1e-6, sampleRate / 2)) / sampleRate
  const cos1 = Math.cos(w)
  const sin1 = Math.sin(w)
  const cos2 = Math.cos(2 * w)
  const sin2 = Math.sin(2 * w)

  const nr = b0 + b1 * cos1 + b2 * cos2
  const ni = -(b1 * sin1 + b2 * sin2)
  const dr = a0 + a1 * cos1 + a2 * cos2
  const di = -(a1 * sin1 + a2 * sin2)

  const n2 = nr * nr + ni * ni
  const d2 = dr * dr + di * di
  const mag = d2 > 0 ? Math.sqrt(n2 / d2) : 1
  const m = Math.max(1e-12, mag)
  return 20 * Math.log10(m)
}

function hzToX(hz: number, minHz: number, maxHz: number, w: number): number {
  const a = Math.max(1, minHz)
  const b = Math.max(a + 1e-6, maxHz)
  const h = clamp(hz, a, b)
  const t = Math.log(h / a) / Math.log(b / a)
  return t * w
}

export function useFilterWidget({
  program1,
  audioContext,
  globalSampleCount,
  filterRefs,
  dspSource,
  showWidgets,
  isLive,
  playbackState,
}: UseFilterWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const refs = filterRefs ?? []

  type Pt = { tsMod: number; cutoff: number; q?: number; gain?: number }
  type St = { pts: Pt[]; cutoff: number; q?: number; gain?: number }

  const lastWritePosRef = useRef<number>(0)
  const stRef = useRef<Array<St | undefined>>([])
  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)
  const lastSampleCountRef = useRef<number | null>(null)

  useEffect(() => {
    lastWritePosRef.current = 0
    stRef.current.length = 0
    predictedSampleCountRef.current = null
    lastWallTimeRef.current = null
    isFirstFrameRef.current = true
    lastSampleCountRef.current = null
  }, [dspSource])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!refs.length) return
    if (!isLive) return

    const history = program1?.program.filterHistory
    if (!history) return

    const writePos = Math.floor(history.writePos) >>> 0
    if (playbackState !== 'running') {
      lastWritePosRef.current = writePos
      predictedSampleCountRef.current = null
      lastWallTimeRef.current = null
      isFirstFrameRef.current = true
      lastSampleCountRef.current = null
      return
    }

    const pred = updatePredictedSampleCount(audioContext, globalSampleCount, {
      predictedSampleCountRef,
      lastWallTimeRef,
      isFirstFrameRef,
    }, { isPlaying: true })
    if (!pred) return

    const MOD = 1 << 20
    const nowMod = (Math.floor(pred.sampleCount) >>> 0) & (MOD - 1)
    // const lastSampleCount = lastSampleCountRef.current ?? pred.sampleCount
    lastSampleCountRef.current = pred.sampleCount
    // const dt = Math.max(0, (pred.sampleCount - lastSampleCount) / pred.sampleRate)
    // const tau = 1
    const a = 1 // - Math.exp(-dt / tau)

    const prevWritePos = lastWritePosRef.current >>> 0
    lastWritePosRef.current = writePos

    if (writePos !== prevWritePos) {
      const raw = history.raw
      const deltaRaw = (writePos - prevWritePos + MOD) % MOD
      const delta = Math.min(deltaRaw, FILTER_HISTORY_SIZE)

      for (let k = delta; k > 0; k--) {
        const p = (writePos - k) >>> 0
        const slot = p % FILTER_HISTORY_SIZE
        const base = FILTER_DATA_OFFSET + slot * FILTER_ENTRY_SIZE

        const idx = Math.floor(raw[base] ?? 0)
        const cutoff = raw[base + 1] ?? 0
        const p2 = raw[base + 2] ?? 0
        const gate = Math.floor(raw[base + 3] ?? 0)
        const tsMod = (Math.floor(raw[base + 4] ?? 0) >>> 0) & (MOD - 1)
        if (idx < 0 || idx > 63) continue

        // entry layout: idx, cutHz, qOrGain, gate, sampleCountMod
        // gate: 1..8 => lp,hp,bp,bs,ls,hs,peak,ap
        const isShelf = gate === 5 || gate === 6
        const isPeak = gate === 7

        let st = stRef.current[idx]
        if (!st) {
          st = {
            pts: [],
            cutoff: cutoff || 0,
            ...(!isShelf ? { q: (p2 || 0.707) } : {}),
            ...(isShelf ? { gain: p2 || 0 } : {}),
          }
          stRef.current[idx] = st
        }

        const pts = st.pts
        pts.push({
          tsMod,
          cutoff,
          ...(isShelf ? { gain: p2 } : {}),
          ...(!isShelf ? { q: p2 } : {}),
          ...(isPeak ? { q: p2 } : {}),
        })
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

      const targetCutoff = best.cutoff
      st.cutoff = st.cutoff + (targetCutoff - st.cutoff) * a
      if (best.q !== undefined) {
        st.q = (st.q ?? best.q) + (best.q - (st.q ?? best.q)) * a
      }
      if (best.gain !== undefined) {
        st.gain = (st.gain ?? best.gain) + (best.gain - (st.gain ?? best.gain)) * a
      }
    }
  }, [showWidgets, refs.length, isLive, playbackState, program1, audioContext, globalSampleCount])

  const drawFilter = useCallback((
    c: CanvasRenderingContext2D,
    ref: FilterRef,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
  ) => {
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
    const leftLabelW = 20
    const bottomLabelH = 14
    const chartX = leftLabelW
    const chartY = pad
    const chartW = Math.max(1, w - chartX)
    const chartH = Math.max(1, h - chartY - bottomLabelH)

    const sr = audioContext?.sampleRate ?? 48000
    const nyquist = Math.max(1, sr / 2)
    const minHz = 20
    const maxHz = Math.min(20000, nyquist)

    const st = stRef.current[ref.filterIndex | 0]
    const cutoff = clamp(st?.cutoff ?? ref.params.cut, minHz, maxHz)
    const q = clamp(st?.q ?? ref.params.q, 0.01, 20)
    const gain = st?.gain ?? ref.params.gain ?? 0

    const minDb = -60
    const maxDb = 24
    const dbToY = (db: number) => {
      const d = clamp(db, minDb, maxDb)
      const t = (d - minDb) / (maxDb - minDb)
      return chartY + (1 - t) * chartH
    }

    c.save()
    c.translate(chartX, 0)

    c.strokeStyle = 'rgba(150,150,150,0.25)'
    c.lineWidth = 1
    c.strokeRect(0.5, chartY + 0.5, chartW - 1, chartH - 1)

    c.font = '9px "Outfit"'
    c.textBaseline = 'middle'
    c.textAlign = 'right'
    c.fillStyle = 'rgba(180,180,180,0.7)'
    c.strokeStyle = 'rgba(180,180,180,0.18)'

    const minMarkDy = clamp(chartH * 0.09, 10, 18)
    const stepChoices = [6, 12, 24]
    let stepDb = 6
    for (const s of stepChoices) {
      const dyUp = Math.abs(dbToY(s) - dbToY(0))
      const dyDown = Math.abs(dbToY(-s) - dbToY(0))
      if (Math.min(dyUp, dyDown) >= minMarkDy) {
        stepDb = s
        break
      }
      stepDb = s
    }

    const markSet = new Set<number>([minDb, 0, maxDb])
    for (let d = stepDb; d <= maxDb; d += stepDb) markSet.add(d)
    for (let d = -stepDb; d >= minDb; d -= stepDb) markSet.add(d)

    const dbMarks = [...markSet].sort((a, b) => b - a)

    for (const v of dbMarks) {
      const yy = dbToY(v)
      if (stepDb === 24 && v === -48) continue
      c.fillText(String(v), -6, yy)
      if (v === 24 || v === -60) continue
      c.beginPath()
      c.moveTo(0, yy + 0.5)
      c.lineTo(chartW, yy + 0.5)
      c.stroke()
    }

    const freqMarks = w < 250
      ? w < 200
        ? [50, 300, 1000, 3000, 10000]
        : [50, 100, 300, 1000, 3000, 10000]
      : [50, 100, 200, 500, 1000, 2000, 5000, 10000]
    c.textAlign = 'center'
    c.textBaseline = 'top'
    c.strokeStyle = 'rgba(180,180,180,0.14)'
    for (const f of freqMarks) {
      if (f < minHz || f > maxHz) continue
      const xx = hzToX(f, minHz, maxHz, chartW)
      c.beginPath()
      c.moveTo(xx + 0.5, chartY)
      c.lineTo(xx + 0.5, chartY + chartH)
      c.stroke()
      const lbl = f >= 1000 ? `${(f / 1000).toFixed(f % 1000 === 0 ? 0 : 1)}k` : String(f)
      c.fillText(lbl, xx, chartY + chartH + 2)
    }

    const cutX = hzToX(cutoff, minHz, maxHz, chartW)
    c.strokeStyle = 'rgba(255,255,0,0.9)'
    c.lineWidth = 1.35
    c.beginPath()
    c.moveTo(cutX - 0.35, chartY)
    c.lineTo(cutX - 0.35, chartY + chartH)
    c.stroke()

    c.strokeStyle = '#ea580c'
    c.lineWidth = 1.35
    c.beginPath()
    const steps = Math.min(256, Math.max(64, chartW | 0))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const hz = minHz * Math.exp(Math.log(maxHz / minHz) * t)
      const db = biquadMagDb(ref.filterType, hz, cutoff, q, gain, sr)
      const px = t * chartW
      const py = dbToY(db)
      if (i === 0) c.moveTo(px, py)
      else c.lineTo(px, py)
    }
    c.stroke()

    c.fillStyle = 'rgba(180,180,180,0.9)'
    c.font = '7pt "Space Mono"'
    c.textBaseline = 'bottom'
    c.textAlign = 'left'
    const cutTxt = cutoff >= 1000
      ? `${(cutoff / 1000).toFixed(cutoff % 1000 === 0 ? 0 : 2)}kHz`
      : `${cutoff.toFixed(0)}Hz`

    if (ref.filterType === 'peak') {
      c.fillText(`cutoff ${cutTxt}`, 6, chartH - 20)
      c.fillText(`gain ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}dB`, 6, chartH - 10)
      c.fillText(`q ${q.toFixed(3)}`, 6, chartH)
    }
    else if (ref.filterType === 'ls' || ref.filterType === 'hs') {
      c.fillText(`cutoff ${cutTxt}`, 6, chartH - 10)
      c.fillText(`gain ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}dB`, 6, chartH)
    }
    else {
      c.fillText(`cutoff ${cutTxt}`, 6, chartH - 10)
      c.fillText(`q ${q.toFixed(3)}`, 6, chartH)
    }

    c.restore()
    c.restore()
  }, [audioContext])

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
        height: 56,
        render: (ctx, x, y, w, h, _vx, _vw) => {
          drawFilter(ctx, ref, y, h, x, w)
        },
      })
    }

    return out
  }, [showWidgets, refs, drawFilter])

  return { widgets, onBeforeDraw }
}
