import { decimalsOf } from '../../utils/number.ts'

export function formatNumberLike(value: number, like: string, minDecimals?: number): string {
  const decimals = decimalsOf(like)
  const totalDecimals = minDecimals != null ? Math.max(minDecimals, decimals) : decimals
  if (!Number.isFinite(value)) return String(value)
  if (totalDecimals === 0) return String(Math.round(value))
  const out = value.toFixed(totalDecimals)
  // Trim leading zero for values like "0.1" -> ".1" and "-0.1" -> "-.1"
  return out.replace(/^(-?)0\.(\d.*)$/, '$1.$2')
}

export function updateValueWithSpacing(
  line: string,
  column: number,
  oldStr: string,
  value: number,
  length: number,
  precision?: number,
): string {
  const start = Math.max(0, column - 1)
  const padLen = oldStr.length > 0 ? oldStr.length : Math.max(1, length)

  const before = line.slice(0, start)
  const like = oldStr || line.slice(start, start + Math.max(1, length))
  let next = formatNumberLike(value, like, precision)
  const extraChars = Math.max(0, next.length - padLen)

  if (next.length < padLen) next = next + ' '.repeat(padLen - next.length)

  let end = start + padLen
  let consumed = 0
  while (consumed < extraChars && end < line.length && line[end] === ' ') {
    end++
    consumed++
  }

  const after = line.slice(end)
  return before + next + after
}


