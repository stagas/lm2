// dprint-ignore-file
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callPost(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
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

  // Get callback from positional or named argument
  let fTag = posTags[0] as VmTag
  let fAux = posAux[0]

  // Check for named cb parameter
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Cb) {
      fTag = nameTags[i] as VmTag
      fAux = nameAux[i]
      break
    }
  }

  if (fTag !== VmTag.Func) {
    stack.push(VmTag.Undef)
    return
  }

  const at: i32 = dsp.postCount
  if (at >= 0 && at < dsp.postPcs.length) {
    dsp.postPcs[at] = fAux
    dsp.postCount = at + 1
  }

  stack.push(VmTag.Undef)
}
