import { readFileSync } from 'fs'
import { join } from 'path'
import { wasmSetup } from './lib/wasm-setup.ts'
import config from '../asconfig.json'
import { compileSequence } from './sequence-compiler.ts'
import { ARRAY_HEADER_SIZE, ARRAY_SIZE, ARRAYS_COUNT, CHUNK_SIZE, LITERALS_COUNT, OPS_COUNT, RING_BUFFER_SIZE, SEQ_HISTORY_SIZE, SEQ_VOICES } from '../as/assembly/constants.ts'
import type * as WasmExports from '../as/build/index.d.ts'
import { DspStruct, OutsPoolStruct, ProgramDataStruct, ProgramStruct } from './assembly.ts'

const BPM = 60
const SAMPLE_RATE = 44100
const CHUNK_LENGTH = CHUNK_SIZE

async function main() {
  console.log('Loading WASM binary...')
  const wasmPath = join(process.cwd(), 'as/build/index.wasm')
  const wasmBinary = readFileSync(wasmPath)
  const sourcemapUrl = join(process.cwd(), 'as/build/index.wasm.map')

  console.log('Setting up WASM...')
  const core = await wasmSetup<typeof WasmExports>({
    binary: wasmBinary.buffer,
    sourcemapUrl,
    config,
  })

  // Set global BPM and sample rate
  core.wasm.bpm.value = BPM
  core.wasm.sampleRate.value = SAMPLE_RATE
  core.wasm.globalSampleCount.value = 0

  console.log('Creating program...')
  const program$ = core.wasm.createProgram()
  const program = ProgramStruct(core.memory.buffer, program$)
  const outsPool = OutsPoolStruct(core.memory.buffer, program.outsPool)
  const programData = ProgramDataStruct(core.memory.buffer, program.data)
  const arrays = new Uint32Array(core.memory.buffer, programData.arrays, ARRAYS_COUNT)

  // Create arrays
  const arrays$ = Array.from({ length: ARRAYS_COUNT }, () => core.wasm.createArray())
  for (let i = 0; i < ARRAYS_COUNT; i++) {
    arrays[i] = arrays$[i]
  }

  // Get array 1 (sequence bytecode)
  const sequenceArray$ = arrays$[1]
  const sequenceArray = new Float32Array(core.memory.buffer, sequenceArray$, ARRAY_SIZE + ARRAY_HEADER_SIZE)

  // Compile sequence
  const sequenceString = 'c4 e4 [f3 f4 f6 f7]/4'
  console.log(`\nCompiling sequence: "${sequenceString}"`)
  const compiled = compileSequence(sequenceString)
  sequenceArray.set(compiled.bytecode.buffer)

  console.log('\nSequence bytecode:')
  const arrayLength = sequenceArray[0]
  console.log(`  Length: ${arrayLength}`)
  console.log(`  History write pos: ${sequenceArray[1]}`)
  console.log(`  History size: ${sequenceArray[2]}`)

  // Print bytecode structure
  let pc = ARRAY_HEADER_SIZE
  let depth = 0
  const printBytecode = (endPc: number) => {
    while (pc < endPc && pc < ARRAY_HEADER_SIZE + arrayLength) {
      const op = sequenceArray[pc]
      const indent = '  '.repeat(depth)
      pc++

      if (op === 0) {
        // Cycle
        const length = sequenceArray[pc++]
        const speed = sequenceArray[pc++]
        const repeat = sequenceArray[pc++]
        const density = sequenceArray[pc++]
        const offset = sequenceArray[pc++]
        const jitter = sequenceArray[pc++]
        const prob = sequenceArray[pc++]
        const isSquare = sequenceArray[pc++]
        console.log(
          `${indent}Cycle: length=${length}, speed=${speed}, repeat=${repeat}, density=${density}, isSquare=${isSquare}`,
        )
        depth++
        const nestedEnd = pc + countSlotBytes(sequenceArray, arrayLength, pc, length)
        printBytecode(nestedEnd)
        depth--
        pc = nestedEnd
      }
      else if (op === 1) {
        // Value
        const value = sequenceArray[pc++]
        const velocity = sequenceArray[pc++]
        const hold = sequenceArray[pc++]
        const repeat = sequenceArray[pc++]
        const density = sequenceArray[pc++]
        const offset = sequenceArray[pc++]
        const prob = sequenceArray[pc++]
        const jitter = sequenceArray[pc++]
        const glide = sequenceArray[pc++]
        console.log(
          `${indent}Value: ${value.toFixed(2)}Hz, velocity=${velocity}, hold=${hold}, repeat=${repeat}, density=${density}`,
        )
      }
      else if (op === 2) {
        // Rest
        const repeat = sequenceArray[pc++]
        console.log(`${indent}Rest: repeat=${repeat}`)
      }
      else if (op === 3) {
        // Chord
        const chordLength = sequenceArray[pc++] as number
        const notes: number[] = []
        for (let i = 0; i < chordLength; i++) {
          notes.push(sequenceArray[pc++])
        }
        const strum = sequenceArray[pc++]
        const velocity = sequenceArray[pc++]
        const hold = sequenceArray[pc++]
        const repeat = sequenceArray[pc++]
        const density = sequenceArray[pc++]
        const offset = sequenceArray[pc++]
        const prob = sequenceArray[pc++]
        const jitter = sequenceArray[pc++]
        const glide = sequenceArray[pc++]
        console.log(
          `${indent}Chord: [${notes.map(n => n.toFixed(2)).join(', ')}], velocity=${velocity}, hold=${hold}, repeat=${repeat}`,
        )
      }
      else {
        console.log(`${indent}Unknown op: ${op}`)
        break
      }
    }
  }

  function countSlotBytes(array: Float32Array, arrayLength: number, startPc: number, slotCount: number): number {
    let pc = startPc
    for (let i = 0; i < slotCount; i++) {
      if (pc >= arrayLength + ARRAY_HEADER_SIZE) break

      const op = array[pc] as number
      pc++

      if (op === 0) {
        // Cycle
        const cycleLength = array[pc++] as number
        pc += 7 // Skip cycle params
        pc += countSlotBytes(array, arrayLength, pc, cycleLength)
      }
      else if (op === 1) {
        // Value
        pc += 9
      }
      else if (op === 2) {
        // Rest
        pc += 1
      }
      else if (op === 3) {
        // Chord
        const chordLength = array[pc++] as number
        pc += chordLength + 9
      }
    }
    return pc - startPc
  }

  printBytecode(ARRAY_HEADER_SIZE + arrayLength)

  // Create Seq instance for debugging
  console.log('\nCreating Seq instance...')
  const seq$ = core.wasm.createSeq()
  core.wasm.debugSeqReset(seq$)

  // Create output buffers
  const outTrig$ = core.wasm.createFloat32Buffer(CHUNK_LENGTH * SEQ_VOICES)
  const outVelocity$ = core.wasm.createFloat32Buffer(CHUNK_LENGTH * SEQ_VOICES)
  const outValue$ = core.wasm.createFloat32Buffer(CHUNK_LENGTH * SEQ_VOICES)
  const outVoiceCount$ = core.wasm.createFloat32Buffer(CHUNK_LENGTH)

  const outTrig = new Float32Array(core.memory.buffer, outTrig$, CHUNK_LENGTH * SEQ_VOICES)
  const outVelocity = new Float32Array(core.memory.buffer, outVelocity$, CHUNK_LENGTH * SEQ_VOICES)
  const outValue = new Float32Array(core.memory.buffer, outValue$, CHUNK_LENGTH * SEQ_VOICES)
  const outVoiceCount = new Float32Array(core.memory.buffer, outVoiceCount$, CHUNK_LENGTH)

  // Process sequence in chunks and track events
  console.log('\nProcessing sequence...')
  console.log(`BPM: ${BPM}, Sample Rate: ${SAMPLE_RATE}, Chunk Size: ${CHUNK_LENGTH}`)

  const secondsPerBeat = 60.0 / BPM
  const cycleDurationSeconds = secondsPerBeat // 1 beat = 1 cycle
  const totalCycles = 4 // Process 4 cycles
  const totalSamples = Math.ceil(totalCycles * cycleDurationSeconds * SAMPLE_RATE)
  const totalChunks = Math.ceil(totalSamples / CHUNK_LENGTH)

  const events: Array<{ cycle: number; sample: number; voice: number; value: number; trig: number }> = []

  for (let chunk = 0; chunk < totalChunks; chunk++) {
    const currentSample = chunk * CHUNK_LENGTH
    core.wasm.globalSampleCount.value = currentSample

    // Process this chunk
    core.wasm.debugSeqProcess(seq$, sequenceArray$, outTrig$, outVelocity$, outValue$, outVoiceCount$, CHUNK_LENGTH)

    // Track events in this chunk - look for trigger onsets
    for (let i = 0; i < CHUNK_LENGTH; i++) {
      const sample = currentSample + i
      const cycle = sample / (cycleDurationSeconds * SAMPLE_RATE)

      for (let v = 0; v < SEQ_VOICES; v++) {
        const trig = outTrig[i * SEQ_VOICES + v]
        const value = outValue[i * SEQ_VOICES + v]
        const velocity = outVelocity[i * SEQ_VOICES + v]

        // Check if this is a trigger onset (trig > 0.5 and previous was <= 0.5 or doesn't exist)
        const prevTrig = i > 0 ? outTrig[(i - 1) * SEQ_VOICES + v] : 0
        const isTriggerOnset = trig > 0.5 && prevTrig <= 0.5

        if (isTriggerOnset && value > 0) {
          events.push({
            cycle: cycle,
            sample: sample,
            voice: v,
            value: value,
            trig: trig,
          })
        }
      }
    }

    // Print cycle boundaries
    const cycleNumber = Math.floor((currentSample + CHUNK_LENGTH) / (cycleDurationSeconds * SAMPLE_RATE))
    const prevCycleNumber = Math.floor(currentSample / (cycleDurationSeconds * SAMPLE_RATE))
    if (cycleNumber > prevCycleNumber) {
      console.log(`\n--- Cycle ${cycleNumber} (sample ${currentSample + CHUNK_LENGTH}) ---`)
      const cycleEvents = events.filter(e => e.cycle >= cycleNumber - 1 && e.cycle < cycleNumber)
      if (cycleEvents.length > 0) {
        for (const event of cycleEvents) {
          const freq = event.value
          const note = freqToNote(freq)
          console.log(
            `  Sample ${event.sample} (cycle ${event.cycle.toFixed(3)}): Voice ${event.voice} = ${note} (${freq.toFixed(2)}Hz), trig=${event.trig.toFixed(2)}`,
          )
        }
      }
      else {
        console.log('  (no events)')
      }

      // Debug Seq state
      const seqCycleCount = core.wasm.debugSeqGetCycleCount(seq$)
      const seqStackLength = core.wasm.debugSeqGetStackLength(seq$)
      const seqTime = core.wasm.debugSeqGetTime(seq$)
      const seqNextEventTime = core.wasm.debugSeqGetNextEventTime(seq$)
      console.log(
        `  Seq state: cycleCount=${seqCycleCount}, stackLength=${seqStackLength}, time=${seqTime.toFixed(6)}, nextEventTime=${seqNextEventTime === Number.MAX_SAFE_INTEGER ? 'MAX' : seqNextEventTime.toFixed(6)}`,
      )
    }
  }

  // Print history
  console.log('\n\nSequence History:')
  const historyWritePos = sequenceArray[1]
  const historySize = Math.floor(sequenceArray[2]) || SEQ_HISTORY_SIZE
  for (let i = 0; i < historySize; i++) {
    const idx = ((historyWritePos - historySize + i + historySize) % historySize) * 3 + 3
    const bytecodePos = Math.floor(sequenceArray[idx])
    const startSample = Math.floor(sequenceArray[idx + 1])
    const endSample = Math.floor(sequenceArray[idx + 2])

    if (startSample > 0 || endSample > 0) {
      const startCycle = startSample / (cycleDurationSeconds * SAMPLE_RATE)
      const endCycle = endSample / (cycleDurationSeconds * SAMPLE_RATE)
      console.log(
        `  Entry ${i}: bytecodePos=${bytecodePos}, startSample=${startSample} (cycle ${startCycle.toFixed(3)}), endSample=${endSample} (cycle ${endCycle.toFixed(3)})`,
      )
    }
  }

  // Summary
  console.log('\n\nSummary:')
  console.log(`Total events: ${events.length}`)
  const eventsByCycle = new Map<number, number>()
  for (const event of events) {
    const cycle = Math.floor(event.cycle)
    eventsByCycle.set(cycle, (eventsByCycle.get(cycle) || 0) + 1)
  }
  for (const [cycle, count] of Array.from(eventsByCycle.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`  Cycle ${cycle}: ${count} events`)
  }
}

function freqToNote(freq: number): string {
  if (freq === 0) return '~'
  const A4 = 440
  const semitones = Math.round(12 * Math.log2(freq / A4))
  const octave = 4 + Math.floor(semitones / 12)
  const noteIndex = ((semitones % 12) + 12) % 12
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return `${notes[noteIndex]}${octave}`
}

main().catch(console.error)

