// dprint-ignore-file

// @ts-ignore
@inline
export function clamp(value: f32, min: f32, max: f32): f32 {
  return Mathf.max(min, Mathf.min(value, max))
}

// @ts-ignore
@inline
export function clamp01(value: f32): f32 {
  return clamp(value, 0.0, 1.0)
}

// @ts-ignore
@inline
export function clamp01f64(value: f64): f64 {
  if (value < 0.0) return 0.0
  if (value > 1.0) return 1.0
  return value
}

// @ts-ignore
@inline
export function clamp11(value: f32): f32 {
  return clamp(value, -1.0, 1.0)
}

// @ts-ignore
@inline
export function clampNyquist(value: f32): f32 {
  return clamp(value, 0.0, nyquist)
}

// @ts-ignore
@inline
export function fract(value: f64): f64 {
  return value - Math.floor(value)
}

// @ts-ignore
@inline
export function applyCurve(t: f64, curve: f64): f64 {
  if (curve > 0.0) return Math.pow(t, curve)
  if (curve < 0.0) {
    const base: f64 = -curve
    // mirrored complement: make e-<n> be the exact opposite of e< n >
    // so e-10(t) == 1 - (1 - t)^10
    if (base > 0.0) {
      return 1.0 - Math.pow(1.0 - t, base)
    }
  }
  return t
}

// @ts-ignore
@inline
export function roundToDecimals(value: f64, decimals: f64): f64 {
  const factor: f64 = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

// @ts-ignore
@inline
export function floorToDecimals(value: f64, decimals: f64): f64 {
  const factor: f64 = Math.pow(10, decimals)
  return Math.floor(value * factor) / factor
}

// @ts-ignore
@inline
export function roundToFactor(value: f64, factor: f64): f64 {
  return Math.round(value * factor) / factor
}

// @ts-ignore
@inline
export function floorToFactor(value: f64, factor: f64): f64 {
  return Math.floor(value * factor) / factor
}

// @ts-ignore
@inline
export function seededRandom01(baseSeed: u32, cycle: f64, opIndex: i32, valueIndex: i32 = 0): f64 {
  let state: i32 = i32(baseSeed)
  state ^= i32(cycle) * 374761393
  state ^= opIndex * 668265263
  state ^= valueIndex * 224682251

  state = (state * 9301 + 49297) % 233280
  if (state < 0) state += 233280

  return f64(state) / 233280.0
}

// @ts-ignore
@inline
export function nextPowerOfTwo(n: i32): i32 {
  let x: i32 = n <= 1 ? 1 : n - 1
  x |= x >> 1
  x |= x >> 2
  x |= x >> 4
  x |= x >> 8
  x |= x >> 16
  return x + 1
}

// 4-point, 3rd-order cubic interpolation (Niemitalo optimal form)
// Samples at [-1, 0, 1, 2] relative to fractional position, frac in [0..1]
// @ts-ignore
@inline
export function cubic(xm1: f32, x0: f32, x1: f32, x2: f32, frac: f32): f32 {
  const a: f32 = ((3.0 as f32) * (x0 - x1) - xm1 + x2) * (0.5 as f32)
  const b: f32 = ((2.0 as f32) * x1 + xm1 - ((5.0 as f32) * x0 + x2) * (0.5 as f32)) as f32
  const c: f32 = ((x1 - xm1) * (0.5 as f32)) as f32
  return (((a * frac + b) * frac + c) * frac + x0) as f32
}

// @ts-ignore
@inline
export function hashU32(v: u32): u32 {
  v ^= v >> 16
  v *= 0x7feb352d
  v ^= v >> 15
  v *= 0x846ca68b
  v ^= v >> 16
  return v
}

// @ts-ignore
@inline
export function u32To01(v: u32): f32 {
  const U24_INV: f32 = 1.0 / 16777216.0
  return (f32(v >>> 8) * U24_INV) as f32
}

// @ts-ignore
@inline
export function seededHash(seed: f64, key: u32): u32 {
  const a: u32 = reinterpret<u32>(f32(seed))
  const b: u32 = reinterpret<u32>(f32(seed * 0.1031 + 0.11369))
  return hashU32(hashU32(a ^ (key * 0x9e3779b9)) ^ b
)
}

// @ts-ignore
@inline
export function randomU32(seed: f64): u32 {
  return seededHash(seed, 0)
}
