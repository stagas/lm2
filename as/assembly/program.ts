import {
  ARRAYS_COUNT,
  CALLBACK_SCOPE_MAX_BINDINGS,
  CALLBACK_SCOPE_MAX_DEPTH,
  CHUNK_SIZE,
  LITERALS_COUNT,
  OPS_COUNT,
  RING_BUFFER_SIZE,
  SEQ_VOICES,
} from './constants'
import { Ad } from './gen/ad'
import { Adsr } from './gen/adsr'
import { Analyser } from './gen/analyser'
import { Gen } from './gen/gen'
import { Mini } from './gen/mini'
import { Sin } from './gen/sin'
import { Smoothed } from './lib/smoothed'
import { Op } from './shared'

export class GenPool<T> {
  private index: i32 = 0
  gens: T[] = []
  constructor(private ctor: () => T) {}
  resetIndex(): void {
    this.index = 0
  }
  get(): T {
    if (this.index >= this.gens.length) {
      const gen = this.ctor()
      this.gens.push(gen)
    }
    const gen = this.gens[this.index++]
    return gen
  }
}

class GensPool {
  private sins: GenPool<Sin> = new GenPool<Sin>(() => new Sin())
  private ads: GenPool<Ad> = new GenPool<Ad>(() => new Ad())
  private adsrs: GenPool<Adsr> = new GenPool<Adsr>(() => new Adsr())
  private minis: GenPool<Mini> = new GenPool<Mini>(() => new Mini())
  private analysers: GenPool<Analyser> = new GenPool<Analyser>(() => new Analyser())
  resetIndices(): void {
    this.sins.resetIndex()
    this.ads.resetIndex()
    this.adsrs.resetIndex()
    this.minis.resetIndex()
    this.analysers.resetIndex()
  }
  resetAllSeqs(): void {
    for (let i = 0; i < this.minis.gens.length; i++) {
      this.minis.gens[i].reset()
    }
  }
  get(op: Op): Gen {
    switch (op) {
      case Op.Sin:
        return this.sins.get()
      case Op.Ad:
        return this.ads.get()
      case Op.Adsr:
        return this.adsrs.get()
      case Op.Mini:
        return this.minis.get()
      case Op.Analyser:
        return this.analysers.get()
    }
    throw new Error(`Invalid gen op: ${op}`)
  }
}

class OutsPool {
  outs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(1024)
  constructor() {
    for (let i = 0; i < this.outs.length; i++) {
      this.outs[i] = new StaticArray<f32>(CHUNK_SIZE)
    }
  }
  get(index: i32): usize {
    return changetype<usize>(this.outs[index])
  }
}

class AnalyserOutsPool {
  outs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(64)
  constructor() {
    for (let i = 0; i < this.outs.length; i++) {
      this.outs[i] = new StaticArray<f32>(RING_BUFFER_SIZE)
    }
  }
  get(index: i32): usize {
    return changetype<usize>(this.outs[index])
  }
}

export class ProgramData {
  lock: i32 = 0

  ops: StaticArray<i32> = new StaticArray<i32>(OPS_COUNT)
  arrays: StaticArray<usize> = new StaticArray<usize>(ARRAYS_COUNT)
  literals: StaticArray<f32> = new StaticArray<f32>(LITERALS_COUNT)

  private acquireLock(): void {
    const lockPtr = changetype<usize>(this) + offsetof<ProgramData>('lock')
    let lock = atomic.load<i32>(lockPtr)
    while (lock !== 0) {
      atomic.wait<i32>(lockPtr, 1, -1)
      lock = atomic.load<i32>(lockPtr)
    }
    atomic.store<i32>(lockPtr, 1)
  }

  private releaseLock(): void {
    const lockPtr = changetype<usize>(this) + offsetof<ProgramData>('lock')
    atomic.store<i32>(lockPtr, 0)
    atomic.notify(lockPtr, 1)
  }

  readLiteral(index: i32): f32 {
    this.acquireLock()
    const literal = this.literals[index]
    this.releaseLock()
    return literal
  }
}

export class Program {
  lock: i32 = 0
  data: ProgramData = new ProgramData()
  outsPool: OutsPool = new OutsPool()
  analyserOutsPool: AnalyserOutsPool = new AnalyserOutsPool()
  gensPool: GensPool = new GensPool()
  literalsSmoothed: StaticArray<Smoothed> = new StaticArray<Smoothed>(LITERALS_COUNT)

  // Callback scope stack for remapped buffers and bound inputs
  private callbackDepth: i32 = 0
  private callbackBodyBase: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackRemapBase: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackBindingCount: StaticArray<i32> = new StaticArray<i32>(CALLBACK_SCOPE_MAX_DEPTH)
  private callbackBindingIndices: StaticArray<i32> = new StaticArray<i32>(
    CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS,
  )
  private callbackBindingOuts: StaticArray<usize> = new StaticArray<usize>(
    CALLBACK_SCOPE_MAX_DEPTH * CALLBACK_SCOPE_MAX_BINDINGS,
  )

  constructor() {
    for (let i = 0; i < this.literalsSmoothed.length; i++) {
      this.literalsSmoothed[i] = new Smoothed()
    }
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
    const depth = this.callbackDepth
    this.callbackBodyBase[depth] = bodyBufferBase
    this.callbackRemapBase[depth] = remapBase
    this.callbackBindingCount[depth] = 0
    this.callbackDepth = depth + 1
  }

  bindScope(index: i32, out$: usize): void {
    const depth = this.callbackDepth - 1
    const bindingIndex = depth * CALLBACK_SCOPE_MAX_BINDINGS
    const count = this.callbackBindingCount[depth]
    this.callbackBindingIndices[bindingIndex + count] = index
    this.callbackBindingOuts[bindingIndex + count] = out$
    this.callbackBindingCount[depth] = count + 1
  }

  popCallbackScope(): void {
    if (this.callbackDepth <= 0) return
    this.callbackDepth--
  }

  // Get buffer with remapping applied when inside a callback scope
  getOutBuffer(index: i32): usize {
    for (let depth = this.callbackDepth - 1; depth >= 0; depth--) {
      const base = this.callbackBodyBase[depth]

      // Bound inputs for this scope (e.g., trig/velocity/value)
      const bindingCount = this.callbackBindingCount[depth]
      const bindingOffset = depth * CALLBACK_SCOPE_MAX_BINDINGS
      for (let i = 0; i < bindingCount; i++) {
        const bindingIndex = this.callbackBindingIndices[bindingOffset + i]
        if (bindingIndex === index) {
          return this.callbackBindingOuts[bindingOffset + i]
        }
      }

      // Scratch/remapped outputs for this scope
      if (index >= base) {
        const offset = index - base
        const remapped = this.callbackRemapBase[depth] + offset
        return this.outsPool.get(remapped)
      }
    }
    return this.outsPool.get(index)
  }
}
