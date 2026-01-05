#!/usr/bin/env bun
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { CHUNK_SIZE, LITERALS_COUNT, OPS_COUNT } from '../../as/assembly/constants.ts'
import config from '../../asconfig.json'
import { encodeLangToVmOps } from '../engine/bytecode/bytecode.ts'
import { PRELUDE } from '../engine/bytecode/prelude.ts'
import { analyze } from '../lang/pipeline.ts'
import { wasmSetup } from '../lib/wasm-setup.ts'

type WasmExports = {
  createDsp: () => number
  createProgram: () => number
  createProgramData: () => number
  createOps: () => number
  processAudio: (dsp$: number, left$: number, right$: number, begin: number, length: number) => void
  createFloat32Buffer: (size: number) => number
  resetDsp: (dsp$: number) => void
  resetGlobalSampleCount: () => void
}

async function evalDsp(programSource: string) {
  const consoleLogs: string[] = []
  const consoleWarns: string[] = []

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

  // Write ops and literals to WASM memory
  const wasmOps = new Int32Array(memory.buffer, opsPtr, OPS_COUNT)
  const wasmLiterals = new Float32Array(memory.buffer, literalsPtr, LITERALS_COUNT)

  wasmOps.set(ops)
  wasmLiterals.set(literals)

  // Set program on DSP
  const dspView = new DataView(memory.buffer, dsp$)
  dspView.setUint32(0, program$, true)

  // Reset DSP state
  wasm.resetDsp(dsp$)
  wasm.resetGlobalSampleCount()

  // Create output buffers
  const left$ = wasm.createFloat32Buffer(CHUNK_SIZE)
  const right$ = wasm.createFloat32Buffer(CHUNK_SIZE)

  // Process one chunk
  wasm.processAudio(dsp$, left$, right$, 0, CHUNK_SIZE)

  // Read output samples
  const leftSamples = new Float32Array(memory.buffer, left$, CHUNK_SIZE)
  const rightSamples = new Float32Array(memory.buffer, right$, CHUNK_SIZE)

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
