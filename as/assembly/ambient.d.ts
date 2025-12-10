export {}
declare global {
  export const TWO_PI: f64
  export let sampleRate: f64
  export let nyquist: f64
  export let bpm: f64
  export let globalSampleCount: i32
}

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
