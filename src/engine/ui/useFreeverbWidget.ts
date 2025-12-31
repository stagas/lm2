import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import { FREEVERB_DATA_OFFSET, FREEVERB_ENTRY_SIZE, FREEVERB_HISTORY_SIZE } from '../../../as/assembly/constants.ts'
import type { FreeverbRef } from '../bytecode/types.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { getCurrentTheme } from './theme.ts'

type UseFreeverbWidgetParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  freeverbRefs: FreeverbRef[] | undefined
  dspSource: string
  showWidgets: boolean
  isLive: boolean
  playbackState: 'stopped' | 'running' | 'paused'
}

export function useFreeverbWidget({
  program1,
  audioContext,
  globalSampleCount,
  freeverbRefs,
  dspSource,
  showWidgets,
  isLive,
  playbackState,
}: UseFreeverbWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const refs = freeverbRefs ?? []

  type St = { size: number; damp: number; width: number }
  const stRef = useRef<Array<St | undefined>>([])
  const lastWritePosRef = useRef<number>(0)

  useEffect(() => {
    lastWritePosRef.current = 0
    stRef.current.length = 0
  }, [dspSource])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!refs.length) return
    if (!isLive) return

    const history = program1?.program.freeverbHistory
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
      const delta = Math.min(deltaRaw, FREEVERB_HISTORY_SIZE)

      for (let k = delta; k > 0; k--) {
        const p = (writePos - k) >>> 0
        const slot = p % FREEVERB_HISTORY_SIZE
        const base = FREEVERB_DATA_OFFSET + slot * FREEVERB_ENTRY_SIZE

        const idx = Math.floor(raw[base] ?? 0)
        const size = raw[base + 1] ?? 0
        const damp = raw[base + 2] ?? 0
        const width = raw[base + 3] ?? 0

        if (idx < 0 || idx > 63) continue

        let st = stRef.current[idx]
        if (!st) {
          st = { size, damp, width }
          stRef.current[idx] = st
        }

        st.size = size
        st.damp = damp
        st.width = width
      }
    }
  }, [showWidgets, refs.length, isLive, playbackState, program1])

  const widgets = useMemo(() => {
    const out: EditorWidget[] = []

    for (const ref of refs) {
      const st = stRef.current[ref.freeverbIndex | 0]
      const size = st?.size ?? ref.params.size
      const width = st?.width ?? ref.params.width

      out.push({
        type: 'above',
        line: ref.aboveLoc.line,
        column: ref.aboveLoc.column,
        length: Math.max(1, ref.aboveLoc.length),
        height: 56,
        culling: false,
        render: (c, x, y, w, h, _vx, _vw) => {

          c.save()
          c.translate(x, y)

          const theme = getCurrentTheme()
          c.fillStyle = theme.background
          c.fillRect(0, 0, w, h)

          // Isometric "room" (open front/top): floor + two walls. Use one theme color and vary alpha.
          const primary = theme.colors.function
          const pad = 6
          const c30 = 0.8660254037844386
          const s30 = 0.5

          const w01 = Math.max(0, Math.min(1, width))
          const skew = (w01 - 0.5) * 0.8
          const dxCoef = Math.max(0.45, 1.1 + skew)
          const dzCoef = Math.max(0.45, 0.8 - skew)
          const dyCoef = 0.68
          const sumCoef = dxCoef + dzCoef

          const maxSx = (w - pad * 2) / Math.max(1e-6, c30 * sumCoef)
          const maxSy = (h - pad * 2) / Math.max(1e-6, dyCoef + s30 * sumCoef)
          const s = Math.max(6, Math.min(size * 40, maxSx, maxSy))

          const ox = w / 2
          const dx = s * dxCoef
          const dz = s * dzCoef
          const dy = s * dyCoef
          const oyMin = pad + dy
          const oyMax = h - pad - s30 * (dx + dz)
          const oy = oyMin + (oyMax - oyMin) * 0.5

          const proj = (xx: number, yy: number, zz: number) => {
            const px = ox + xx * c30 - zz * c30
            const py = oy + xx * s30 + zz * s30 - yy
            return [px, py] as const
          }

          // Corner at A, walls extend along +X (right) and +Z (left)
          const A = proj(0, 0, 0)
          const B = proj(dx, 0, 0)
          const C = proj(dx, 0, dz)
          const D = proj(0, 0, dz)
          const A2 = proj(0, dy, 0)
          const B2 = proj(dx, dy, 0)
          const C2 = proj(dx, dy, dz)
          const D2 = proj(0, dy, dz)

          c.lineWidth = 1.5

          c.save()
          c.fillStyle = primary

          // Floor
          c.globalAlpha = 0.1
          c.beginPath()
          c.moveTo(A[0], A[1])
          c.lineTo(B[0], B[1])
          c.lineTo(C[0], C[1])
          c.lineTo(D[0], D[1])
          c.closePath()
          c.fill()

          // Left wall (along +Z)
          c.globalAlpha = 0.14
          c.beginPath()
          c.moveTo(A[0], A[1])
          c.lineTo(D[0], D[1])
          c.lineTo(D2[0], D2[1])
          c.lineTo(A2[0], A2[1])
          c.closePath()
          c.fill()

          // Right wall (along +X)
          c.globalAlpha = 0.18
          c.beginPath()
          c.moveTo(A[0], A[1])
          c.lineTo(B[0], B[1])
          c.lineTo(B2[0], B2[1])
          c.lineTo(A2[0], A2[1])
          c.closePath()
          c.fill()

          // Back wall
          c.globalAlpha = 0.12
          c.beginPath()
          c.moveTo(D[0], D[1])
          c.lineTo(C[0], C[1])
          c.lineTo(C2[0], C2[1])
          c.lineTo(D2[0], D2[1])
          c.closePath()
          c.fill()
          c.restore()

          // Wireframe (room edges)
          c.strokeStyle = primary
          c.globalAlpha = 0.9
          c.beginPath()
          c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.lineTo(C[0], C[1]); c.lineTo(D[0], D[1]); c.closePath()
          c.moveTo(A[0], A[1]); c.lineTo(A2[0], A2[1])
          c.moveTo(B[0], B[1]); c.lineTo(B2[0], B2[1])
          c.moveTo(D[0], D[1]); c.lineTo(D2[0], D2[1])
          c.moveTo(C[0], C[1]); c.lineTo(C2[0], C2[1])
          c.moveTo(A2[0], A2[1]); c.lineTo(B2[0], B2[1]); c.lineTo(C2[0], C2[1]); c.lineTo(D2[0], D2[1]); c.closePath()
          c.stroke()

          c.restore()
        },
      })
    }

    return out
  }, [refs])

  return { widgets, onBeforeDraw }
}
