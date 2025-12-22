import type { TimelineLabel } from './bytecode.ts'

export function buildTimelineLabels(labels: TimelineLabel[], bars: number | undefined): TimelineLabel[] {
  const sorted = [...labels].sort((a, b) => a.bar - b.bar)
  if (bars === undefined) return sorted

  const endBar = bars + 1
  const hasEnd = sorted.some(l => l.bar === endBar && l.text === 'end')
  if (hasEnd) return sorted

  return [
    ...sorted,
    {
      bar: endBar,
      text: 'end',
      color: 'rgba(255, 220, 0, 0.85)',
      loc: { line: 1, column: 1, length: 1 },
    },
  ]
}
