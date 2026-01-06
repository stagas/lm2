// dprint-ignore-file
import { Step } from '../../gen/step'
import { Program } from '../../program'
import { Op } from '../../shared'
import { randomU32 } from '../../util'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { VmSym } from '../vm-sym'

// @ts-ignore
@inline
export function callArrayStep(
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
  dsp: Dsp
): void {
  // arrayStep(array, trig)
  if (posCount < 2) {
    stack.push(VmTag.Undef)
    return
  }

  const arrTag = posTags[0] as VmTag
  const arrId = posAux[0]
  if (arrTag !== VmTag.Arr || arrId < 0 || arrId >= dsp.arrays.count) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  const n = dsp.arrays.len[arrId]
  if (n <= 0) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  const elemType = dsp.arrays.elemType[arrId] as VmTag
  if (elemType !== VmTag.Num && elemType !== VmTag.Audio) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  // Get trigger signal
  const trigTag = posTags[1] as VmTag
  const trigNum = posNums[1]
  const trigAux = posAux[1]
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  // Use a step gen for state
  const stepGen = program.gensPool.get(Op.ArrayStep) as Step
  if (stepGen.arrId !== arrId) {
    stepGen.arrId = arrId
    stepGen.reset()
  }
  stepGen.trig$ = trig$

  // Process to update state
  stepGen.process(0, length)

  // Get current element using VmArrays.getIndex for proper telemetry
  let currentIndex = stepGen.currentIndex % n
  if (currentIndex < 0) {
    stepGen.currentIndex = 0
    currentIndex = 0
  }

  // Push array and index onto stack, then call getIndex
  stack.push(VmTag.Arr, 0.0, arrId)
  stack.push(VmTag.Num, currentIndex as f64, 0)
  dsp.arrays.getIndex(stack, audio, program, length)
}

// @ts-ignore
@inline
export function callArrayRandom(
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
  dsp: Dsp
): void {
  // arrayRandom(array, trig, seed?)
  if (posCount < 2) {
    stack.push(VmTag.Undef)
    return
  }

  const arrTag = posTags[0] as VmTag
  const arrId = posAux[0]
  if (arrTag !== VmTag.Arr || arrId < 0 || arrId >= dsp.arrays.count) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  const n = dsp.arrays.len[arrId]
  if (n <= 0) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  const elemType = dsp.arrays.elemType[arrId] as VmTag
  if (elemType !== VmTag.Num && elemType !== VmTag.Audio) {
    stack.push(VmTag.Num, 0.0)
    return
  }

  // Get trigger signal
  const trigTag = posTags[1] as VmTag
  const trigNum = posNums[1]
  const trigAux = posAux[1]
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  // Get seed parameter (named)
  let seed: f64 = 0.0
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Seed) {
      seed = nameNums[i]
      break
    }
  }

  // Use a step gen for state
  const stepGen = program.gensPool.get(Op.ArrayRandom) as Step
  if (stepGen.arrId !== arrId) {
    stepGen.arrId = arrId
    stepGen.reset()
  }
  stepGen.trig$ = trig$

  // Process to update state
  stepGen.process(0, length)

  // Generate random index using proper RNG
  const rngSeed = seed + (stepGen.currentIndex as f64)
  const randomU32Value = randomU32(rngSeed)
  const randomIndex = i32(randomU32Value % u32(n))

  // Push array and random index onto stack, then call getIndex
  stack.push(VmTag.Arr, 0.0, arrId)
  stack.push(VmTag.Num, randomIndex as f64, 0)
  dsp.arrays.getIndex(stack, audio, program, length)
}
