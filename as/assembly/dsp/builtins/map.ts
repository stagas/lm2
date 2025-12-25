// dprint-ignore-file
import { setVmError } from '../../globals'
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callMap(
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
  audio: VmAudio,
  program: Program,
  length: i32,
  left$: usize,
  right$: usize,
  dsp: Dsp,
  argTags: StaticArray<i32>,
  argNums: StaticArray<f64>,
  argAux: StaticArray<i32>,
): void {
  if (posCount < 2) {
    stack.push(VmTag.Undef)
    return
  }

  const arrTag = posTags[0] as VmTag
  const arrId = posAux[0]
  const cbTag = posTags[1] as VmTag
  const cbAux = posAux[1]

  if (arrTag !== VmTag.Arr) {
    stack.push(VmTag.Undef)
    return
  }
  if (cbTag !== VmTag.Func) {
    stack.push(VmTag.Undef)
    return
  }
  if (arrId < 0 || arrId >= dsp.arrays.count) {
    stack.push(VmTag.Undef)
    return
  }

  const srcStart = dsp.arrays.start[arrId]
  const n = dsp.arrays.len[arrId]
  const srcPc = dsp.arrays.createPc[arrId]

  const outId = dsp.arrays.count
  const outStart = dsp.arrays.elemCount
  const outEnd = outStart + n

  if (outId < 0 || outId >= dsp.arrays.start.length) {
    setVmError(20, srcPc)
    stack.push(VmTag.Undef)
    return
  }
  if (outEnd < 0 || outEnd > dsp.arrays.elemTag.length) {
    setVmError(21, srcPc)
    stack.push(VmTag.Undef)
    return
  }

  // Create a "holey" output array first so nested allocations in the callback can't collide
  // with the output's reserved element region.
  dsp.arrays.start[outId] = outStart
  dsp.arrays.len[outId] = n
  dsp.arrays.createPc[outId] = srcPc
  dsp.arrays.elemType[outId] = VmTag.Undef
  dsp.arrays.count = outId + 1
  dsp.arrays.elemCount = outEnd
  for (let i: i32 = 0; i < n; i++) {
    dsp.arrays.elemTag[outStart + i] = VmTag.Undef
    dsp.arrays.elemNum[outStart + i] = 0.0
    dsp.arrays.elemAux[outStart + i] = 0
  }

  let tag0: i32 = -1
  let mixed: bool = false

  for (let i: i32 = 0; i < n; i++) {
    const at = srcStart + i
    const eTag = dsp.arrays.elemTag[at] as VmTag
    const eNum = dsp.arrays.elemNum[at]
    const eAux = dsp.arrays.elemAux[at]

    // cb(x, i, arr)
    argTags[0] = eTag
    argNums[0] = eNum
    argAux[0] = eAux
    argTags[1] = VmTag.Num
    argNums[1] = f64(i)
    argAux[1] = 0
    argTags[2] = VmTag.Arr
    argNums[2] = 0.0
    argAux[2] = arrId

    dsp.vmInvokeFuncKeepOuts(cbAux, 3, argTags, argNums, argAux, length, left$, right$)

    const resIdx = stack.pop()
    const rTag = stack.tag[resIdx]
    if (tag0 < 0) tag0 = rTag
    else if (rTag !== tag0) mixed = true

    // If the callback returns audio, copy it into a fresh stable out buffer before storing.
    // This avoids cases where callback-produced buffers are reused/overwritten by later iterations.
    if ((rTag as VmTag) === VmTag.Audio) {
      const srcIndex = stack.aux[resIdx]
      const src$ = program.getOutBuffer(srcIndex)
      const outIndex = audio.allocOut(program)
      const out$ = program.outsPool.get(outIndex)
      const bytes: usize = (length << 2) as usize
      memory.copy(out$, src$, bytes)
      dsp.arrays.elemTag[outStart + i] = VmTag.Audio
      dsp.arrays.elemNum[outStart + i] = 0.0
      dsp.arrays.elemAux[outStart + i] = outIndex
    }
    else {
      dsp.arrays.elemTag[outStart + i] = rTag
      dsp.arrays.elemNum[outStart + i] = stack.num[resIdx]
      dsp.arrays.elemAux[outStart + i] = stack.aux[resIdx]
    }
  }

  if (mixed) {
    setVmError(22, srcPc)
    stack.push(VmTag.Undef)
    return
  }

  dsp.arrays.elemType[outId] = tag0 < 0 ? (VmTag.Undef as i32) : tag0

  stack.push(VmTag.Arr, 0.0, outId)
}


