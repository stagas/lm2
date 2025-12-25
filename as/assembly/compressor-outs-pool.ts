import { RING_BUFFER_SIZE } from './constants'

export class CompressorOutsPool {
  levelDbOuts: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(64)
  grDbOuts: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(64)

  constructor() {
    for (let i = 0; i < 64; i++) {
      this.levelDbOuts[i] = new StaticArray<f32>(RING_BUFFER_SIZE)
      this.grDbOuts[i] = new StaticArray<f32>(RING_BUFFER_SIZE)
    }
  }

  getLevelDb(index: i32): usize {
    return changetype<usize>(this.levelDbOuts[index])
  }

  getGrDb(index: i32): usize {
    return changetype<usize>(this.grDbOuts[index])
  }
}


