import { AnalyserOutsPool } from './analyser-outs-pool'
import { CompressorOutsPool } from './compressor-outs-pool'
import { ExpanderOutsPool } from './expander-outs-pool'
import { GateOutsPool } from './gate-outs-pool'
import {
  ARRAY_HISTORY_ENTRY_SIZE,
  ARRAY_HISTORY_SIZE,
  BRANCH_HISTORY_ENTRY_SIZE,
  BRANCH_HISTORY_SIZE,
  CALLBACK_SCOPE_MAX_BINDINGS,
  CALLBACK_SCOPE_MAX_DEPTH,
  CHUNK_SIZE,
  ENVELOPE_DATA_OFFSET,
  ENVELOPE_ENTRY_SIZE,
  ENVELOPE_HISTORY_SIZE,
  FILTER_DATA_OFFSET,
  FILTER_ENTRY_SIZE,
  FILTER_HISTORY_SIZE,
  HISTORIES_COUNT,
  LFO_DATA_OFFSET,
  LFO_ENTRY_SIZE,
  LFO_HISTORY_SIZE,
  LITERALS_COUNT,
  REVERB_DATA_OFFSET,
  REVERB_ENTRY_SIZE,
  REVERB_HISTORY_SIZE,
  RING_BUFFER_SIZE,
  SAMPLE_NEEDLE_DATA_OFFSET,
  SAMPLE_NEEDLE_ENTRY_SIZE,
  SAMPLE_NEEDLE_HISTORY_SIZE,
  TRIG_DATA_OFFSET,
  TRIG_ENTRY_SIZE,
  TRIG_HISTORY_SIZE,
} from './constants'
import { GensPool } from './gens-pool'
import { Smoothed } from './lib/smoothed'
import { LimiterOutsPool } from './limiter-outs-pool'
import { OutsPool } from './outs-pool'
import { ProgramData } from './program-data'

export class Program {
  lock: i32 = 0
  data: ProgramData = new ProgramData()
  histories: StaticArray<usize> = new StaticArray<usize>(HISTORIES_COUNT)
  analyserOutsPool: AnalyserOutsPool = new AnalyserOutsPool()
  compressorOutsPool: CompressorOutsPool = new CompressorOutsPool()
  expanderOutsPool: ExpanderOutsPool = new ExpanderOutsPool()
  gateOutsPool: GateOutsPool = new GateOutsPool()
  limiterOutsPool: LimiterOutsPool = new LimiterOutsPool()
  arrayAccessHistory: StaticArray<f32> = new StaticArray<f32>(1 + ARRAY_HISTORY_SIZE * ARRAY_HISTORY_ENTRY_SIZE)
  branchHistory: StaticArray<f32> = new StaticArray<f32>(1 + BRANCH_HISTORY_SIZE * BRANCH_HISTORY_ENTRY_SIZE)
  sampleNeedleHistory: StaticArray<f32> = new StaticArray<f32>(
    SAMPLE_NEEDLE_DATA_OFFSET + SAMPLE_NEEDLE_HISTORY_SIZE * SAMPLE_NEEDLE_ENTRY_SIZE,
  )
  filterHistory: StaticArray<f32> = new StaticArray<f32>(
    FILTER_DATA_OFFSET + FILTER_HISTORY_SIZE * FILTER_ENTRY_SIZE,
  )
  lfoHistory: StaticArray<f32> = new StaticArray<f32>(
    LFO_DATA_OFFSET + LFO_HISTORY_SIZE * LFO_ENTRY_SIZE,
  )
  reverbHistory: StaticArray<f32> = new StaticArray<f32>(
    REVERB_DATA_OFFSET + REVERB_HISTORY_SIZE * REVERB_ENTRY_SIZE,
  )
  trigHistory: StaticArray<f32> = new StaticArray<f32>(
    TRIG_DATA_OFFSET + TRIG_HISTORY_SIZE * TRIG_ENTRY_SIZE,
  )
  envelopeHistory: StaticArray<f32> = new StaticArray<f32>(
    ENVELOPE_DATA_OFFSET + ENVELOPE_HISTORY_SIZE * ENVELOPE_ENTRY_SIZE,
  )

  // UI history writes can be temporarily disabled (e.g. for repeated callback invocations).
  historyWriteEnabled: i32 = 1
  private historyWriteDepth: i32 = 0
  private historyWriteStack: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)

  gensPool: GensPool = new GensPool()
  literalsSmoothed: StaticArray<Smoothed> = new StaticArray<Smoothed>(LITERALS_COUNT)
  outsPool: OutsPool = new OutsPool()

  // Gens pool used only while recording (so callback DSP state is isolated from the main graph).
  recordGensPool: GensPool = new GensPool()

  // record() sample capture state (per sampleIndex; indices are stable across recompiles on the TS side)
  recordKey: StaticArray<u32> = new StaticArray<u32>(1024)
  recordSeconds: StaticArray<f32> = new StaticArray<f32>(1024)
  recordLen: StaticArray<i32> = new StaticArray<i32>(1024)
  recordPos: StaticArray<i32> = new StaticArray<i32>(1024)
  recordBuf$: StaticArray<usize> = new StaticArray<usize>(1024)

  // Set to 1 by record() when it performs work in the current audio block.
  recordActive: i32 = 0

  // Only one record() can render at a time (prevents shared callback DSP state from interleaving).
  recordLockSample: i32 = -1

  // Callback scope stack for remapped buffers and bound inputs
  private callbackDepth: i32 = 0
  private callbackBodyBase: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackRemapBase: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackBindingCount: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackBindingIndices: StaticArray<i32> = new StaticArray<i32>(
    CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS,
  )
  private callbackBindingPrevHas: StaticArray<i32> = new StaticArray<i32>(
    CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS,
  )
  private callbackBindingPrevOuts: StaticArray<usize> = new StaticArray<usize>(
    CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS,
  )

  // Fast binding lookup table (current effective bindings across all active scopes)
  // Uses the out-buffer index directly; size must match `OutsPool.outs.length`.
  private callbackBoundHas: StaticArray<i32> = new StaticArray<i32>(1024)
  private callbackBoundOuts: StaticArray<usize> = new StaticArray<usize>(1024)

  constructor() {
    for (let i = 0; i < this.literalsSmoothed.length; i++) {
      this.literalsSmoothed[i] = new Smoothed()
    }
  }

  @inline
  pushHistoryWriteEnabled(enabled: i32): void {
    const depth: i32 = this.historyWriteDepth
    if (depth < this.historyWriteStack.length) {
      this.historyWriteStack[depth] = this.historyWriteEnabled
    }
    this.historyWriteEnabled = enabled !== 0 ? 1 : 0
    this.historyWriteDepth = depth + 1
  }

  @inline
  popHistoryWriteEnabled(): void {
    const depth: i32 = this.historyWriteDepth - 1
    if (depth < 0) return
    if (depth < this.historyWriteStack.length) {
      this.historyWriteEnabled = this.historyWriteStack[depth]
    }
    this.historyWriteDepth = depth
  }

  @inline
  reset(): void {
    this.gensPool.reset()
    this.recordGensPool.reset()
    this.recordLockSample = -1
  }

  pushCallbackScope(bodyBufferBase: i32, remapBase: i32): void {
    const depth: i32 = this.callbackDepth
    this.callbackBodyBase[depth] = bodyBufferBase
    this.callbackRemapBase[depth] = remapBase
    this.callbackBindingCount[depth] = 0
    this.callbackDepth = depth + 1
  }

  bindScope(index: i32, out$: usize): void {
    const depth: i32 = this.callbackDepth - 1
    const bindingOffset: i32 = depth * CALLBACK_SCOPE_MAX_BINDINGS
    const count: i32 = this.callbackBindingCount[depth]
    const bindingIndex: i32 = bindingOffset + count

    this.callbackBindingIndices[bindingIndex] = index

    const prevHas: i32 = this.callbackBoundHas[index]
    this.callbackBindingPrevHas[bindingIndex] = prevHas
    this.callbackBindingPrevOuts[bindingIndex] = this.callbackBoundOuts[index]

    this.callbackBoundHas[index] = 1
    this.callbackBoundOuts[index] = out$

    this.callbackBindingCount[depth] = count + 1
  }

  popCallbackScope(): void {
    const depth: i32 = this.callbackDepth - 1
    if (depth < 0) return

    const count: i32 = this.callbackBindingCount[depth]
    const bindingOffset: i32 = depth * CALLBACK_SCOPE_MAX_BINDINGS

    for (let i: i32 = count - 1; i >= 0; i--) {
      const bindingIndex: i32 = bindingOffset + i
      const index: i32 = this.callbackBindingIndices[bindingIndex]
      const prevHas: i32 = this.callbackBindingPrevHas[bindingIndex]
      this.callbackBoundHas[index] = prevHas
      if (prevHas !== 0) {
        this.callbackBoundOuts[index] = this.callbackBindingPrevOuts[bindingIndex]
      }
    }

    this.callbackDepth = depth
  }

  // Get buffer with remapping applied when inside a callback scope

  getOutBuffer(index: i32): usize {
    const depth: i32 = this.callbackDepth
    if (depth === 0) return this.outsPool.get(index)

    // Bindings take precedence over remapping
    if (this.callbackBoundHas[index] !== 0) return this.callbackBoundOuts[index]

    // Then apply remapping for scratch buffers
    const bodyBase: StaticArray<i32> = this.callbackBodyBase
    const remapBase: StaticArray<i32> = this.callbackRemapBase
    const outsPool: OutsPool = this.outsPool

    for (let d: i32 = depth - 1; d >= 0; d--) {
      const base: i32 = bodyBase[d]
      if (index >= base) {
        const offset: i32 = index - base
        const remapped: i32 = remapBase[d] + offset
        return outsPool.get(remapped)
      }
    }

    return outsPool.get(index)
  }

  copyFrom(source: Program): void {
    // Intentionally do not copy `lock` or any callback-scope state.
    // `copyFrom()` is used to warm-start a new program during crossfade; callback scopes contain
    // transient pointers into out buffers that are only valid within a single VM invocation.

    const outBytes = CHUNK_SIZE << 2
    for (let i = 0; i < this.outsPool.outs.length; i++) {
      const src$ = changetype<usize>(source.outsPool.outs[i])
      const dst$ = changetype<usize>(this.outsPool.outs[i])
      memory.copy(dst$, src$, outBytes)
    }

    const analyserBytes = RING_BUFFER_SIZE << 2
    for (let i = 0; i < this.analyserOutsPool.outs.length; i++) {
      const src$ = changetype<usize>(source.analyserOutsPool.outs[i])
      const dst$ = changetype<usize>(this.analyserOutsPool.outs[i])
      memory.copy(dst$, src$, analyserBytes)
    }

    const compressorBytes = RING_BUFFER_SIZE << 2
    for (let i = 0; i < 64; i++) {
      const srcLevel$ = source.compressorOutsPool.getLevelDb(i)
      const dstLevel$ = this.compressorOutsPool.getLevelDb(i)
      memory.copy(dstLevel$, srcLevel$, compressorBytes)

      const srcGr$ = source.compressorOutsPool.getGrDb(i)
      const dstGr$ = this.compressorOutsPool.getGrDb(i)
      memory.copy(dstGr$, srcGr$, compressorBytes)
    }

    for (let i = 0; i < 64; i++) {
      const srcLevel$ = source.expanderOutsPool.getLevelDb(i)
      const dstLevel$ = this.expanderOutsPool.getLevelDb(i)
      memory.copy(dstLevel$, srcLevel$, compressorBytes)

      const srcGr$ = source.expanderOutsPool.getGrDb(i)
      const dstGr$ = this.expanderOutsPool.getGrDb(i)
      memory.copy(dstGr$, srcGr$, compressorBytes)
    }

    for (let i = 0; i < 64; i++) {
      const srcLevel$ = source.gateOutsPool.getLevelDb(i)
      const dstLevel$ = this.gateOutsPool.getLevelDb(i)
      memory.copy(dstLevel$, srcLevel$, compressorBytes)

      const srcGr$ = source.gateOutsPool.getGrDb(i)
      const dstGr$ = this.gateOutsPool.getGrDb(i)
      memory.copy(dstGr$, srcGr$, compressorBytes)
    }

    for (let i = 0; i < 64; i++) {
      const srcLevel$ = source.limiterOutsPool.getLevelDb(i)
      const dstLevel$ = this.limiterOutsPool.getLevelDb(i)
      memory.copy(dstLevel$, srcLevel$, compressorBytes)

      const srcGr$ = source.limiterOutsPool.getGrDb(i)
      const dstGr$ = this.limiterOutsPool.getGrDb(i)
      memory.copy(dstGr$, srcGr$, compressorBytes)
    }

    // Reset callback-scope state to a clean baseline.
    // Keeping it around would copy raw pointers (`usize`) that refer to the *source* program's buffers.
    this.callbackDepth = 0
    for (let i = 0; i < this.callbackBoundHas.length; i++) {
      this.callbackBoundHas[i] = 0
    }

    for (let i = 0; i < this.literalsSmoothed.length; i++) {
      this.literalsSmoothed[i].copyFrom(source.literalsSmoothed[i])
    }

    this.gensPool.copyFrom(source.gensPool)

    // Keep record() state stable across crossfade swaps so it doesn't re-trigger unless the callback changes.
    for (let i = 0; i < this.recordKey.length; i++) {
      this.recordKey[i] = source.recordKey[i]
      this.recordSeconds[i] = source.recordSeconds[i]
      this.recordLen[i] = source.recordLen[i]
      this.recordPos[i] = 0
      this.recordBuf$[i] = 0
    }

    this.recordActive = 0
    this.recordLockSample = -1
  }
}
