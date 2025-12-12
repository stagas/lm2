import { MINI_EVENT_SIZE, MINI_HEADER_SIZE } from './constants'

class Lcg {
  private state: u32

  constructor(seed: u32) {
    this.state = seed
  }

  next(): f32 {
    this.state = (this.state * 1664525 + 1013904223) as u32
    return (this.state as f32) / (u32.MAX_VALUE as f32)
  }
}

export function evaluateMiniBytecode(
  bytecode$: usize,
  bytecodeLength: i32,
  from: f32,
  to: f32,
  out$: usize,
  seed: u32 = 1,
): i32 {
  if (bytecodeLength <= 0) return 0

  const bytecode = changetype<StaticArray<f32>>(bytecode$)
  const out = changetype<StaticArray<f32>>(out$)
  const count = i32(Mathf.floor(bytecode[0]))
  const rng = new Lcg(seed)

  let write = 0
  for (let i = 0; i < count; i++) {
    const base = MINI_HEADER_SIZE + i * MINI_EVENT_SIZE
    if (base + MINI_EVENT_SIZE > bytecodeLength) break

    const start = bytecode[base + 0]
    const end = bytecode[base + 1]
    const value = bytecode[base + 2]
    const velocity = bytecode[base + 3]
    const hold = bytecode[base + 4]
    const glide = bytecode[base + 5]
    const prob = bytecode[base + 6]

    if (prob > 0 && rng.next() < prob) continue
    if (end <= from || start >= to) continue

    const outBase = write * MINI_EVENT_SIZE
    out[outBase + 0] = start
    out[outBase + 1] = end
    out[outBase + 2] = value
    out[outBase + 3] = velocity
    out[outBase + 4] = hold
    out[outBase + 5] = glide
    out[outBase + 6] = prob
    write++
  }

  return write
}
