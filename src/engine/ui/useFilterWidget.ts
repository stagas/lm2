import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import { FILTER_DATA_OFFSET, FILTER_ENTRY_SIZE, FILTER_HISTORY_SIZE } from '../../../as/assembly/constants.ts'
import type { FilterRef } from '../bytecode/types.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { getCurrentTheme } from './theme.ts'

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

function svfMagDb(type: string, freqHz: number, cutHz: number, q: number, sampleRate: number): number {
  // Matches the DSP implementation in `as/assembly/gen/svf.ts`.
  const nyquist = Math.max(1, sampleRate / 2)
  const cut = clamp(cutHz, 50, nyquist)
  const Q = clamp(q, 0.01, 0.985)

  const g = Math.tan((Math.PI * cut) / sampleRate)
  const k = 2.0 - 2.0 * Q
  const a1 = 1.0 / (1.0 + g * (g + k))
  const a2 = g * a1
  const a3 = g * a2

  // State-space (x = [c1, c2]) derived from the DSP update equations:
  // c1' = (2a1-1)c1 + (-2a2)c2 + (2a2)u
  // c2' = (2a2)c1 + (1-2a3)c2 + (2a3)u
  const A11 = 2 * a1 - 1
  const A12 = -2 * a2
  const A21 = 2 * a2
  const A22 = 1 - 2 * a3
  const B1 = 2 * a2
  const B2 = 2 * a3

  // Output selection (y = Cx + Du).
  let C1 = 0
  let C2 = 0
  let D = 0

  if (type === 'slp') {
    // v2
    C1 = a2
    C2 = 1 - a3
    D = a3
  }
  else if (type === 'sbp') {
    // v1
    C1 = a1
    C2 = -a2
    D = a2
  }
  else if (type === 'shp') {
    // v0 - k*v1 - v2
    C1 = -k * a1 - a2
    C2 = k * a2 - (1 - a3)
    D = 1 - k * a2 - a3
  }
  else if (type === 'sbs') {
    // v0 - k*v1
    C1 = -k * a1
    C2 = k * a2
    D = 1 - k * a2
  }
  else if (type === 'speak') {
    // v0 - k*v1 - 2*v2
    C1 = -k * a1 - 2 * a2
    C2 = k * a2 - 2 * (1 - a3)
    D = 1 - k * a2 - 2 * a3
  }
  else if (type === 'sap') {
    // v0 - 2*k*v1
    C1 = -2 * k * a1
    C2 = 2 * k * a2
    D = 1 - 2 * k * a2
  }

  const w = (Math.PI * 2 * clamp(freqHz, 1e-6, nyquist)) / sampleRate
  const zr = Math.cos(w)
  const zi = Math.sin(w)

  // (zI - A) inverse times B via 2x2 adjugate.
  // m11 = z - A11 (complex), m22 = z - A22 (complex), m12 = -A12 (real), m21 = -A21 (real)
  const m11r = zr - A11
  const m11i = zi
  const m22r = zr - A22
  const m22i = zi
  const m12r = -A12
  const m21r = -A21

  // det = m11*m22 - m12*m21
  const p1r = m11r * m22r - m11i * m22i
  const p1i = m11r * m22i + m11i * m22r
  const p2r = m12r * m21r
  const detr = p1r - p2r
  const deti = p1i
  const den = detr * detr + deti * deti
  if (den <= 0) return -240

  // y = adj(zI-A) * B
  // y1 = m22*B1 + (-m12)*B2
  const y1r = m22r * B1 + (-m12r) * B2
  const y1i = m22i * B1
  // y2 = (-m21)*B1 + m11*B2
  const y2r = (-m21r) * B1 + m11r * B2
  const y2i = m11i * B2

  // x = y / det
  const x1r = (y1r * detr + y1i * deti) / den
  const x1i = (y1i * detr - y1r * deti) / den
  const x2r = (y2r * detr + y2i * deti) / den
  const x2i = (y2i * detr - y2r * deti) / den

  const Hr = C1 * x1r + C2 * x2r + D
  const Hi = C1 * x1i + C2 * x2i
  const mag = Math.sqrt(Hr * Hr + Hi * Hi)
  return 20 * Math.log10(Math.max(1e-12, mag))
}

function moogMagDb(type: string, freqHz: number, cutHz: number, q: number, sampleRate: number): number {
  const nyquist = Math.max(1, sampleRate / 2)
  const freq = clamp(cutHz, 50, nyquist)
  const Q = clamp(q, 0.01, 0.985)

  // Linearized frequency response derived from the exact per-sample ladder update in `as/assembly/gen/moog.ts`,
  // using tanha'(0)=1 (small-signal approximation). This matches the coefficient math in updateCoeffs().
  const kVt = 1.2
  const v2 = 2.0 + kVt
  const kfc = freq / sampleRate
  const kfcr = 1.873 * (kfc * kfc * kfc) + 0.4955 * (kfc * kfc) - 0.649 * kfc + 0.9988
  const expOut = Math.exp(-2.0 * Math.PI * kfcr * kfc)
  const k2vg = v2 * (1.0 - expOut)
  const kacr = Q * (-3.9364 * (kfc * kfc) + 1.8409 * kfc + 0.9968)
  const postGain = 1.0001784074555027 + 0.9331585678097162 * Q

  const g = k2vg / v2
  const oneMinusG = 1 - g
  if (Math.abs(oneMinusG) < 1e-9) return -240

  // x = [s1,s2,s3,s4] where si correspond to m_azt1..m_azt4.
  // x[n+1] = A x[n] + B u[n]
  const A11 = oneMinusG
  const A12 = 0
  const A13 = 0
  const A14 = -g * kacr

  const A21 = g * oneMinusG
  const A22 = oneMinusG
  const A23 = 0
  const A24 = -(g * g) * kacr

  const A31 = (g * g) * oneMinusG
  const A32 = g * oneMinusG
  const A33 = oneMinusG
  const A34 = -(g * g * g) * kacr

  const A41 = (g * g * g) * oneMinusG
  const A42 = (g * g) * oneMinusG
  const A43 = g * oneMinusG
  const A44 = oneMinusG - (g * g * g * g) * kacr

  const B1 = g * oneMinusG
  const B2 = (g * g) * oneMinusG
  const B3 = (g * g * g) * oneMinusG
  const B4 = (g * g * g * g) * oneMinusG

  // y[n] = C x[n] + D u[n]
  let C1 = 0
  let C2 = 0
  let C3 = 0
  let C4 = 0
  let D = 0

  {
    const g2 = g * g
    const g3 = g2 * g
    const g4 = g2 * g2

    if (type === 'mlp') {
      // az4 = g^3*s1 + g^2*s2 + g*s3 + (1 - g^4*kacr/(1-g))*s4 + g^4*u
      C1 = postGain * g3
      C2 = postGain * g2
      C3 = postGain * g
      C4 = postGain * (1 - (g4 * kacr) / oneMinusG)
      D = postGain * g4
    }
    else {
      // (x1 - 3*az3 + 2*az4) * postGain
      C1 = postGain * (g2 * (-3 + 2 * g))
      C2 = postGain * (g * (-3 + 2 * g))
      C3 = postGain * (-3 + 2 * g)
      C4 = postGain * (2 + (kacr * (-1 + 3 * g3 - 2 * g4)) / oneMinusG)
      D = postGain * (1 - 3 * g3 + 2 * g4)
    }
  }

  const w = (Math.PI * 2 * clamp(freqHz, 1e-6, nyquist)) / sampleRate
  const zr = Math.cos(w)
  const zi = Math.sin(w)

  // Solve (zI - A) x = B (complex 4x4 elimination).
  const mr = new Float64Array(16)
  const mi = new Float64Array(16)
  const br = new Float64Array(4)
  const bi = new Float64Array(4)

  // zI - A
  mr[0] = zr - A11
  mi[0] = zi
  mr[1] = -A12
  mi[1] = 0
  mr[2] = -A13
  mi[2] = 0
  mr[3] = -A14
  mi[3] = 0

  mr[4] = -A21
  mi[4] = 0
  mr[5] = zr - A22
  mi[5] = zi
  mr[6] = -A23
  mi[6] = 0
  mr[7] = -A24
  mi[7] = 0

  mr[8] = -A31
  mi[8] = 0
  mr[9] = -A32
  mi[9] = 0
  mr[10] = zr - A33
  mi[10] = zi
  mr[11] = -A34
  mi[11] = 0

  mr[12] = -A41
  mi[12] = 0
  mr[13] = -A42
  mi[13] = 0
  mr[14] = -A43
  mi[14] = 0
  mr[15] = zr - A44
  mi[15] = zi

  br[0] = B1
  bi[0] = 0
  br[1] = B2
  bi[1] = 0
  br[2] = B3
  bi[2] = 0
  br[3] = B4
  bi[3] = 0

  const n = 4
  for (let k = 0; k < n; k++) {
    let piv = k
    let best = 0
    for (let r = k; r < n; r++) {
      const idx = r * 4 + k
      const mag2 = mr[idx] * mr[idx] + mi[idx] * mi[idx]
      if (mag2 > best) {
        best = mag2
        piv = r
      }
    }
    if (best < 1e-18) return -240

    if (piv !== k) {
      for (let c = k; c < n; c++) {
        const a = k * 4 + c
        const b = piv * 4 + c
        const tr = mr[a]
        mr[a] = mr[b]
        mr[b] = tr
        const ti = mi[a]
        mi[a] = mi[b]
        mi[b] = ti
      }
      const trb = br[k]
      br[k] = br[piv]
      br[piv] = trb
      const tib = bi[k]
      bi[k] = bi[piv]
      bi[piv] = tib
    }

    const kk = k * 4 + k
    const pr = mr[kk]
    const pi = mi[kk]
    const inv = 1 / (pr * pr + pi * pi)
    const invr = pr * inv
    const invi = -pi * inv

    for (let c = k; c < n; c++) {
      const idx = k * 4 + c
      const ar = mr[idx]
      const ai = mi[idx]
      mr[idx] = ar * invr - ai * invi
      mi[idx] = ar * invi + ai * invr
    }
    {
      const ar = br[k]
      const ai = bi[k]
      br[k] = ar * invr - ai * invi
      bi[k] = ar * invi + ai * invr
    }

    for (let r = 0; r < n; r++) {
      if (r === k) continue
      const rk = r * 4 + k
      const fr = mr[rk]
      const fi = mi[rk]
      if (fr === 0 && fi === 0) continue

      for (let c = k; c < n; c++) {
        const rc = r * 4 + c
        const kc = k * 4 + c
        const ar = mr[kc]
        const ai = mi[kc]
        mr[rc] -= fr * ar - fi * ai
        mi[rc] -= fr * ai + fi * ar
      }
      br[r] -= fr * br[k] - fi * bi[k]
      bi[r] -= fr * bi[k] + fi * br[k]
    }
  }

  const Hr = C1 * br[0] + C2 * br[1] + C3 * br[2] + C4 * br[3] + D
  const Hi = C1 * bi[0] + C2 * bi[1] + C3 * bi[2] + C4 * bi[3]
  const mag = Math.sqrt(Hr * Hr + Hi * Hi)
  return 20 * Math.log10(Math.max(1e-12, mag))
}

function filterMagDb(type: string, freqHz: number, cutHz: number, q: number, gainDb: number,
  sampleRate: number): number
{
  // SVF filters
  if (type === 'slp' || type === 'shp' || type === 'sbp' || type === 'sbs' || type === 'speak' || type === 'sap') {
    return svfMagDb(type, freqHz, cutHz, q, sampleRate)
  }
  // Moog filters
  if (type === 'mlp' || type === 'mhp') {
    return moogMagDb(type, freqHz, cutHz, q, sampleRate)
  }
  return biquadMagDb(type, freqHz, cutHz, q, gainDb, sampleRate)
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
  const lastSampleCountRef = useRef<number | null>(null)

  useEffect(() => {
    lastWritePosRef.current = 0
    stRef.current.length = 0
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
      lastSampleCountRef.current = null
      return
    }

    const pred = useEngineRuntimeStore.getState().predictedSampleCountResult
    if (!pred) return

    const MOD = 1 << 20
    const nowMod = (Math.floor(pred.sampleCount) >>> 0) & (MOD - 1)
    // const lastSampleCount = lastSampleCountRef.current ?? pred.sampleCount
    lastSampleCountRef.current = pred.sampleCount
    // const dt = Math.max(0, (pred.sampleCount - lastSampleCount) / pred.sampleRate)
    // const tau = 0.015
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
    const isSvf = ref.filterType === 'slp'
      || ref.filterType === 'shp'
      || ref.filterType === 'sbp'
      || ref.filterType === 'sbs'
      || ref.filterType === 'speak'
      || ref.filterType === 'sap'

    const isMoog = ref.filterType === 'mlp' || ref.filterType === 'mhp'

    const cutoff = clamp(st?.cutoff ?? ref.params.cut, (isSvf || isMoog) ? 50 : minHz, maxHz)
    const q = clamp(st?.q ?? ref.params.q, 0.01, (isSvf || isMoog) ? 0.985 : 20)
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
    c.strokeRect(0, chartY + 0.5, chartW, chartH)

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
        ? w < 100
          ? [50, 1000, 10000]
          : [50, 300, 1000, 3000, 10000]
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
      const db = filterMagDb(ref.filterType, hz, cutoff, q, gain, sr)
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
      c.fillText(`c:${cutTxt}`, 6, chartH - 20)
      c.fillText(`q:${q.toFixed(3)}`, 6, chartH - 10)
      c.fillText(`g:${gain >= 0 ? '+' : ''}${gain.toFixed(1)}dB`, 6, chartH)
    }
    else if (ref.filterType === 'ls' || ref.filterType === 'hs') {
      c.fillText(`c:${cutTxt}`, 6, chartH - 10)
      c.fillText(`g:${gain >= 0 ? '+' : ''}${gain.toFixed(1)}dB`, 6, chartH)
    }
    else {
      c.fillText(`c:${cutTxt}`, 6, chartH - 10)
      c.fillText(`q:${q.toFixed(3)}`, 6, chartH)
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
        height: 40,
        render: (ctx, x, y, w, h, _vx, _vw) => {
          drawFilter(ctx, ref, y, h, x, w)
        },
      })
    }

    return out
  }, [showWidgets, refs, drawFilter])

  return { widgets, onBeforeDraw }
}
