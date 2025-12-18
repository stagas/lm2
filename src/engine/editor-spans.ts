export type WidgetSpan = {
  line: number
  column: number
  length: number
}

export function buildLineStarts(src: string): number[] {
  const starts = [0]
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') starts.push(i + 1)
  }
  return starts
}

export function indexToLineColumn(lineStarts: number[], index: number): { line: number; column: number } {
  let lo = 0
  let hi = lineStarts.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const start = lineStarts[mid]!
    const next = mid + 1 < lineStarts.length ? lineStarts[mid + 1]! : Number.POSITIVE_INFINITY
    if (index < start) hi = mid - 1
    else if (index >= next) lo = mid + 1
    else return { line: mid + 1, column: index - start + 1 }
  }
  return { line: 1, column: 1 }
}

export function spanToWidgetSpans(lineStarts: number[], start: number, end: number): WidgetSpan[] {
  if (end <= start) return []
  const a = indexToLineColumn(lineStarts, start)
  const b = indexToLineColumn(lineStarts, end)
  if (a.line === b.line) {
    return [{ line: a.line, column: a.column, length: Math.max(1, b.column - a.column) }]
  }
  const spans: WidgetSpan[] = []
  let s = start
  for (let line = a.line;; line++) {
    const lineStart = lineStarts[line - 1] ?? 0
    const lineEnd = line < lineStarts.length ? (lineStarts[line] ?? end) - 1 : end
    const segStart = Math.max(s, lineStart)
    const segEnd = Math.min(end, lineEnd)
    if (segEnd > segStart) {
      const p = indexToLineColumn(lineStarts, segStart)
      spans.push({ line: p.line, column: p.column, length: Math.max(1, segEnd - segStart) })
    }
    if (segEnd >= end) break
    s = lineEnd + 1
  }
  return spans
}


