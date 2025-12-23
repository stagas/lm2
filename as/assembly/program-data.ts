import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  LITERALS_COUNT,
  OPS_COUNT,
} from './constants'

export class ProgramData {
  ops: StaticArray<i32> = new StaticArray<i32>(OPS_COUNT)
  arrays: StaticArray<usize> = new StaticArray<usize>(ARRAYS_COUNT)
  literals: StaticArray<f32> = new StaticArray<f32>(LITERALS_COUNT)

  copyFrom(source: ProgramData): void {
    memory.copy(
      changetype<usize>(this.ops),
      changetype<usize>(source.ops),
      OPS_COUNT << 2,
    )

    memory.copy(
      changetype<usize>(this.literals),
      changetype<usize>(source.literals),
      LITERALS_COUNT << 2,
    )

    memory.copy(
      changetype<usize>(this.arrays),
      changetype<usize>(source.arrays),
      ARRAYS_COUNT * sizeof<usize>(),
    )

    const arrayBytes = (ARRAY_SIZE + ARRAY_HEADER_SIZE) << 2
    for (let i = 0; i < ARRAYS_COUNT; i++) {
      const src$ = source.arrays[i]
      const dst$ = this.arrays[i]
      if (src$ === 0 || dst$ === 0) continue
      memory.copy(dst$, src$, arrayBytes)
    }
  }
}
