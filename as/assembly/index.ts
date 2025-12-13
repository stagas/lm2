import { ARRAY_HEADER_SIZE, ARRAY_SIZE, OPS_COUNT } from './constants'
import { Dsp } from './dsp'
import { MiniEventBuffer, MiniEvents } from './mini/events'
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

export function copyProgram(target$: usize, source$: usize): void {
  const target = changetype<Program>(target$)
  const source = changetype<Program>(source$)
  target.copyFrom(source)
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

export function prepareProgram(program$: usize): void {
  if (program$ === 0) return
  const program = changetype<Program>(program$)
  program.prepareProgram()
}

export function createMiniEventBuffer(): usize {
  return changetype<usize>(new MiniEventBuffer())
}

export function emitMiniEvents(
  bytecode$: usize,
  eventBuffer$: usize,
  cycleStartSample: i32,
  cycleLength: f32,
  cycleSamples: f32,
  windowStart: i32,
  windowEnd: i32,
): void {
  if (bytecode$ === 0 || eventBuffer$ === 0) return
  const eventBuffer = changetype<MiniEventBuffer>(eventBuffer$)
  const emitter = new MiniEvents()
  emitter.emitEvents(bytecode$, eventBuffer, cycleStartSample, cycleLength, cycleSamples, windowStart, windowEnd)
}

export function clearMiniEventBuffer(eventBuffer$: usize): void {
  if (eventBuffer$ === 0) return
  const eventBuffer = changetype<MiniEventBuffer>(eventBuffer$)
  eventBuffer.clear()
}

export function getMiniEventBufferSize(eventBuffer$: usize): i32 {
  if (eventBuffer$ === 0) return 0
  const eventBuffer = changetype<MiniEventBuffer>(eventBuffer$)
  return eventBuffer.writePos
}

export function getMiniEvent(eventBuffer$: usize, index: i32, out$: usize): void {
  if (eventBuffer$ === 0 || out$ === 0) return
  const eventBuffer = changetype<MiniEventBuffer>(eventBuffer$)
  if (index < 0 || index >= eventBuffer.writePos) return
  const event = eventBuffer.events[index]
  if (event === null) return
  const out = changetype<StaticArray<f32>>(out$)
  out[0] = event.opIndex as f32
  out[1] = event.startSample as f32
  out[2] = event.endSample as f32
  out[3] = event.value
  out[4] = event.velocity
}
