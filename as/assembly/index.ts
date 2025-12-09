import { ARRAY_HEADER_SIZE, ARRAY_SIZE, SEQ_VOICES } from './constants'
import { Dsp } from './dsp'
import { Seq } from './gen/seq'
import { Program } from './program'

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

export function createArray(): usize {
  const array = new StaticArray<f32>(ARRAY_SIZE + ARRAY_HEADER_SIZE)
  array[1] = 0 // history write position
  array[2] = 0 // history size (only set for sequence bytecode)
  return changetype<usize>(array)
}

export function createSeq(): usize {
  return changetype<usize>(new Seq())
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

// Debug exports for Seq diagnostics
export function debugSeqGetCycleCount(seq$: usize): i32 {
  const seq = changetype<Seq>(seq$)
  return seq.getCycleCount()
}

export function debugSeqGetStackLength(seq$: usize): i32 {
  const seq = changetype<Seq>(seq$)
  return seq.getStackLength()
}

export function debugSeqGetNextEventTime(seq$: usize): f64 {
  const seq = changetype<Seq>(seq$)
  return seq.getNextEventTime()
}

export function debugSeqGetTime(seq$: usize): f64 {
  const seq = changetype<Seq>(seq$)
  return seq.getTime()
}

export function debugSeqReset(seq$: usize): void {
  const seq = changetype<Seq>(seq$)
  seq.reset()
}

// Debug: Process Seq directly for diagnostics
export function debugSeqProcess(seq$: usize, bytecode$: usize, outTrig$: usize, outVelocity$: usize, outValue$: usize,
  outVoiceCount$: usize, length: i32): void
{
  const seq = changetype<Seq>(seq$)
  seq.bytecode$ = bytecode$
  // Set up output buffers for all voices
  // Each voice gets its own buffer: voice v starts at offset v * length * 4 bytes
  for (let v = 0; v < SEQ_VOICES; v++) {
    seq.outTrig$[v] = outTrig$ + (v * length * 4)
    seq.outVelocity$[v] = outVelocity$ + (v * length * 4)
    seq.outValue$[v] = outValue$ + (v * length * 4)
  }
  seq.outVoiceCount$ = outVoiceCount$
  seq.process(0, length)
}
