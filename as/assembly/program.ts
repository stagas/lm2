import { ARRAYS_COUNT, LITERALS_COUNT, OPS_COUNT, RING_BUFFER_SIZE } from './constants'
import { Ad } from './gen/ad'
import { Gen } from './gen/gen'
import { Sin } from './gen/sin'
import { Smoothed } from './lib/smoothed'
import { Op } from './shared'

export class GenPool<T> {
  private index: i32 = 0
  private gens: T[] = []
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
  resetIndices(): void {
    this.sins.resetIndex()
    this.ads.resetIndex()
  }
  get(op: Op): Gen {
    switch (op) {
      case Op.Sin:
        return this.sins.get()
      case Op.Ad:
        return this.ads.get()
    }
    throw new Error(`Invalid gen op: ${op}`)
  }
}

class OutsPool {
  outs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(1024)
  constructor() {
    for (let i = 0; i < this.outs.length; i++) {
      this.outs[i] = new StaticArray<f32>(RING_BUFFER_SIZE)
    }
  }
  get(index: i32): usize {
    return changetype<usize>(this.outs[index])
  }
}

class ProgramData {
  lock: i32 = 0

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
  data: ProgramData = new ProgramData()
  ops: StaticArray<i32> = new StaticArray<i32>(OPS_COUNT)
  outsPool: OutsPool = new OutsPool()
  gensPool: GensPool = new GensPool()
  literalsSmoothed: StaticArray<Smoothed> = new StaticArray<Smoothed>(LITERALS_COUNT)
  constructor() {
    for (let i = 0; i < this.literalsSmoothed.length; i++) {
      this.literalsSmoothed[i] = new Smoothed()
    }
  }
}
