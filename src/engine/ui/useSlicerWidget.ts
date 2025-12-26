import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { SlicerRef } from '../bytecode/bytecode.ts'
import { detectSlices } from '../dsp/detect-slices.ts'
import { useEngineDspStore } from '../store.ts'

type UseSlicerWidgetParams = {
  slicerRefs?: SlicerRef[]
  dspSource: string
  showWidgets: boolean
}

type SliceCache = {
  ch0Buffer: ArrayBuffer
  thresholdKey: number
  len: number
  points: Int32Array
  count: number
}

function formatNorm(v: number): string {
  const s = v.toFixed(2)
  return s.replace(/\.?0+$/, '').replace(/^0\./, '.')
}

export function useSlicerWidget({
  slicerRefs,
  dspSource,
  showWidgets,
}: UseSlicerWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const refs = slicerRefs ?? []
  const cacheRef = useRef<Map<string, SliceCache>>(new Map())

  useEffect(() => {
    cacheRef.current.clear()
  }, [dspSource])

  const draw = useCallback((
    c: CanvasRenderingContext2D,
    ref: SlicerRef,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
  ) => {
    const w = viewWidth
    const h = Math.max(40, widgetHeight)
    if (w <= 1 || h <= 1) return

    const loaded = useEngineDspStore.getState().loadedSamples[ref.sampleIndex]
    const ch0 = loaded?.ch0
    if (!ch0 || ch0.length <= 1) return

    const thresholdKey = ((ref.threshold || 0) * 1000) | 0
    const key = `${ref.sampleIndex}:${thresholdKey}`
    const cached = cacheRef.current.get(key)

    let points: Int32Array
    let count: number
    if (!cached || cached.ch0Buffer !== ch0.buffer || cached.thresholdKey !== thresholdKey
      || cached.len !== ch0.length)
    {
      const res = detectSlices(ch0, ref.threshold || 0, 512)
      points = res.points
      count = res.count | 0
      cacheRef.current.set(key, { ch0Buffer: ch0.buffer, thresholdKey, len: ch0.length, points, count })
    }
    else {
      points = cached.points
      count = cached.count | 0
    }

    if (count <= 0) return

    c.save()
    c.translate(viewX, widgetY)

    c.strokeStyle = 'rgba(234, 88, 12, .7)'
    c.lineWidth = 1.35

    c.fillStyle = 'rgba(234, 88, 12, 0.9)'
    c.font = '7pt "Space Mono"'
    c.textAlign = 'left'
    c.textBaseline = 'top'

    const len = ch0.length
    const dpr = window.devicePixelRatio
    const pxW = Math.max(1, Math.floor(w * dpr))
    for (let i = 0; i < count; i++) {
      const p = points[i] ?? 0
      const t = p / len
      const clamped = t < 0 ? 0 : t > 1 ? 1 : t
      const col = Math.min(pxW - 1, Math.max(0, Math.floor(clamped * pxW)))
      const x = (col + 0.5) / dpr

      c.beginPath()
      c.moveTo(x, 0)
      c.lineTo(x, h)
      c.stroke()

      const s = count <= 1 ? 0 : (i / (count - 1))
      c.fillText(formatNorm(s), x + 2, 2)
    }

    c.restore()
  }, [])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (refs.length === 0) return []

    const out: EditorWidget[] = []
    for (const ref of refs) {
      out.push({
        type: 'above',
        line: ref.loc.line,
        column: 1,
        length: 1,
        height: 40,
        render: (ctx, _x, y, _w, h, vx, vw) => {
          draw(ctx, ref, y, h, vx, vw)
        },
      })
    }
    return out
  }, [showWidgets, refs, draw])

  return { widgets, onBeforeDraw: () => {} }
}
