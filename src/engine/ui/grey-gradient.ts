type AnyGradientCtx = {
  createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => CanvasGradient
}

export function createGreyVerticalGradient(
  ctx: AnyGradientCtx,
  x: number,
  y0: number,
  y1: number,
  isHot: boolean,
): CanvasGradient {
  const grad = ctx.createLinearGradient(x, y0, x, y1)
  if (isHot) {
    grad.addColorStop(0, '#999')
    grad.addColorStop(0.5, '#999')
    grad.addColorStop(1, '#999')
    return grad
  }

  grad.addColorStop(0.2, 'rgba(150, 150, 150, 0.5)')
  grad.addColorStop(0.5, 'rgba(180, 180, 180, 0.9)')
  grad.addColorStop(0.8, 'rgba(150, 150, 150, 0.5)')
  return grad
}


