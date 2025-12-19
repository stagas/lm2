export function decimalsOf(literal: string): number {
  const decimalIndex = literal.indexOf('.')
  if (decimalIndex === -1) return 0
  return Math.max(0, Math.min(6, literal.length - decimalIndex - 1))
}

