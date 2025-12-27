export type WidgetCanvas = OffscreenCanvas | HTMLCanvasElement

export type Widget2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function createWidgetCanvas(pxW: number, pxH: number): WidgetCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(pxW, pxH)
  const canvas = document.createElement('canvas')
  canvas.width = pxW
  canvas.height = pxH
  return canvas
}

export function getWidgetContext(canvas: WidgetCanvas): Widget2DContext | null {
  return canvas.getContext('2d') as Widget2DContext | null
}


