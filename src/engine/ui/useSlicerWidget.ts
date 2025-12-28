import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'preact/hooks'
import type { SlicerRef } from '../bytecode/bytecode.ts'
import { detectSlices } from '../dsp/detect-slices.ts'
import { useEngineDspStore } from '../store.ts'
import { createWidgetCanvas, getWidgetContext, type WidgetCanvas } from './widget-canvas.ts'

type UseSlicerWidgetParams = {
  slicerRefs?: SlicerRef[]
  dspSource: string
  showWidgets: boolean
}

type SliceCache = {
  thresholdKey: number
  len: number
  points: Int32Array
  count: number
}

type SliceImgCache = {
  pxW: number
  pxH: number
  dpr: number
  canvas: WidgetCanvas
}

function formatNorm(v: number): string {
  const s = v.toFixed(2)
  return s.replace(/\.?0+$/, '').replace(/^0\./, '.')
}

function renderSlicesToCanvas(
  canvas: WidgetCanvas,
  points: Int32Array,
  count: number,
  len: number,
  pxW: number,
  pxH: number,
  dpr: number,
) {
  const c = getWidgetContext(canvas)
  if (!c) return

  c.save()
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.clearRect(0, 0, pxW, pxH)

  c.strokeStyle = 'rgba(234, 88, 12, .7)'
  c.lineWidth = 1.35 * dpr

  c.fillStyle = 'rgba(234, 88, 12, 0.9)'
  c.font = `${7 * dpr}pt "Space Mono"`
  c.textAlign = 'left'
  c.textBaseline = 'top'

  for (let i = 0; i < count; i++) {
    const p = points[i] ?? 0
    const t = p / len
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t
    const col = Math.min(pxW - 1, Math.max(0, Math.floor(clamped * pxW)))
    const x = col + 0.5

    c.beginPath()
    c.moveTo(x, 0)
    c.lineTo(x, pxH)
    c.stroke()

    const s = count <= 1 ? 0 : (i / (count - 1))
    c.fillText(formatNorm(s), x + 2 * dpr, 2 * dpr)
  }

  c.restore()
}

export function useSlicerWidget({
  slicerRefs,
  showWidgets,
}: UseSlicerWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const refs = slicerRefs ?? []
  const sliceRef = useRef<WeakMap<ArrayBuffer, Map<number, SliceCache>>>(new WeakMap())
  const imgRef = useRef<WeakMap<ArrayBuffer, Map<string, SliceImgCache>>>(new WeakMap())

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
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
    const pxW = Math.max(1, Math.floor(w * dpr))
    const pxH = Math.max(1, Math.floor(h * dpr))

    const buf = ch0.buffer
    let byBuf = imgRef.current.get(buf)
    if (!byBuf) {
      byBuf = new Map()
      imgRef.current.set(buf, byBuf)
    }

    const key = `${thresholdKey}:${pxW}:${pxH}:${dpr}`
    const cached = byBuf.get(key)
    const canvas = cached?.canvas
    if (cached && cached.pxW === pxW && cached.pxH === pxH && cached.dpr === dpr && canvas) {
      c.drawImage(canvas, viewX, widgetY, w, h)
      return
    }

    let sliceByBuf = sliceRef.current.get(buf)
    if (!sliceByBuf) {
      sliceByBuf = new Map()
      sliceRef.current.set(buf, sliceByBuf)
    }

    const sliceCached = sliceByBuf.get(thresholdKey)
    const len = ch0.length
    let points: Int32Array
    let count: number
    if (!sliceCached || sliceCached.len !== len || sliceCached.thresholdKey !== thresholdKey) {
      const res = detectSlices(ch0, ref.threshold || 0, 512)
      points = res.points
      count = res.count | 0
      sliceByBuf.set(thresholdKey, { thresholdKey, len, points, count })
    }
    else {
      points = sliceCached.points
      count = sliceCached.count | 0
    }

    if (count <= 0) return
    const off = createWidgetCanvas(pxW, pxH)
    renderSlicesToCanvas(off, points, count, len, pxW, pxH, dpr)
    byBuf.set(key, { pxW, pxH, dpr, canvas: off })
    c.drawImage(off, viewX, widgetY, w, h)
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
