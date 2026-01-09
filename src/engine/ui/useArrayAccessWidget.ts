import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'preact/hooks'
import { ARRAY_HISTORY_ENTRY_SIZE, ARRAY_HISTORY_SIZE } from '../../../as/assembly/constants.ts'
import type { ArrayLiteralRef } from '../bytecode/bytecode.ts'
import { TRIG_FADEOUT_SECONDS } from '../constants.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { buildLineStarts, spanToWidgetSpans } from './editor-spans.ts'

function locKey(loc: ArrayLiteralRef['items'][number]): string {
  return `${loc.line}:${loc.column}:${Math.max(1, loc.length)}`
}

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
  const lastTargetSampleRef = useRef<number | null>(null)
  const pendingRef = useRef<Array<{ pc: number; idx: number; at: number }>>([])
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
        const k = locKey(loc)
        const g = groups.get(k)
        if (g) g.idxs.push(i)
        else groups.set(k, { loc, idxs: [i] })
      }
      m.set(lit.pc, Array.from(groups.values()))
    }
    return m
  }, [arrayLiterals])

  const pcToLocKeyByIdx = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const lit of arrayLiterals) {
      const a = new Array<string>(lit.items.length)
      for (let i = 0; i < lit.items.length; i++) a[i] = locKey(lit.items[i]!)
      m.set(lit.pc, a)
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
    const pending = pendingRef.current

    const runtime = useEngineRuntimeStore.getState()
    const pred = runtime.predictedSampleCountResult

    if (pred) {
      const target = pred.sampleCount
      const lastTarget = lastTargetSampleRef.current
      lastTargetSampleRef.current = target
      // Seeking/scrubbing can move time backwards; drop queued future events so they don't block new ones.
      // Also ignore old ring-buffer entries by jumping the cursor to the current writePos.
      if (lastTarget != null && target + 256 < lastTarget) {
        pending.length = 0
        activeIndex.clear()
        fading.clear()
        lastWritePosRef.current = writePos
      }
    }

    const applyAccess = (pc: number, idx: number) => {
      const items = pcToItems.get(pc)
      if (!items || idx < 0 || idx >= items.length) return

      const prev = activeIndex.get(pc)
      if (prev === undefined) {
        activeIndex.set(pc, idx)
        return
      }

      if (prev !== idx) {
        const locKeys = pcToLocKeyByIdx.get(pc)
        if (locKeys?.[prev] !== locKeys?.[idx]) {
          fading.set(pc + ':' + prev, nowSec)
        }
        activeIndex.set(pc, idx)
      }
    }

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
        const lo = Math.floor(raw[base + 2] ?? 0) >>> 0
        const hi = Math.floor(raw[base + 3] ?? 0) >>> 0
        const at = (lo + hi * 65536) >>> 0

        if (pred) {
          pending.push({ pc, idx, at })
          continue
        }

        applyAccess(pc, idx)
      }
    }

    if (pred) {
      const target = pred.sampleCount
      let w = 0
      for (let i = 0; i < pending.length; i++) {
        const e = pending[i]!
        if (e.at <= target) {
          applyAccess(e.pc, e.idx)
        }
        else {
          pending[w++] = e
        }
      }
      pending.length = w
      if (pending.length > 4096) pending.splice(0, pending.length - 4096)
    }

    const frame = frameRef.current
    frame.clear()

    // active entries: full opacity
    for (const [pc, idx] of activeIndex.entries()) {
      frame.set(pc + ':' + idx, 1)
    }

    // fading entries: compute alpha, remove expired
    for (const [key, t0] of Array.from(fading.entries())) {
      const age = nowSec - t0
      if (age >= TRIG_FADEOUT_SECONDS) {
        fading.delete(key)
        continue
      }
      const a = 1 - age / TRIG_FADEOUT_SECONDS
      if (a > 0) frame.set(key, a)
    }
  }, [showWidgets, program1, pcToItems, pcToLocKeyByIdx])

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
              ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * (a ** 0.25)})`
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
