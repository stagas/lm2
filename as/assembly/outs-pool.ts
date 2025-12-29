import { CHUNK_SIZE } from './constants'

export class OutsPool {
  outs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(1024)
  constructor() {
    for (let i = 0; i < this.outs.length; i++) {
      this.outs[i] = new StaticArray<f32>(CHUNK_SIZE)
    }
  }
  @inline
  get(index: i32): usize {
    return changetype<usize>(this.outs[index])
  }
}
