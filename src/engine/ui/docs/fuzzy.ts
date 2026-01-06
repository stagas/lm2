function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function scoreSubsequence(q: string, t: string): number {
  if (!q) return 0
  let qi = 0
  let last = -2
  let score = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue
    const consecutive = last === ti - 1
    score += consecutive ? 8 : 3
    score += Math.max(0, 10 - ti * 0.05)
    last = ti
    qi++
  }
  return qi === q.length ? score : 0
}

export function fuzzyScore(query: string, text: string): number {
  const q = normalize(query)
  const t = normalize(text)
  if (!q) return 0
  const parts = q.split(' ').filter(Boolean)
  if (parts.length === 0) return 0
  let total = 0
  for (const p of parts) {
    const s = scoreSubsequence(p, t)
    if (s <= 0) return 0
    total += s
  }
  return total
}

