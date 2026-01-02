// dprint-ignore-file

// @ts-ignore
@global
export const TWO_PI: f32 = 2.0 * Mathf.PI

// @ts-ignore
@global
export let sampleRate: f32 = 48000

// @ts-ignore
@global
export let baseSampleRate: f32 = 48000

// @ts-ignore
@global
export let nyquist: f32 = sampleRate * 0.5 - sampleRate * 0.1

// @ts-ignore
@global
export let bpm: f32 = 60

// @ts-ignore
@global
export let globalSampleCount: i32 = 0

// @ts-ignore
@global
export let controlBlockSize: i32 = 128

// @ts-ignore
@global
export let vmErrorCode: i32 = 0

// @ts-ignore
@global
export let vmErrorPc: i32 = 0

export function clearVmError(): void {
  vmErrorCode = 0
  vmErrorPc = 0
}

export function setVmError(code: i32, pc: i32): void {
  vmErrorCode = code
  vmErrorPc = pc
}

export function setSampleRateAndNyquist(sr: f32): void {
  sampleRate = sr
  baseSampleRate = sr
  nyquist = sr * 0.5 - sr * 0.1
}

export function setGlobalSampleCountValue(v: i32): void {
  globalSampleCount = v
}

export function getVmErrorCode(): i32 {
  return vmErrorCode
}

export function getVmErrorPc(): i32 {
  return vmErrorPc
}
