import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  HISTORY_HEADER_SIZE,
  HISTORY_SIZE,
  HISTORY_SIZE_MINUS_ONE,
  HISTORY_WRITE_POS_OFFSET,
  OPS_COUNT,
} from './constants'
import { Dsp } from './dsp/dsp'
import { MiniEventBuffer, MiniEvents } from './mini/events'
import { Program } from './program'
import { ProgramData } from './program-data'

export * from './globals'

export { Op, SeqOp } from './shared'

const miniHistoryEvents: MiniEvents = new MiniEvents()
const miniHistoryBuffer: MiniEventBuffer = new MiniEventBuffer()

export function createFloat32Buffer(size: i32): usize {
  return changetype<usize>(new StaticArray<f32>(size))
}

export function createDsp(): usize {
  console.log('createDsp')
  return changetype<usize>(new Dsp())
}

export function resetDsp(dsp$: usize): void {
  if (dsp$ === 0) return
  const dsp = changetype<Dsp>(dsp$)
  dsp.reset()
}

export function createProgram(): usize {
  console.log('createProgram')
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
  const array = new StaticArray<f32>(ARRAY_HEADER_SIZE + ARRAY_SIZE)
  return changetype<usize>(array)
}

export function createHistoryArray(): usize {
  const array = new StaticArray<f32>(HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE)
  return changetype<usize>(array)
}

export function generateMiniHistoryWindow(
  bytecode$: usize,
  history$: usize,
  windowStartSample: i32,
  windowEndSample: i32,
  bpmValue: f32,
  sampleRateValue: f32,
  barValue: f32,
): void {
  if (history$ === 0) return
  const history = changetype<StaticArray<f32>>(history$)
  memory.fill(
    changetype<usize>(history),
    0,
    (HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE) * 4,
  )

  if (bytecode$ === 0) return
  if (windowEndSample <= windowStartSample) return
  if (bpmValue <= 0.0 || sampleRateValue <= 0.0) return

  sampleRate = sampleRateValue
  baseSampleRate = sampleRateValue
  nyquist = sampleRateValue * 0.5 - sampleRate * 0.1
  bpm = bpmValue

  const cycleLength: f32 = 1.0
  const secondsPerBeat: f64 = 60.0 / (bpmValue as f64)
  const cycleSamplesF: f64 = (secondsPerBeat * 4.0) * (sampleRateValue as f64)
  if (cycleSamplesF <= 0.0) return
  const cycleSamples: f32 = cycleSamplesF as f32

  let startCycle: i32 = i32(Math.floor((windowStartSample as f64) / cycleSamplesF)) - 2
  if (startCycle < 0) startCycle = 0
  let endCycle: i32 = i32(Math.ceil((windowEndSample as f64) / cycleSamplesF)) + 2
  if (endCycle < startCycle) endCycle = startCycle

  let historyWritePos: i32 = 0

  for (let cycle: i32 = startCycle; cycle <= endCycle; cycle++) {
    const cycleStartSample: i32 = i32((cycle as f64) * cycleSamplesF)
    miniHistoryBuffer.clear()
    miniHistoryEvents.emitEvents(
      bytecode$,
      miniHistoryBuffer,
      cycleStartSample,
      cycleLength,
      cycleSamples,
      windowStartSample,
      windowEndSample,
      barValue,
    )

    for (let i: i32 = 0; i < miniHistoryBuffer.writePos; i++) {
      const ev = miniHistoryBuffer.events[i]
      if (!ev) continue

      const slot: i32 = historyWritePos & HISTORY_SIZE_MINUS_ONE
      const historyIdx: i32 = HISTORY_DATA_OFFSET + slot * HISTORY_ENTRY_SIZE
      history[historyIdx + 0] = ev.opIndex as f32
      history[historyIdx + 1] = ev.voiceIndex as f32
      history[historyIdx + 2] = ev.value
      history[historyIdx + 3] = ev.velocity
      history[historyIdx + 4] = ev.startSample as f32
      history[historyIdx + 5] = ev.endSample as f32

      historyWritePos = (historyWritePos + 1) & HISTORY_SIZE_MINUS_ONE
    }
  }

  history[HISTORY_WRITE_POS_OFFSET] = historyWritePos as f32
}

export function processAudio(dsp$: usize, left$: usize, right$: usize, begin: i32, length: i32): void {
  const dsp = changetype<Dsp>(dsp$)
  dsp.process(left$, right$, begin, length)
}

export function getProgramRecordActive(program$: usize): i32 {
  if (program$ === 0) return 0
  const program = changetype<Program>(program$)
  return program.recordActive
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
