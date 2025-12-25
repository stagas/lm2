// dprint-ignore-file
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callPost(
  posCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  dsp: Dsp,
): void {
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  // Avoid dynamically extending the post chain while running it.
  if (dsp.postRunning !== 0) {
    stack.push(VmTag.Undef)
    return
  }

  const fTag = posTags[0] as VmTag
  if (fTag !== VmTag.Func) {
    stack.push(VmTag.Undef)
    return
  }

  const at: i32 = dsp.postCount
  if (at >= 0 && at < dsp.postPcs.length) {
    dsp.postPcs[at] = posAux[0]
    dsp.postCount = at + 1
  }

  stack.push(VmTag.Undef)
}


