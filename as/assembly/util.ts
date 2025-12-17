export function clamp(value: f32, min: f32, max: f32): f32 {
  return Mathf.max(min, Mathf.min(value, max))
}

export function clamp01(value: f32): f32 {
  return clamp(value, 0.0, 1.0)
}

export function clamp11(value: f32): f32 {
  return clamp(value, -1.0, 1.0)
}

export function clampNyquist(value: f32): f32 {
  return clamp(value, 0.0, nyquist)
}

export function fract(value: f64): f64 {
  return value - Math.floor(value)
}

export function roundToDecimals(value: f64, decimals: f64): f64 {
  const factor: f64 = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export function floorToDecimals(value: f64, decimals: f64): f64 {
  const factor: f64 = Math.pow(10, decimals)
  return Math.floor(value * factor) / factor
}

export function roundToFactor(value: f64, factor: f64): f64 {
  return Math.round(value * factor) / factor
}

export function floorToFactor(value: f64, factor: f64): f64 {
  return Math.floor(value * factor) / factor
}
