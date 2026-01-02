export {}
declare global {
  export const TWO_PI: f64
  export let sampleRate: f64
  export let baseSampleRate: f64
  export let nyquist: f64
  export let baseNyquist: f64
  export let bpm: f64
  export let globalSampleCount: i32
  export let vmErrorCode: i32

  export function unroll(times: number, fn: () => void): void
}

// Seeded RNG for mini probability
declare function seed(): f64

// Host function for unified event generation
declare function generateSequenceEvents(
  bytecodePtr: usize,
  bytecodeLength: i32,
  historyPtr: usize,
  historyWritePosPtr: usize,
  fromSample: i32,
  toSample: i32,
  sampleRate: f64,
  bpm: f64,
  seed: u32,
): i32
