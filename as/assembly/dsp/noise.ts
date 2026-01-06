import { clamp01f64, clamp11, hashU32, seededHash, u32To01 } from '../util'

function u32To11(v: u32): f32 {
  return (u32To01(v) * 2.0 - 1.0) as f32
}

export function white11(seed: f64): f32 {
  return u32To11(seededHash(seed, 0))
}

export function gauss11(seed: f64): f32 {
  // CLT approximation: average of 6 uniforms gives a normal-ish distribution, and (sum-3)/3 stays in [-1,1].
  let sum: f32 = 0.0
  sum += u32To01(seededHash(seed, 1))
  sum += u32To01(seededHash(seed, 2))
  sum += u32To01(seededHash(seed, 3))
  sum += u32To01(seededHash(seed, 4))
  sum += u32To01(seededHash(seed, 5))
  sum += u32To01(seededHash(seed, 6))
  return ((sum - 3.0) * (1.0 / 3.0)) as f32
}

function fade5(t: f32): f32 {
  // Quintic fade (Perlin): C2 continuous.
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

function fadeWithCurve(t: f32, curve: f64): f32 {
  const c = clamp01f64(curve) as f32
  const f = fade5(t)
  return (t + (f - t) * c) as f32
}

function valueNoise11At(i: i32): f32 {
  return u32To11(hashU32(u32(i)))
}

export function smooth11(seed: f64, rate: f64, curve: f64): f32 {
  const x: f64 = seed * rate
  const i0: i32 = i32(Math.floor(x))
  const t: f32 = (x - (i0 as f64)) as f32
  const a: f32 = valueNoise11At(i0)
  const b: f32 = valueNoise11At(i0 + 1)
  const w: f32 = fadeWithCurve(t, curve)
  return (a + (b - a) * w) as f32
}

export function fractal11(seed: f64, rate: f64, octaves: i32, gain: f64): f32 {
  let n: i32 = octaves
  if (n < 1) n = 1
  if (n > 16) n = 16

  const g: f64 = clamp01f64(gain)

  let amp: f64 = 1.0
  let freq: f64 = rate
  let sum: f64 = 0.0
  let norm: f64 = 0.0

  for (let o: i32 = 0; o < n; o++) {
    sum += (smooth11(seed, freq, 1.0) as f64) * amp
    norm += amp
    amp *= g
    freq *= 2.0
  }

  const y: f32 = norm > 0.0 ? (sum / norm) as f32 : 0.0
  return clamp11(y)
}

export function pink11(seed: f64): f32 {
  // Approximate 1/f by summing octave bands with amplitude ~ 1/sqrt(f) => gain per octave = 1/sqrt(2).
  const g: f64 = 0.7071067811865476
  let amp: f64 = 1.0
  let freq: f64 = 1.0
  let sum: f64 = 0.0
  let norm: f64 = 0.0
  for (let o: i32 = 0; o < 10; o++) {
    sum += (smooth11(seed, freq, 1.0) as f64) * amp
    norm += amp
    amp *= g
    freq *= 2.0
  }
  return clamp11((sum / norm) as f32)
}

export function brown11(seed: f64): f32 {
  // Approximate integrated noise (1/f^2) by summing octave bands with amplitude ~ 1/f => gain per octave = 1/2.
  const g: f64 = 0.5
  let amp: f64 = 1.0
  let freq: f64 = 1.0
  let sum: f64 = 0.0
  let norm: f64 = 0.0
  for (let o: i32 = 0; o < 10; o++) {
    sum += (smooth11(seed, freq, 1.0) as f64) * amp
    norm += amp
    amp *= g
    freq *= 2.0
  }
  return clamp11((sum / norm) as f32)
}
