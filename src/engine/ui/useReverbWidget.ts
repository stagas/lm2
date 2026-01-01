import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'preact/hooks'
import { REVERB_DATA_OFFSET, REVERB_ENTRY_SIZE, REVERB_HISTORY_SIZE } from '../../../as/assembly/constants.ts'
import type { ReverbRef } from '../bytecode/types.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { getCurrentTheme } from './theme.ts'

type UseReverbWidgetParams = {
  program1: ProgramInstance | undefined
  reverbRefs: ReverbRef[] | undefined
  showWidgets: boolean
  isLive: boolean
  playbackState: 'stopped' | 'running' | 'paused'
}

export function useReverbWidget({
  program1,
  reverbRefs,
  showWidgets,
  isLive,
  playbackState,
}: UseReverbWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const refs = reverbRefs ?? []

  type St = { roomSize: number; targetRoomSize: number }
  const stRef = useRef<Array<St | undefined>>([])
  const lastWritePosRef = useRef<number>(0)

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!refs.length) return
    if (!isLive) return

    const history = program1?.program.reverbHistory
    if (!history) return

    const writePos = Math.floor(history.writePos) >>> 0
    if (playbackState !== 'running') {
      lastWritePosRef.current = writePos
      return
    }

    const prevWritePos = lastWritePosRef.current >>> 0
    lastWritePosRef.current = writePos

    if (writePos === prevWritePos) return

    const raw = history.raw
    const MOD = 1 << 20
    const deltaRaw = (writePos - prevWritePos + MOD) % MOD
    const delta = Math.min(deltaRaw, REVERB_HISTORY_SIZE)

    for (let k = delta; k > 0; k--) {
      const p = (writePos - k) >>> 0
      const slot = p % REVERB_HISTORY_SIZE
      const base = REVERB_DATA_OFFSET + slot * REVERB_ENTRY_SIZE

      const idx = Math.floor(raw[base] ?? 0)
      const roomSize = raw[base + 1] ?? 0

      if (idx < 0 || idx > 63) continue

      let st = stRef.current[idx]
      if (!st) {
        st = { roomSize, targetRoomSize: roomSize }
        stRef.current[idx] = st
      }

      st.targetRoomSize = roomSize
    }
  }, [showWidgets, refs.length, isLive, playbackState, program1])

  const widgets = useMemo(() => {
    const out: EditorWidget[] = []

    for (const ref of refs) {
      out.push({
        type: 'above',
        line: ref.aboveLoc.line,
        column: ref.aboveLoc.column,
        length: Math.max(1, ref.aboveLoc.length),
        height: 40,
        culling: false,
        render: (c, x, y, w, h) => {
          const st = stRef.current[ref.reverbIndex | 0]
          if (st) {
            const smoothFactor = 0.15
            st.roomSize = st.roomSize + (st.targetRoomSize - st.roomSize) * smoothFactor
          }
          const roomSize = st?.roomSize ?? ref.params.roomSize

          c.save()
          c.translate(x, y)

          const theme = getCurrentTheme()
          c.fillStyle = theme.background
          c.fillRect(0, 0, w, h)

          const primary = theme.colors.function
          const pad = 0
          const c30 = 0.8660254037844386
          const s30 = 0.35

          const dxCoef = 0.68
          const dzCoef = 0.48
          const dyCoef = 0.48
          const sumCoef = dxCoef + dzCoef

          const maxSx = (w - pad * 2) / Math.max(1e-6, c30 * sumCoef)
          const maxSy = (h - pad * 2) / Math.max(1e-6, dyCoef + s30 * sumCoef)
          const maxS = Math.min(maxSx, maxSy)
          const s = Math.max(0, roomSize * (maxS - 6)) + 6

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

          const A = proj(0, 0, 0)
          const B = proj(dx, 0, 0)
          const Cc = proj(dx, 0, dz)
          const D = proj(0, 0, dz)
          const A2 = proj(0, dy, 0)
          const B2 = proj(dx, dy, 0)
          const C2 = proj(dx, dy, dz)
          const D2 = proj(0, dy, dz)

          c.lineWidth = 1.35

          c.save()
          c.fillStyle = primary
          c.globalAlpha = 0.15

          c.beginPath()
          c.moveTo(A[0], A[1])
          c.lineTo(B[0], B[1])
          c.lineTo(Cc[0], Cc[1])
          c.lineTo(D[0], D[1])
          c.closePath()
          c.fill()

          c.beginPath()
          c.moveTo(A[0], A[1])
          c.lineTo(D[0], D[1])
          c.lineTo(D2[0], D2[1])
          c.lineTo(A2[0], A2[1])
          c.closePath()
          c.fill()

          c.beginPath()
          c.moveTo(A[0], A[1])
          c.lineTo(B[0], B[1])
          c.lineTo(B2[0], B2[1])
          c.lineTo(A2[0], A2[1])
          c.closePath()
          c.fill()

          c.beginPath()
          c.moveTo(D[0], D[1])
          c.lineTo(Cc[0], Cc[1])
          c.lineTo(C2[0], C2[1])
          c.lineTo(D2[0], D2[1])
          c.closePath()
          c.fill()

          c.beginPath()
          c.lineTo(B[0], B[1])
          c.lineTo(Cc[0], Cc[1])
          c.lineTo(C2[0], C2[1])
          c.lineTo(B2[0], B2[1])
          c.closePath()
          c.fill()

          c.restore()

          c.strokeStyle = primary
          c.globalAlpha = 0.9
          c.beginPath()
          c.moveTo(A[0], A[1])
          c.lineTo(B[0], B[1])
          c.lineTo(Cc[0], Cc[1])
          c.lineTo(D[0], D[1])
          c.closePath()
          c.moveTo(A[0], A[1])
          c.lineTo(A2[0], A2[1])
          c.moveTo(B[0], B[1])
          c.lineTo(B2[0], B2[1])
          c.moveTo(D[0], D[1])
          c.lineTo(D2[0], D2[1])
          c.moveTo(Cc[0], Cc[1])
          c.lineTo(C2[0], C2[1])
          c.moveTo(A2[0], A2[1])
          c.lineTo(B2[0], B2[1])
          c.lineTo(C2[0], C2[1])
          c.lineTo(D2[0], D2[1])
          c.closePath()
          c.stroke()

          c.restore()
        },
      })
    }

    return out
  }, [refs])

  return { widgets, onBeforeDraw }
}


