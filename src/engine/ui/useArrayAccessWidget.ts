import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'react'
import { ARRAY_HISTORY_ENTRY_SIZE, ARRAY_HISTORY_SIZE } from '../../../as/assembly/constants.ts'
import type { ArrayLiteralRef } from '../bytecode/bytecode.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { buildLineStarts, spanToWidgetSpans } from './editor-spans.ts'

type UseArrayAccessWidgetParams = {
  program1: ProgramInstance | undefined
  dspSource: string
  showWidgets: boolean
  arrayLiterals: ArrayLiteralRef[]
}

export function useArrayAccessWidget({
  program1,
  dspSource,
  showWidgets,
  arrayLiterals,
}: UseArrayAccessWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const lastWritePosRef = useRef<number>(0)
  // active index per array pc (keep highlighted until index changes)
  const activeIndexRef = useRef<Map<number, number>>(new Map())
  // fading map for previous indices: key = "pc:idx" -> startTime
  const fadingRef = useRef<Map<string, number>>(new Map())
  const frameRef = useRef<Map<string, number>>(new Map())

  const pcToItems = useMemo(() => {
    const m = new Map<number, ArrayLiteralRef['items']>()
    for (const lit of arrayLiterals) m.set(lit.pc, lit.items)
    return m
  }, [arrayLiterals])

  const pcToLocGroups = useMemo(() => {
    const m = new Map<number, Array<{ loc: ArrayLiteralRef['items'][number]; idxs: number[] }>>()
    for (const lit of arrayLiterals) {
      const groups = new Map<string, { loc: ArrayLiteralRef['items'][number]; idxs: number[] }>()
      for (let i = 0; i < lit.items.length; i++) {
        const loc = lit.items[i]!
        const k = `${loc.line}:${loc.column}:${loc.length}`
        const g = groups.get(k)
        if (g) g.idxs.push(i)
        else groups.set(k, { loc, idxs: [i] })
      }
      m.set(lit.pc, Array.from(groups.values()))
    }
    return m
  }, [arrayLiterals])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    const history = program1?.program.arrayAccessHistory
    if (!history) return

    const nowSec = performance.now() / 1000
    const writePos = Math.floor(history.writePos) >>> 0
    const prevWritePos = lastWritePosRef.current >>> 0
    lastWritePosRef.current = writePos

    const activeIndex = activeIndexRef.current
    const fading = fadingRef.current

    if (writePos !== prevWritePos) {
      const raw = history.raw
      const MOD = 1 << 20
      const deltaRaw = (writePos - prevWritePos + MOD) % MOD
      const delta = Math.min(deltaRaw, ARRAY_HISTORY_SIZE)
      for (let k = delta; k > 0; k--) {
        const p = (writePos - k) >>> 0
        const slot = p % ARRAY_HISTORY_SIZE
        const base = 1 + slot * ARRAY_HISTORY_ENTRY_SIZE
        const pc = Math.floor(raw[base] ?? 0)
        const idx = Math.floor(raw[base + 1] ?? 0)
        if (pc <= 0 || idx < 0) continue
        const items = pcToItems.get(pc)
        if (!items || idx >= items.length) continue

        const prev = activeIndex.get(pc)
        if (prev === undefined) {
          // first seen index for this array -> set active
          activeIndex.set(pc, idx)
        }
        else if (prev !== idx) {
          // index changed -> start fading previous entry, activate new
          fading.set(pc + ':' + prev, nowSec)
          activeIndex.set(pc, idx)
        }
        // if prev === idx => leave as active (no fade)
      }
    }

    const FADEOUT_SECONDS = 0.25
    const frame = frameRef.current
    frame.clear()

    // active entries: full opacity
    for (const [pc, idx] of activeIndex.entries()) {
      frame.set(pc + ':' + idx, 1)
    }

    // fading entries: compute alpha, remove expired
    for (const [key, t0] of Array.from(fading.entries())) {
      const age = nowSec - t0
      if (age >= FADEOUT_SECONDS) {
        fading.delete(key)
        continue
      }
      const a = 1 - age / FADEOUT_SECONDS
      if (a > 0) frame.set(key, a)
    }
  }, [showWidgets, program1, pcToItems])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (arrayLiterals.length === 0) return []

    const lineStarts = buildLineStarts(dspSource)
    const out: EditorWidget[] = []

    for (const lit of arrayLiterals) {
      const groups = pcToLocGroups.get(lit.pc) ?? []
      for (const g of groups) {
        const loc = g.loc
        const absStart = (lineStarts[loc.line - 1] ?? 0) + (loc.column - 1)
        const absEnd = absStart + Math.max(1, loc.length)
        const keys = g.idxs.map(i => lit.pc + ':' + i)

        for (const span of spanToWidgetSpans(lineStarts, absStart, absEnd)) {
          out.push({
            type: 'overlay',
            line: span.line,
            column: span.column,
            length: span.length,
            render: (ctx, x, y, w, h) => {
              let a = 0
              const frame = frameRef.current
              for (let ki = 0; ki < keys.length; ki++) {
                const v = frame.get(keys[ki]!) ?? 0
                if (v > a) a = v
              }
              if (a <= 0) return
              ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * a})`
              ctx.fillRect(x - 2, y - 2, w + 4, h - 1)
              // ctx.strokeStyle = `rgba(255, 255, 255, ${a})`
              // ctx.lineWidth = 1
              // ctx.strokeRect(x - 2, y - 2, w + 4, h - 1)
            },
          })
        }
      }
    }

    return out
  }, [showWidgets, dspSource, arrayLiterals])

  return { widgets, onBeforeDraw }
}
