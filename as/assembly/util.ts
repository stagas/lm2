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

// 3rd-order Lagrange interpolation
// @ts-ignore
@inline
export function lagrange3(xm1: f32, x0: f32, x1: f32, x2: f32, frac: f32): f32 {
  // 4-point, 3rd-order Lagrange, with samples at [-1, 0, 1, 2] and frac in [0..1].
  const c0: f32 = (-frac * (frac - (1.0 as f32)) * (frac - (2.0 as f32))) * ((1.0 as f32) / (6.0 as f32))
  const c1: f32 = ((frac + (1.0 as f32)) * (frac - (1.0 as f32)) * (frac - (2.0 as f32))) * ((1.0 as f32) / (2.0 as f32))
  const c2: f32 = (-(frac + (1.0 as f32)) * frac * (frac - (2.0 as f32))) * ((1.0 as f32) / (2.0 as f32))
  const c3: f32 = ((frac + (1.0 as f32)) * frac * (frac - (1.0 as f32))) * ((1.0 as f32) / (6.0 as f32))
  return xm1 * c0 + x0 * c1 + x1 * c2 + x2 * c3
}
