export function computePeaks(ch0: Float32Array, w: number): Float32Array {
  const len = ch0.length | 0
  const outW = Math.max(1, w | 0)
  const out = new Float32Array(outW * 2)

  if (len <= 0) {
    out.fill(0)
    return out
  }

  for (let i = 0; i < outW; i++) {
    const from = Math.floor((i * len) / outW)
    const to = Math.floor(((i + 1) * len) / outW)
    const a = Math.max(0, Math.min(len - 1, from))
    const b = Math.max(a + 1, Math.min(len, to))

    let mn = ch0[a] ?? 0
    let mx = mn
    for (let j = a + 1; j < b; j++) {
      const v = ch0[j] ?? 0
      if (v < mn) mn = v
      if (v > mx) mx = v
    }

    const base = i * 2
    out[base] = mn
    out[base + 1] = mx
  }

  return out
}


