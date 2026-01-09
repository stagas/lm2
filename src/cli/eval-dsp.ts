#!/usr/bin/env bun
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  CHUNK_SIZE,
  HISTORIES_COUNT,
  LITERALS_COUNT,
  OPS_COUNT,
} from '../../as/assembly/constants.ts'
import type * as WasmExports from '../../as/build/index'
import config from '../../asconfig.json'
import { encodeLangToVmOps } from '../engine/bytecode/bytecode.ts'
import { PRELUDE } from '../engine/bytecode/prelude.ts'
import { workletImports } from '../engine/dsp/worklet-imports.ts'
import { analyze } from '../lang/pipeline.ts'
import { liftString, wasmSetup } from '../lib/wasm-setup.ts'
import { compileMiniNotation } from '../mini/compiler.ts'

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
  const core = await wasmSetup<typeof WasmExports>({
    binary: binary.buffer,
    sourcemapUrl,
    config,
    imports: ({ memory }) => ({
      ...workletImports(memory, samples),
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

  // Analyze the source to get AST and bytecode text
  const analysis = analyze(programSource, '')

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

  wasm.processAudio(dsp$, left$, right$, 0, CHUNK_SIZE)
  const leftSamples = new Float32Array(memory.buffer, left$, CHUNK_SIZE)
  const rightSamples = new Float32Array(memory.buffer, right$, CHUNK_SIZE)

  // Output results
  console.log('=== PROGRAM SOURCE ===')
  console.log(programSource)

  console.log('\n=== AST ===')
  const astJson = JSON.stringify(analysis.program, null, 2)
  console.log(astJson)

  console.log('\n=== BYTECODE ===')
  console.log(analysis.bytecodeText)

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
  console.log(`Output samples: ${CHUNK_SIZE} per channel`)
  console.log(`Left channel range: [${Math.min(...leftSamples).toFixed(6)}, ${Math.max(...leftSamples).toFixed(6)}]`)
  console.log(`Right channel range: [${Math.min(...rightSamples).toFixed(6)}, ${Math.max(...rightSamples).toFixed(6)}]`)
  console.log(`Console logs: ${consoleLogs.length}`)
  console.log(`Console warns: ${consoleWarns.length}`)
}

// CLI interface
const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
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
