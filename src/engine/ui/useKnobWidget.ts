import type { CodeFile, EditorWidget, Theme } from 'mini-code'
import { useMemo, useRef } from 'preact/hooks'
import { updateValueWithSpacing } from './code-number-edit.ts'
import { getCurrentNumberAt, getEditableNumberToken } from './code-number-read.ts'

export type KnobInfo = {
  line: number
  column: number
  length: number
  value: number
  min: number
  max: number
  precision?: number
  mode?: 'linear' | 'exp2'
  stepPerPx?: number
}

type DragState = {
  key: string
  line: number
  column: number
  length: number
  precision: number | undefined
  min: number
  max: number
  mode: 'linear' | 'exp2'
  stepPerPx: number
  y0: number
  value0: number
  value: number
  isDragging: boolean
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function knobNormalized(value: number, min: number, max: number, mode: 'linear' | 'exp2'): number {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const v = clamp(value, lo, hi)
  const range = hi - lo
  if (range <= 0) return 0
  if (mode === 'exp2') {
    const lo2 = Math.max(1e-12, lo)
    const hi2 = Math.max(lo2, hi)
    const v2 = Math.max(lo2, v)
    const denom = Math.log2(hi2 / lo2)
    if (!Number.isFinite(denom) || denom <= 0) return (v2 - lo2) / (hi2 - lo2)
    return clamp(Math.log2(v2 / lo2) / denom, 0, 1)
  }
  return clamp((v - lo) / range, 0, 1)
}

export class KnobWidget {
  private knobKey: string
  private currentWidth: number
  private knobHeight = 24

  constructor(
    private info: KnobInfo,
    private theme: Theme,
    private codeFile: CodeFile,
    private dragStateRef: preact.RefObject<DragState | null>,
    private rafRef: preact.RefObject<number | null>,
  ) {
    this.knobKey = `${info.line}-${info.column}`
    this.currentWidth = Math.max(8, info.length * 8)
  }

  toEditorWidget(): EditorWidget {
    return {
      type: 'below',
      line: this.info.line,
      column: this.info.column,
      length: this.info.length,
      height: this.knobHeight,

      render: (ctx, x, y, width, height) => {
        this.currentWidth = width
        const drag = this.dragStateRef.current

        let value = getCurrentNumberAt(this.codeFile, this.info) ?? this.info.value
        if (drag && drag.line === this.info.line && drag.column === this.info.column && drag.key === this.knobKey) {
          value = drag.value
        }

        const min = Math.min(this.info.min, this.info.max)
        const max = Math.max(this.info.min, this.info.max)
        value = clamp(value, min, max)

        const mode = this.info.mode ?? 'linear'
        const t = knobNormalized(value, min, max, mode)

        const cx = x + width / 2
        const cy = y + height / 2 - 3
        const r = clamp(Math.min(width, height) * 0.5 - 3, 6, 12)

        const a0 = Math.PI * 0.75
        const a1 = Math.PI * 2.25
        const a = a0 + (a1 - a0) * t

        ctx.save()
        ctx.fillStyle = this.theme.background === 'transparent' ? '#000' : this.theme.background
        ctx.beginPath()
        ctx.arc(cx, cy, r + 2, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = 'rgba(140,140,140,0.5)'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(cx, cy, r, a0, a1)
        ctx.stroke()

        ctx.strokeStyle = '#ea580c'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(cx, cy, r, a0, a)
        ctx.stroke()

        ctx.fillStyle = '#ff0'
        ctx.beginPath()
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.1, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      },

      pointerDown: (_x, y) => {
        const min = Math.min(this.info.min, this.info.max)
        const max = Math.max(this.info.min, this.info.max)
        const mode = this.info.mode ?? 'linear'
        const stepPerPx = this.info.stepPerPx ?? ((max - min) / 200)

        const prev = this.dragStateRef.current
        const baseValue =
          (prev?.key === this.knobKey && prev.line === this.info.line && prev.column === this.info.column)
            ? prev.value
            : (getCurrentNumberAt(this.codeFile, this.info) ?? this.info.value)

        this.dragStateRef.current = {
          key: this.knobKey,
          line: this.info.line,
          column: this.info.column,
          length: this.info.length,
          precision: this.info.precision,
          min,
          max,
          mode,
          stepPerPx,
          y0: y,
          value0: baseValue,
          value: baseValue,
          isDragging: true,
        }
      },

      pointerMove: (_x, y) => {
        const drag = this.dragStateRef.current
        if (!drag || !drag.isDragging) return
        if (drag.line !== this.info.line || drag.column !== this.info.column) return

        const dy = ((drag.y0 - y) || 0) * 10
        let v = drag.value0
        if (drag.mode === 'exp2') {
          v = v * Math.pow(2, dy * 0.01)
        }
        else {
          v = v + dy * drag.stepPerPx
        }
        drag.value = clamp(v, drag.min, drag.max)

        if (this.rafRef.current) cancelAnimationFrame(this.rafRef.current)
        this.rafRef.current = requestAnimationFrame(() => {
          this.rafRef.current = null
          const d = this.dragStateRef.current
          const codeFile = this.codeFile
          if (!d || !codeFile) return

          const lines = codeFile.value.split('\n')
          const lineIndex = d.line - 1
          if (lineIndex < 0 || lineIndex >= lines.length) return
          const line = lines[lineIndex]!
          const from = d.column - 1
          const oldStr = getEditableNumberToken(line, from, d.length)
          const newLine = updateValueWithSpacing(line, d.column, oldStr, d.value, d.length, d.precision)
          codeFile.edit(lineIndex, 0, line.length, newLine)
        })
      },

      pointerUp: () => {
        const drag = this.dragStateRef.current
        if (!drag || drag.key !== this.knobKey) return
        drag.isDragging = false
        if (this.rafRef.current) {
          cancelAnimationFrame(this.rafRef.current)
          this.rafRef.current = null
        }

        const codeFile = this.codeFile
        if (!codeFile) return

        const lines = codeFile.value.split('\n')
        const lineIndex = drag.line - 1
        if (lineIndex < 0 || lineIndex >= lines.length) return
        const line = lines[lineIndex]!
        const from = drag.column - 1
        const oldStr = getEditableNumberToken(line, from, drag.length)
        const newLine = updateValueWithSpacing(line, drag.column, oldStr, drag.value, drag.length, drag.precision)
        codeFile.edit(lineIndex, 0, line.length, newLine)
      },
    }
  }
}

type UseKnobWidgetParams = {
  showWidgets: boolean
  knobs: KnobInfo[]
  theme: Theme
  codeFile: CodeFile | undefined
}

export function useKnobWidget({
  showWidgets,
  knobs,
  theme,
  codeFile,
}: UseKnobWidgetParams): { widgets: EditorWidget[] } {
  const dragRef = useRef<DragState | null>(null)
  const rafIdRef = useRef<number | null>(null)

  const widgets = useMemo((): EditorWidget[] => {
    if (!codeFile) return []
    if (!showWidgets) return []
    if (knobs.length === 0) return []
    return knobs.map(info => new KnobWidget(info, theme, codeFile, dragRef, rafIdRef).toEditorWidget())
  }, [showWidgets, knobs, theme, codeFile])

  return { widgets }
}
