#!/usr/bin/env bun
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  CHUNK_SIZE,
  HISTORIES_COUNT,
  HISTORY_ENTRY_SIZE,
  HISTORY_HEADER_SIZE,
  HISTORY_SIZE,
  LITERALS_COUNT,
  OPS_COUNT,
} from '../../as/assembly/constants.ts'
import config from '../../asconfig.json'
import { encodeLangToVmOps } from '../engine/bytecode/bytecode.ts'
import { PRELUDE } from '../engine/bytecode/prelude.ts'
import { detectSlices } from '../engine/dsp/detect-slices.ts'
import { analyze } from '../lang/pipeline.ts'
import { wasmSetup } from '../lib/wasm-setup.ts'
import { compileMiniNotation } from '../mini/compiler.ts'

type WasmExports = {
  createDsp: () => number
  createProgram: () => number
  createProgramData: () => number
  createOps: () => number
  createArray: () => number
  createHistoryArray: () => number
  processAudio: (dsp$: number, left$: number, right$: number, begin: number, length: number) => void
  createFloat32Buffer: (size: number) => number
  resetDsp: (dsp$: number) => void
  resetGlobalSampleCount: () => void
  getProgramRecordActive: (program$: number) => number
  sampleRate?: { value: number }
  nyquist?: { value: number }
  bpm?: { value: number }
  globalSampleCount?: { value: number }
}

async function evalDsp(programSource: string) {
  const consoleLogs: string[] = []
  const consoleWarns: string[] = []
  const samples = new Map<number, { ver: number; sampleRate: number; len: number; ch0: Float32Array }>()
  let currentSampleRate = 48000

  // Load WASM binary
  const wasmPath = resolve(import.meta.dir, '../../as/build/index.wasm')
  const binary = readFileSync(wasmPath)
  const sourcemapUrl = `file://${resolve(import.meta.dir, '../../as/build/index.wasm.map')}`

  // Setup WASM with console.log capture
  const core = await wasmSetup<WasmExports>({
    binary: binary.buffer,
    sourcemapUrl,
    config,
    imports: ({ memory }) => ({
      host: (() => {
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
        return {
          sampleVersion: (sampleIndex: number) => {
            const s = samples.get(sampleIndex | 0)
            return s ? (s.ver | 0) : 0
          },
          sampleLen: (sampleIndex: number) => {
            const idx = sampleIndex | 0
            const s = samples.get(idx)
            return s ? (s.len | 0) : 0
          },
          sampleRead: (sampleIndex: number, start: number, length: number, outPtr: number) => {
            const idx = sampleIndex | 0
            const s = samples.get(idx)
            const n = length | 0
            if (!memory?.buffer || outPtr === 0 || n <= 0) return 0

            const out = new Float32Array(memory.buffer, outPtr >>> 0, n)
            if (!s || !s.ch0 || s.len <= 0) {
              out.fill(0)
              return 0
            }

            const src = s.ch0
            const len = s.len | 0
            const a = start | 0

            const from = clamp(a, 0, len)
            const to = clamp(a + n, 0, len)
            const take = Math.max(0, to - from)

            if (take > 0) out.set(src.subarray(from, from + take), 0)
            if (take < n) out.fill(0, take)
            return take | 0
          },
          sampleSet: (sampleIndex: number, length: number, inPtr: number) => {
            const idx = sampleIndex | 0
            const n = length | 0
            if (!memory?.buffer || inPtr === 0 || n <= 0) return
            const src = new Float32Array(memory.buffer, inPtr >>> 0, n)
            const copy = src.slice()
            const prev = samples.get(idx)
            const ver = ((prev?.ver ?? 0) + 1) | 0
            samples.set(idx, { ver, sampleRate: currentSampleRate | 0, len: copy.length | 0, ch0: copy })
          },
          sampleSlices: (sampleIndex: number, threshold: number, outPtr: number, max: number) => {
            const s = samples.get(sampleIndex | 0)
            const m = max | 0
            if (!memory?.buffer || outPtr === 0 || m <= 0) return 0
            const out = new Int32Array(memory.buffer, outPtr >>> 0, m)
            if (!s || !s.ch0 || s.len <= 0) {
              out.fill(0)
              return 0
            }

            const res = detectSlices(s.ch0, threshold || 0, m)
            out.set(res.points.subarray(0, res.count))
            if (res.count < m) out.fill(0, res.count)
            return res.count | 0
          },
        }
      })(),
      env: {
        'console.log': (textPtr: number) => {
          const text = liftString(memory, textPtr)
          consoleLogs.push(text)
        },
        'console.warn': (textPtr: number) => {
          const text = liftString(memory, textPtr)
          consoleWarns.push(text)
        },
      },
    }),
  })

  const { wasm, memory } = core

  // Helper to lift strings from WASM memory
  function liftString(mem: WebAssembly.Memory, pointer: number): string {
    if (!pointer) return ''
    const end = (pointer + new Uint32Array(mem.buffer)[(pointer - 4) >>> 2]) >>> 1
    const memoryU16 = new Uint16Array(mem.buffer)
    let start = pointer >>> 1
    let string = ''
    while (end - start > 1024) {
      string += String.fromCharCode(...memoryU16.subarray(start, start += 1024))
    }
    return string + String.fromCharCode(...memoryU16.subarray(start, end))
  }

  // Analyze the source to get AST and bytecode text
  const analysis = analyze(programSource, PRELUDE)

  // Create VM bytecode
  const ops = new Int32Array(OPS_COUNT)
  const literals = new Float32Array(LITERALS_COUNT)
  const vmResult = encodeLangToVmOps(programSource, { ops, literals })

  if (vmResult.errors.length > 0) {
    console.error('Compilation errors:')
    for (const err of vmResult.errors) {
      console.error(`  Line ${err.line}:${err.column} - ${err.message}`)
      if (err.code) console.error(`    ${err.code}`)
    }
    process.exit(1)
  }

  // Create DSP instance
  const dsp$ = wasm.createDsp()
  const program$ = wasm.createProgram()

  // Get program data pointer from program
  // Program structure: first field is 'lock: i32', second is 'data: ProgramData'
  const programView = new DataView(memory.buffer, program$)
  const programData$ = programView.getUint32(4, true) // Skip lock (4 bytes), get data pointer

  // Get ops, arrays, and literals pointers from program data
  const programDataView = new DataView(memory.buffer, programData$)
  const opsPtr = programDataView.getUint32(0, true)
  const arraysPtr = programDataView.getUint32(4, true)
  const literalsPtr = programDataView.getUint32(8, true)

  // Ensure program arrays/histories are allocated (required for mini()/play()).
  // ProgramData.arrays is a StaticArray<usize> of pointers to float arrays.
  // Program.histories is a StaticArray<usize> of pointers to history arrays.
  const arrayPtrs = new Uint32Array(memory.buffer, arraysPtr >>> 0, ARRAYS_COUNT)
  for (let i = 0; i < ARRAYS_COUNT; i++) {
    if (arrayPtrs[i] !== 0) continue
    arrayPtrs[i] = wasm.createArray() >>> 0
  }

  const historiesPtr = programView.getUint32(8, true)
  const historyPtrs = new Uint32Array(memory.buffer, historiesPtr >>> 0, HISTORIES_COUNT)
  for (let i = 0; i < HISTORIES_COUNT; i++) {
    if (historyPtrs[i] !== 0) continue
    historyPtrs[i] = wasm.createHistoryArray() >>> 0
  }

  // Write ops and literals to WASM memory
  const wasmOps = new Int32Array(memory.buffer, opsPtr, OPS_COUNT)
  const wasmLiterals = new Float32Array(memory.buffer, literalsPtr, LITERALS_COUNT)

  wasmOps.set(ops)
  wasmLiterals.set(literals)

  // Compile and write Mini notation sequences into ProgramData arrays (required for mini/play runtime).
  // encodeLangToVmOps already replaced mini('...') strings with seq indices; those indices map to miniSequences[].
  const miniSequences = vmResult.miniSequences ?? []
  const defaultScaleIndex = vmResult.scale
  if (miniSequences.length > 0) {
    if (miniSequences.length > HISTORIES_COUNT) {
      throw new Error(`Too many mini sequences: ${miniSequences.length} > ${HISTORIES_COUNT}`)
    }
    for (let arrayIndex = 0; arrayIndex < miniSequences.length; arrayIndex++) {
      const seq = miniSequences[arrayIndex]
      if (!seq) continue
      const compiled = compileMiniNotation(
        seq,
        defaultScaleIndex === undefined ? {} : { defaultScale: { scaleIndex: defaultScaleIndex } },
      )
      const bytecode = compiled.bytecode
      const maxSize = Math.min(bytecode.length, ARRAY_SIZE)

      const array$ = arrayPtrs[arrayIndex] >>> 0
      const raw = new Float32Array(memory.buffer, array$, ARRAY_HEADER_SIZE + ARRAY_SIZE)
      raw.set(bytecode.subarray(0, maxSize), ARRAY_HEADER_SIZE)
      raw[0] = maxSize
      raw[3] = (raw[3] || 0) + 1
    }
  }

  // Set program on DSP
  const dspView = new DataView(memory.buffer, dsp$)
  dspView.setUint32(0, program$, true)

  // Reset DSP state
  wasm.resetDsp(dsp$)
  wasm.resetGlobalSampleCount()

  // Create output buffers
  const left$ = wasm.createFloat32Buffer(CHUNK_SIZE)
  const right$ = wasm.createFloat32Buffer(CHUNK_SIZE)

  // Set global values
  currentSampleRate = 48000
  const sampleRate = currentSampleRate
  const bpm = 60
  if (wasm.sampleRate) wasm.sampleRate.value = sampleRate
  if (wasm.nyquist) wasm.nyquist.value = sampleRate * 0.5 - sampleRate * 0.1
  if (wasm.bpm) wasm.bpm.value = bpm

  // Check if there are record samples to prepare
  const recordDefs = vmResult.sampleDefs?.filter(s => s.provider === 'record') ?? []
  if (recordDefs.length > 0) {
    console.log(`Preparing ${recordDefs.length} record samples...`)
    // Prepare all record samples before processing
    wasm.resetDsp(dsp$)
    wasm.resetGlobalSampleCount()

    let stable = 0
    const maxBlocks = 4096
    for (let i = 0; i < maxBlocks; i++) {
      wasm.processAudio(dsp$, left$, right$, 0, CHUNK_SIZE)
      const active = (wasm.getProgramRecordActive(program$) | 0) !== 0
      if (active) stable = 0
      else stable++

      // Freeze transport (matches worklet "preparing" semantics)
      wasm.resetGlobalSampleCount()

      if (stable >= 2) break
    }

    // Reset DSP after preparation (like worklet does via applySeekSample)
    // program.reset() doesn't clear recordKey/recordSeconds/recordLen, so those persist
    // When record() is called again, it will see existingLen > 0 from hostSampleLen
    // and paramsChanged should be false (because stored values match), so it uses existing sample
    wasm.resetDsp(dsp$)
    wasm.resetGlobalSampleCount()

    // Verify samples are still accessible after reset
    for (const def of recordDefs) {
      const s = samples.get(def.sampleIndex)
      if (s && s.len > 0) {
        console.log(`Sample ${def.sampleIndex} ready: ${s.len} samples at ${s.sampleRate}Hz`)
      }
      else {
        console.warn(`Sample ${def.sampleIndex} missing after reset`)
      }
    }
  }

  // Process multiple chunks to allow play() to trigger and samples to be read
  // processAudio automatically updates globalSampleCount by adding length to it at the END
  // So during processing, globalSampleCount is at the start of the window
  // mini('1*4') triggers every beat at 60 BPM = every second = 48000 samples at 48kHz
  // Process enough chunks to cover at least one beat
  // Ensure globalSampleCount starts at 0, then let processAudio update it automatically
  // mini('1*4') triggers every beat at 60 BPM = every second = 48000 samples at 48kHz
  // One cycle (4 beats) = 192000 samples at 48kHz
  // We need to process enough chunks to allow mini() to generate history and trigger
  if (wasm.globalSampleCount) wasm.globalSampleCount.value = 0
  const chunksToProcess = 1500 // Process 1500 chunks = 192000 samples = 4 seconds at 48kHz (one full cycle)

  // Accumulate output across chunks to capture any audio that plays
  const accumulatedLeft = new Float32Array(CHUNK_SIZE * chunksToProcess)
  const accumulatedRight = new Float32Array(CHUNK_SIZE * chunksToProcess)

  for (let i = 0; i < chunksToProcess; i++) {
    // processAudio uses globalSampleCount at the start of the window, then updates it at the end
    // So we need to ensure globalSampleCount is set correctly before each call
    // For the first iteration, it's 0 (set above). For subsequent iterations, it should be updated
    // by the previous processAudio call, but let's verify it's correct
    const expectedSampleCount = i * CHUNK_SIZE
    if (wasm.globalSampleCount && wasm.globalSampleCount.value !== expectedSampleCount) {
      // If it's not at the expected value, set it (shouldn't happen, but just in case)
      wasm.globalSampleCount.value = expectedSampleCount
    }
    wasm.processAudio(dsp$, left$, right$, 0, CHUNK_SIZE)
    // After processAudio, globalSampleCount should be (i + 1) * CHUNK_SIZE

    // Accumulate output from each chunk
    const chunkLeft = new Float32Array(memory.buffer, left$, CHUNK_SIZE)
    const chunkRight = new Float32Array(memory.buffer, right$, CHUNK_SIZE)
    accumulatedLeft.set(chunkLeft, i * CHUNK_SIZE)
    accumulatedRight.set(chunkRight, i * CHUNK_SIZE)
  }

  // Use accumulated samples for output (they contain the actual audio)
  // Find the chunk with the most non-zero samples
  let maxNonZeroChunk = 0
  let maxNonZeroCount = 0
  for (let i = 0; i < chunksToProcess; i++) {
    const chunkStart = i * CHUNK_SIZE
    const chunkLeft = accumulatedLeft.subarray(chunkStart, chunkStart + CHUNK_SIZE)
    const nonZeroCount = chunkLeft.filter(v => v !== 0).length
    if (nonZeroCount > maxNonZeroCount) {
      maxNonZeroCount = nonZeroCount
      maxNonZeroChunk = i
    }
  }

  // Use the chunk with the most non-zero samples for display
  const displayChunkStart = maxNonZeroChunk * CHUNK_SIZE
  const leftSamples = accumulatedLeft.subarray(displayChunkStart, displayChunkStart + CHUNK_SIZE)
  const rightSamples = accumulatedRight.subarray(displayChunkStart, displayChunkStart + CHUNK_SIZE)

  // Collect non-zero literals
  const nonZeroLiterals: Record<number, number> = {}
  for (let i = 0; i < literals.length; i++) {
    if (literals[i] !== 0) {
      nonZeroLiterals[i] = literals[i]!
    }
  }

  // Output results
  console.log('=== PROGRAM SOURCE ===')
  console.log(programSource)

  console.log('\n=== AST ===')
  const astJson = JSON.stringify(analysis.program, null, 2)
  console.log(astJson)

  console.log('\n=== BYTECODE ===')
  console.log(analysis.bytecodeText)

  console.log('\n=== VM OPS ===')
  console.log(ops)

  console.log('\n=== VM LITERALS ===')
  console.log(literals)

  console.log('\n=== OUTPUT SAMPLES ===')
  console.log(leftSamples)
  console.log(rightSamples)

  if (consoleLogs.length > 0) {
    console.log('\n=== CONSOLE.LOG OUTPUT ===')
    for (const log of consoleLogs) {
      console.log(log)
    }
  }

  if (consoleWarns.length > 0) {
    console.log('\n=== CONSOLE.WARN OUTPUT ===')
    for (const warn of consoleWarns) {
      console.warn(warn)
    }
  }

  // Summary stats
  const firstNonZeroOp = ops.findIndex((op, i) => i > 0 && op === 0)
  const vmOpsCount = firstNonZeroOp === -1 ? OPS_COUNT : firstNonZeroOp

  console.log('\n=== SUMMARY ===')
  console.log(`Source length: ${programSource.length} chars`)
  console.log(`AST size: ${JSON.stringify(analysis.program).length} chars`)
  console.log(`Bytecode lines: ${analysis.bytecodeText.split('\n').length}`)
  console.log(`VM ops count: ${vmOpsCount}`)
  console.log(`Non-zero literals: ${Object.keys(nonZeroLiterals).length}`)
  console.log(`Output samples: ${CHUNK_SIZE} per channel`)
  console.log(`Left channel range: [${Math.min(...leftSamples).toFixed(6)}, ${Math.max(...leftSamples).toFixed(6)}]`)
  console.log(`Right channel range: [${Math.min(...rightSamples).toFixed(6)}, ${Math.max(...rightSamples).toFixed(6)}]`)
  console.log(`Console logs: ${consoleLogs.length}`)
  console.log(`Console warns: ${consoleWarns.length}`)
}

// CLI interface
const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('Usage: bun src/cli/eval-dsp.ts [options] "<program>"')
  console.error('       bun src/cli/eval-dsp.ts [options] --file <path>')
  console.error('\nOptions:')
  console.error('  --file, -f <path>    Read program from file')
  console.error('  --help, -h           Show this help message')
  console.error('\nExamples:')
  console.error('  bun src/cli/eval-dsp.ts "out(sine(440))"')
  console.error('  bun src/cli/eval-dsp.ts "out(sine(440) * 0.5)"')
  console.error('  bun src/cli/eval-dsp.ts --file examples/simple.lm')
  process.exit(1)
}

if (args[0] === '--help' || args[0] === '-h') {
  console.log('DSP Program Evaluator')
  console.log('\nThis tool compiles and evaluates a DSP program, running one chunk (128 samples)')
  console.log('and outputs the bytecode, AST, and audio samples.')
  console.log('\nUsage: bun src/cli/eval-dsp.ts [options] "<program>"')
  console.log('       bun src/cli/eval-dsp.ts [options] --file <path>')
  console.log('\nOptions:')
  console.log('  --file, -f <path>    Read program from file')
  console.log('  --help, -h           Show this help message')
  console.log('\nExamples:')
  console.log('  bun src/cli/eval-dsp.ts "out(sine(440))"')
  console.log('  bun src/cli/eval-dsp.ts "out(sine(440) * 0.5)"')
  console.log('  bun src/cli/eval-dsp.ts --file examples/simple.lm')
  process.exit(0)
}

let programSource: string

if (args[0] === '--file' || args[0] === '-f') {
  if (args.length < 2) {
    console.error('Error: --file requires a path argument')
    process.exit(1)
  }
  const filePath = resolve(process.cwd(), args[1]!)
  programSource = readFileSync(filePath, 'utf-8')
}
else {
  programSource = args[0]!
}

evalDsp(programSource).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
