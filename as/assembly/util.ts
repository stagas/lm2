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
