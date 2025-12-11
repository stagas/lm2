import { ARRAY_HEADER_SIZE, ARRAY_SIZE, OPS_COUNT } from './constants'
import { Dsp } from './dsp'
import { evaluateMiniBytecode } from './mini-notation'
import { Program, ProgramData } from './program'

export * from './globals'

export { Op, SeqOp } from './shared'

export function createFloat32Buffer(size: i32): usize {
  return changetype<usize>(new StaticArray<f32>(size))
}

export function createDsp(): usize {
  console.warn('createDsp')
  return changetype<usize>(new Dsp())
}

export function createProgram(): usize {
  console.warn('createProgram')
  return changetype<usize>(new Program())
}

export function createProgramData(): usize {
  return changetype<usize>(new ProgramData())
}

export function createOps(): usize {
  return changetype<usize>(new StaticArray<i32>(OPS_COUNT))
}

export function createArray(): usize {
  const array = new StaticArray<f32>(ARRAY_SIZE + ARRAY_HEADER_SIZE)
  array[1] = 0 // history write position
  array[2] = 0 // history size (only set for sequence bytecode)
  return changetype<usize>(array)
}

export function processAudio(dsp$: usize, left$: usize, right$: usize, begin: i32, length: i32): void {
  const dsp = changetype<Dsp>(dsp$)
  dsp.process(left$, right$, begin, length)
}

export function updateBpm(oldBpm: f32, newBpm: f32): void {
  if (oldBpm <= 0 || newBpm <= 0) return

  // Calculate current musical position (in beats) at old BPM
  const currentBeat = (globalSampleCount as f64) * (oldBpm as f64) / ((sampleRate as f64) * 60.0)

  // Recalculate globalSampleCount for the same musical position at new BPM
  const newSampleCount = currentBeat * ((sampleRate as f64) * 60.0) / (newBpm as f64)

  globalSampleCount = newSampleCount as i32
  bpm = newBpm
}

export function resetGlobalSampleCount(): void {
  globalSampleCount = 0
}

export function resetDsp(dsp$: usize): void {
  if (dsp$ === 0) return
  const dsp = changetype<Dsp>(dsp$)

  // Reset all sequence generators
  dsp.program.gensPool.resetAllSeqs()
}

export function evalMiniBytecode(
  bytecode$: usize,
  bytecodeLength: i32,
  from: f32,
  to: f32,
  out$: usize,
  seed: u32 = 1,
): i32 {
  return evaluateMiniBytecode(bytecode$, bytecodeLength, from, to, out$, seed)
}
