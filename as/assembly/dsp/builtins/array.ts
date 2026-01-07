// dprint-ignore-file
import { setVmError } from '../../globals'
import { Program } from '../../program'
import { randomU32 } from '../../util'
import { Dsp } from '../dsp'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callReverse(
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
  dsp: Dsp,
): void {
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  const arrTag = posTags[0] as VmTag
  const arrId = posAux[0]

  if (arrTag !== VmTag.Arr) {
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

  if (n <= 0) {
    // Return the original empty array
    stack.push(VmTag.Arr, 0.0, arrId)
    return
  }

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

  // Create the output array
  dsp.arrays.start[outId] = outStart
  dsp.arrays.len[outId] = n
  dsp.arrays.createPc[outId] = srcPc
  dsp.arrays.elemType[outId] = dsp.arrays.elemType[arrId]
  dsp.arrays.count = outId + 1
  dsp.arrays.elemCount = outEnd

  // Copy elements in reverse order
  for (let i: i32 = 0; i < n; i++) {
    const srcIdx = srcStart + i
    const dstIdx = outStart + (n - 1 - i)

    dsp.arrays.elemTag[dstIdx] = dsp.arrays.elemTag[srcIdx]
    dsp.arrays.elemNum[dstIdx] = dsp.arrays.elemNum[srcIdx]
    dsp.arrays.elemAux[dstIdx] = dsp.arrays.elemAux[srcIdx]
  }

  stack.push(VmTag.Arr, 0.0, outId)
}

// @ts-ignore
@inline
export function callShuffle(
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
  dsp: Dsp,
): void {
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  const arrTag = posTags[0] as VmTag
  const arrId = posAux[0]

  if (arrTag !== VmTag.Arr) {
    stack.push(VmTag.Undef)
    return
  }
  if (arrId < 0 || arrId >= dsp.arrays.count) {
    stack.push(VmTag.Undef)
    return
  }

  // Get seed from second positional parameter or named parameter
  let seed: f64 = 0.0
  if (posCount >= 2 && (posTags[1] as VmTag) === VmTag.Num) {
    seed = posNums[1]
  } else {
    // Get seed parameter from named parameters (backward compatibility)
    for (let i = 0; i < namedCount; i++) {
      if (nameSyms[i] === VmSym.Seed) {
        seed = nameNums[i]
        break
      }
    }
  }

  if (arrTag !== VmTag.Arr) {
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

  if (n <= 0) {
    // Return the original empty array
    stack.push(VmTag.Arr, 0.0, arrId)
    return
  }

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

  // Create the output array
  dsp.arrays.start[outId] = outStart
  dsp.arrays.len[outId] = n
  dsp.arrays.createPc[outId] = srcPc
  dsp.arrays.elemType[outId] = dsp.arrays.elemType[arrId]
  dsp.arrays.count = outId + 1
  dsp.arrays.elemCount = outEnd

  // First copy all elements to the output array
  for (let i: i32 = 0; i < n; i++) {
    const srcIdx = srcStart + i
    const dstIdx = outStart + i

    dsp.arrays.elemTag[dstIdx] = dsp.arrays.elemTag[srcIdx]
    dsp.arrays.elemNum[dstIdx] = dsp.arrays.elemNum[srcIdx]
    dsp.arrays.elemAux[dstIdx] = dsp.arrays.elemAux[srcIdx]
  }

  // Fisher-Yates shuffle algorithm
  for (let i: i32 = n - 1; i > 0; i--) {
    // Generate random index using the same RNG as arrayRandom
    const rngSeed = seed + f64(i)
    const randomU32Value = randomU32(rngSeed)
    const j: i32 = i32(randomU32Value % u32(i + 1))

    // Swap elements i and j
    const tempTag = dsp.arrays.elemTag[outStart + i]
    const tempNum = dsp.arrays.elemNum[outStart + i]
    const tempAux = dsp.arrays.elemAux[outStart + i]

    dsp.arrays.elemTag[outStart + i] = dsp.arrays.elemTag[outStart + j]
    dsp.arrays.elemNum[outStart + i] = dsp.arrays.elemNum[outStart + j]
    dsp.arrays.elemAux[outStart + i] = dsp.arrays.elemAux[outStart + j]

    dsp.arrays.elemTag[outStart + j] = tempTag
    dsp.arrays.elemNum[outStart + j] = tempNum
    dsp.arrays.elemAux[outStart + j] = tempAux
  }

  stack.push(VmTag.Arr, 0.0, outId)
}
