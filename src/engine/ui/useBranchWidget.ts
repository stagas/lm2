import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'react'
import { BRANCH_HISTORY_ENTRY_SIZE, BRANCH_HISTORY_SIZE } from '../../../as/assembly/constants.ts'
import type { BranchMarkRef } from '../bytecode/bytecode.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { buildLineStarts, spanToWidgetSpans } from './editor-spans.ts'

type UseBranchWidgetParams = {
  program1: ProgramInstance | undefined
  dspSource: string
  showWidgets: boolean
  branchMarks: BranchMarkRef[]
}

export function useBranchWidget({
  program1,
  dspSource,
  showWidgets,
  branchMarks,
}: UseBranchWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const lastWritePosRef = useRef<number>(0)
  const activeByIfPcRef = useRef<Map<number, number>>(new Map())
  const fadingRef = useRef<Map<string, number>>(new Map())
  const frameRef = useRef<Map<number, number>>(new Map())

  const pcSet = useMemo(() => {
    const s = new Set<number>()
    for (const m of branchMarks) s.add(m.pc)
    return s
  }, [branchMarks])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    const history = program1?.program.branchHistory
    if (!history) return
    if (!pcSet.size) return

    const nowSec = performance.now() / 1000
    const writePos = Math.floor(history.writePos) >>> 0
    const prevWritePos = lastWritePosRef.current >>> 0
    lastWritePosRef.current = writePos

    const fading = fadingRef.current

    if (writePos !== prevWritePos) {
      const raw = history.raw
      const MOD = 1 << 20
      const deltaRaw = (writePos - prevWritePos + MOD) % MOD
      const delta = Math.min(deltaRaw, BRANCH_HISTORY_SIZE)
      for (let k = delta; k > 0; k--) {
        const p = (writePos - k) >>> 0
        const slot = p % BRANCH_HISTORY_SIZE
        const base = 1 + slot * BRANCH_HISTORY_ENTRY_SIZE
        const ifPc = Math.floor(raw[base] ?? 0)
        const branchPc = Math.floor(raw[base + 1] ?? 0)
        if (ifPc <= 0 || branchPc <= 0) continue
        if (!pcSet.has(branchPc)) continue

        const activeByIfPc = activeByIfPcRef.current
        const prev = activeByIfPc.get(ifPc)
        if (prev === undefined) {
          activeByIfPc.set(ifPc, branchPc)
        }
        else if (prev !== branchPc) {
          fading.set(ifPc + ':' + prev, nowSec)
          activeByIfPc.set(ifPc, branchPc)
        }
      }
    }

    const FADEOUT_SECONDS = 0.25
    const frame = frameRef.current
    frame.clear()

    const activeByIfPc = activeByIfPcRef.current
    for (const branchPc of activeByIfPc.values()) {
      if (branchPc > 0) frame.set(branchPc, 1)
    }

    for (const [pc, t0] of Array.from(fading.entries())) {
      const age = nowSec - t0
      if (age >= FADEOUT_SECONDS) {
        fading.delete(pc)
        continue
      }
      const a = 1 - age / FADEOUT_SECONDS
      const parts = pc.split(':')
      const branchPc = parts.length >= 2 ? Math.floor(parts[1] ?? 0) : 0
      if (a > 0 && branchPc > 0) frame.set(branchPc, a)
    }
  }, [showWidgets, program1, pcSet])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (branchMarks.length === 0) return []

    const lineStarts = buildLineStarts(dspSource)
    const out: EditorWidget[] = []

    for (const m of branchMarks) {
      const loc = m.loc
      const absStart = (lineStarts[loc.line - 1] ?? 0) + (loc.column - 1)
      const absEnd = absStart + Math.max(1, loc.length)
      const key = m.pc

      for (const span of spanToWidgetSpans(lineStarts, absStart, absEnd)) {
        out.push({
          type: 'overlay',
          line: span.line,
          column: span.column,
          length: span.length,
          render: (ctx, x, y, w, h) => {
            const a = frameRef.current.get(key) ?? 0
            if (a <= 0) return
            ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * a})`
            ctx.fillRect(x - 2, y - 2, w + 4, h - 1)
          },
        })
      }
    }

    return out
  }, [showWidgets, dspSource, branchMarks])

  return { widgets, onBeforeDraw }
}


