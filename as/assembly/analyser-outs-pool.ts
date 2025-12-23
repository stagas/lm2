import { RING_BUFFER_SIZE } from './constants'

export class AnalyserOutsPool {
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
