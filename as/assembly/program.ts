import { AnalyserOutsPool } from './analyser-outs-pool'
import {
  ARRAY_HISTORY_ENTRY_SIZE,
  ARRAY_HISTORY_SIZE,
  BRANCH_HISTORY_ENTRY_SIZE,
  BRANCH_HISTORY_SIZE,
  CALLBACK_SCOPE_MAX_BINDINGS,
  CALLBACK_SCOPE_MAX_DEPTH,
  CHUNK_SIZE,
  HISTORIES_COUNT,
  LITERALS_COUNT,
  RING_BUFFER_SIZE,
  SAMPLE_NEEDLE_DATA_OFFSET,
  SAMPLE_NEEDLE_ENTRY_SIZE,
  SAMPLE_NEEDLE_HISTORY_SIZE,
} from './constants'
import { GensPool } from './gens-pool'
import { Smoothed } from './lib/smoothed'
import { OutsPool } from './outs-pool'
import { ProgramData } from './program-data'

export class Program {
  lock: i32 = 0
  data: ProgramData = new ProgramData()
  histories: StaticArray<usize> = new StaticArray<usize>(HISTORIES_COUNT)
  analyserOutsPool: AnalyserOutsPool = new AnalyserOutsPool()
  arrayAccessHistory: StaticArray<f32> = new StaticArray<f32>(1 + ARRAY_HISTORY_SIZE * ARRAY_HISTORY_ENTRY_SIZE)
  branchHistory: StaticArray<f32> = new StaticArray<f32>(1 + BRANCH_HISTORY_SIZE * BRANCH_HISTORY_ENTRY_SIZE)
  sampleNeedleHistory: StaticArray<f32> = new StaticArray<f32>(
    SAMPLE_NEEDLE_DATA_OFFSET + SAMPLE_NEEDLE_HISTORY_SIZE * SAMPLE_NEEDLE_ENTRY_SIZE,
  )

  gensPool: GensPool = new GensPool()
  literalsSmoothed: StaticArray<Smoothed> = new StaticArray<Smoothed>(LITERALS_COUNT)
  outsPool: OutsPool = new OutsPool()

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

  reset(): void {
    this.gensPool.reset()
  }

  waitProgramUnlock(): void {
    const lockPtr = changetype<usize>(this) + offsetof<Program>('lock')
    let lock = atomic.load<i32>(lockPtr)
    while (lock !== 0) {
      atomic.wait<i32>(lockPtr, lock, -1)
      lock = atomic.load<i32>(lockPtr)
    }
  }

  pushCallbackScope(bodyBufferBase: i32, remapBase: i32): void {
    const depth: i32 = this.callbackDepth
    this.callbackBodyBase[depth] = bodyBufferBase
    this.callbackRemapBase[depth] = remapBase
    this.callbackBindingCount[depth] = 0
    this.callbackDepth = depth + 1
  }

  @inline
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
  @inline
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
    this.lock = source.lock
    // this.data.copyFrom(source.data)

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

    this.callbackDepth = source.callbackDepth
    memory.copy(
      changetype<usize>(this.callbackBodyBase),
      changetype<usize>(source.callbackBodyBase),
      CALLBACK_SCOPE_MAX_DEPTH << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackRemapBase),
      changetype<usize>(source.callbackRemapBase),
      CALLBACK_SCOPE_MAX_DEPTH << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackBindingCount),
      changetype<usize>(source.callbackBindingCount),
      CALLBACK_SCOPE_MAX_DEPTH << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackBindingIndices),
      changetype<usize>(source.callbackBindingIndices),
      CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackBindingPrevHas),
      changetype<usize>(source.callbackBindingPrevHas),
      CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackBindingPrevOuts),
      changetype<usize>(source.callbackBindingPrevOuts),
      CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS * sizeof<usize>(),
    )

    memory.copy(
      changetype<usize>(this.callbackBoundHas),
      changetype<usize>(source.callbackBoundHas),
      1024 << 2,
    )
    memory.copy(
      changetype<usize>(this.callbackBoundOuts),
      changetype<usize>(source.callbackBoundOuts),
      1024 * sizeof<usize>(),
    )

    for (let i = 0; i < this.literalsSmoothed.length; i++) {
      this.literalsSmoothed[i].copyFrom(source.literalsSmoothed[i])
    }

    this.gensPool.copyFrom(source.gensPool)
  }
}
