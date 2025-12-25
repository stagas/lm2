// Euclidean rhythm helpers shared between the TS tooling and the AS runtime.
// Keep this file TS+AS compatible (no JS-only APIs, no host globals).

export function euclidHit(pulses: i32, steps: i32, step: i32, offset: i32 = 0): bool {
  if (steps <= 0) return false
  if (pulses <= 0) return false
  if (pulses >= steps) return true

  let s: i32 = step + offset
  s %= steps
  if (s < 0) s += steps

  // "Bucket" method: evenly distributes pulses over steps.
  // Produces a stable rotation that starts with a hit at step 0.
  const v: i32 = (s * pulses) % steps
  return v < pulses
}

export function euclidPattern(pulses: i32, steps: i32, offset: i32 = 0): Array<i32> {
  const out: Array<i32> = new Array<i32>(steps > 0 ? steps : 0)
  for (let i: i32 = 0; i < out.length; i++) {
    out[i] = euclidHit(pulses, steps, i, offset) ? 1 : 0
  }
  return out
}


