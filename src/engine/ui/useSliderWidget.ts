import type { CodeFile, EditorWidget, Theme } from 'mini-code'
import { useMemo, useRef } from 'preact/hooks'
import type { NumberWithParamsInfo } from '../bytecode/bytecode.ts'
import { updateValueWithSpacing } from './code-number-edit.ts'
import { getCurrentNumberAt, getEditableNumberToken } from './code-number-read.ts'

type DragState = {
  key: string
  value: number
  min: number
  max: number
  line: number
  column: number
  length: number
  precision: number
  x: number
  y: number
  width: number
  isDragging: boolean
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export class SliderWidget {
  private sliderKey: string
  private currentWidth: number
  private sliderHeight = 20
  private padding = 0
  private handleRadius = 7

  constructor(
    private info: NumberWithParamsInfo,
    private theme: Theme,
    private codeFile: CodeFile,
    private dragStateRef: preact.RefObject<DragState | null>,
    private rafRef: preact.RefObject<number | null>,
  ) {
    this.sliderKey = `${info.line}-${info.column}`
    this.currentWidth = (info.widgetLength || info.length) * 8
  }

  toEditorWidget(): EditorWidget {
    return {
      type: 'below',
      line: this.info.line,
      column: this.info.column,
      length: this.info.widgetLength || this.info.length,
      height: this.sliderHeight,

      render: (ctx, x, y, width, height) => {
        y -= 2
        this.currentWidth = width
        const drag = this.dragStateRef.current

        let value: number
        if (drag && drag.line === this.info.line && drag.column === this.info.column && drag.key === this.sliderKey) {
          value = drag.value
          if (drag.isDragging) {
            drag.x = x
            drag.y = y
            drag.width = width
            drag.min = this.info.min
            drag.max = this.info.max
            drag.key = this.sliderKey
          }
        }
        else {
          value = getCurrentNumberAt(this.codeFile, this.info) ?? this.info.value
        }

        const min = Math.min(this.info.min, this.info.max)
        const max = Math.max(this.info.min, this.info.max)
        value = clamp(value, min, max)
        const range = max - min
        let normalized: number
        if (range > 0) {
          const linearNormalized = clamp((value - min) / range, 0, 1)
          if (this.info.exp && this.info.exp !== 1) {
            // Apply exponential scaling for display
            normalized = Math.pow(linearNormalized, 1 / this.info.exp)
          }
          else {
            normalized = linearNormalized
          }
        }
        else {
          normalized = 0
        }

        ctx.fillStyle = this.theme.colors.function || '#666'
        ctx.fillRect(x + this.padding, y + height / 2 - 1, width - this.padding * 2, 2)

        const trackWidth = width - this.padding * 2
        const handleX = x + this.padding + this.handleRadius + normalized * (trackWidth - 2 * this.handleRadius)
        const handleY = y + height / 2

        ctx.fillStyle = this.theme.background === 'transparent' ? '#000' : this.theme.background
        ctx.beginPath()
        ctx.arc(handleX, handleY, this.handleRadius, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = this.theme.colors.function || '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      },

      pointerDown: (x, y, offsetX) => {
        const min = Math.min(this.info.min, this.info.max)
        const max = Math.max(this.info.min, this.info.max)
        const trackWidth = this.currentWidth - this.padding * 2
        const range = max - min
        const normalized = clamp((offsetX - this.padding - this.handleRadius) / (trackWidth - 2 * this.handleRadius), 0,
          1)
        let value: number
        if (this.info.exp && this.info.exp !== 1) {
          // Apply exponential scaling for interaction
          const expNormalized = Math.pow(normalized, this.info.exp)
          value = clamp(min + expNormalized * range, min, max)
        }
        else {
          value = clamp(min + normalized * range, min, max)
        }

        this.dragStateRef.current = {
          key: this.sliderKey,
          value,
          min,
          max,
          line: this.info.line,
          column: this.info.column,
          length: this.info.length,
          precision: this.info.precision,
          x,
          y,
          width: this.currentWidth,
          isDragging: true,
        }

        const codeFile = this.codeFile
        if (!codeFile) return

        const lines = codeFile.value.split('\n')
        const lineIndex = this.info.line - 1
        if (lineIndex < 0 || lineIndex >= lines.length) return

        const line = lines[lineIndex]!
        const from = this.info.column - 1
        const oldStr = getEditableNumberToken(line, from, this.info.length)
        const newLine = updateValueWithSpacing(
          line,
          this.info.column,
          oldStr,
          value,
          this.info.length,
          this.info.precision,
        )
        codeFile.edit(lineIndex, 0, line.length, newLine)
      },

      pointerMove: (_x, _y, offsetX) => {
        const drag = this.dragStateRef.current
        if (!drag || !drag.isDragging) return
        if (drag.line !== this.info.line || drag.column !== this.info.column) return

        const trackWidth = drag.width - this.padding * 2
        const normalized = clamp((offsetX - this.padding - this.handleRadius) / (trackWidth - 2 * this.handleRadius), 0,
          1)
        if (this.info.exp && this.info.exp !== 1) {
          // Apply exponential scaling for interaction
          const expNormalized = Math.pow(normalized, this.info.exp)
          drag.value = clamp(drag.min + expNormalized * (drag.max - drag.min), drag.min, drag.max)
        }
        else {
          drag.value = clamp(drag.min + normalized * (drag.max - drag.min), drag.min, drag.max)
        }

        if (this.rafRef.current) cancelAnimationFrame(this.rafRef.current)
        this.rafRef.current = requestAnimationFrame(() => {
          const currentDrag = this.dragStateRef.current
          const codeFile = this.codeFile
          if (!currentDrag || !codeFile) {
            this.rafRef.current = null
            return
          }

          const lines = codeFile.value.split('\n')
          const lineIndex = currentDrag.line - 1
          if (lineIndex >= 0 && lineIndex < lines.length) {
            const line = lines[lineIndex]!
            const from = currentDrag.column - 1
            const oldStr = getEditableNumberToken(line, from, currentDrag.length)
            const newLine = updateValueWithSpacing(
              line,
              currentDrag.column,
              oldStr,
              currentDrag.value,
              currentDrag.length,
              currentDrag.precision,
            )
            codeFile.edit(lineIndex, 0, line.length, newLine)
          }
          this.rafRef.current = null
        })
      },

      pointerUp: () => {
        const drag = this.dragStateRef.current
        if (!drag || drag.key !== this.sliderKey) return
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
        const newLine = updateValueWithSpacing(
          line,
          drag.column,
          oldStr,
          drag.value,
          drag.length,
          drag.precision,
        )
        codeFile.edit(lineIndex, 0, line.length, newLine)
      },
    }
  }
}

type UseSliderWidgetParams = {
  showWidgets: boolean
  numberParams: NumberWithParamsInfo[]
  theme: Theme
  codeFile: CodeFile | undefined
}

export function useSliderWidget({
  showWidgets,
  numberParams,
  theme,
  codeFile,
}: UseSliderWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const dragRef = useRef<DragState | null>(null)
  const rafIdRef = useRef<number | null>(null)

  const widgets = useMemo((): EditorWidget[] => {
    if (!codeFile) return []
    if (!showWidgets) return []
    if (numberParams.length === 0) return []
    return numberParams.map(info => new SliderWidget(info, theme, codeFile, dragRef, rafIdRef).toEditorWidget())
  }, [showWidgets, numberParams, theme, codeFile])

  return { widgets, onBeforeDraw: () => {} }
}
