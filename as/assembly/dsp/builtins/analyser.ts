// dprint-ignore-file
import { FINAL_OUT_ANALYSER_L_INDEX } from '../../constants'
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callAnalyser(
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
  analyserRingBase: i32,
  dsp: Dsp,
): void {
  // analyser(audio, index=0) or analyser([audio1, audio2, ...], index=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  // Optional second positional argument or named argument selects analyser index
  let analyserIndex = 0
  if (posCount >= 2 && posTags[1] === VmTag.Num) analyserIndex = i32(posNums[1])

  // Check for named 'index' parameter
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Index && nameTags[i] === VmTag.Num) {
      analyserIndex = i32(nameNums[i])
      break
    }
  }

  if (analyserIndex < 0) analyserIndex = 0
  const maxUserIndex: i32 = FINAL_OUT_ANALYSER_L_INDEX - 1
  if (analyserIndex > maxUserIndex) analyserIndex = maxUserIndex

  const argTag = posTags[0] as VmTag
  const argNum = posNums[0]
  const argAux = posAux[0]

  if (argTag === VmTag.Arr) {
    // Handle array case: analyser([audio1, audio2, ...], index)
    const arrId: i32 = argAux
    if (arrId < 0 || arrId >= dsp.arrays.count) {
      // Invalid array, return undefined
      stack.push(VmTag.Undef)
      return
    }

    let arrLen: i32 = dsp.arrays.len[arrId]
    const start: i32 = dsp.arrays.start[arrId]
    if (arrLen <= 0) {
      stack.push(VmTag.Arr, 0.0, arrId)
      return
    }

    if (arrLen > maxUserIndex + 1) arrLen = maxUserIndex + 1
    const maxStart: i32 = maxUserIndex - (arrLen - 1)
    if (analyserIndex > maxStart) analyserIndex = maxStart
    if (analyserIndex < 0) analyserIndex = 0

    // Copy each array element to consecutive analyser buffers
    for (let elemIdx = 0; elemIdx < arrLen; elemIdx++) {
      const elemTag = dsp.arrays.elemTag[start + elemIdx] as VmTag
      const elemNum = dsp.arrays.elemNum[start + elemIdx]
      const elemAux = dsp.arrays.elemAux[start + elemIdx]
      const elemPtr$ = audio.toAudioPtr(elemTag, elemNum, elemAux, length, program)

      const analyser$ = program.analyserOutsPool.get(analyserIndex + elemIdx)
      const baseOffset = analyserRingBase
      // Copy samples into the analyser ring buffer at current base
      for (let i = 0; i < length; i++) {
        const s = load<f32>(elemPtr$ + (i * 4) as usize)
        store<f32>(analyser$ + ((baseOffset + i) * 4) as usize, s)
      }
    }

    // Return the input array unchanged
    stack.push(VmTag.Arr, 0.0, arrId)
  } else {
    // Handle single signal case: analyser(audio, index)
    const aPtr$ = audio.toAudioPtr(argTag, argNum, argAux, length, program)

    const analyser$ = program.analyserOutsPool.get(analyserIndex)
    const baseOffset = analyserRingBase
    // Copy samples into the analyser ring buffer at current base
    for (let i = 0; i < length; i++) {
      const s = load<f32>(aPtr$ + (i * 4) as usize)
      store<f32>(analyser$ + ((baseOffset + i) * 4) as usize, s)
    }

    // Return the input unchanged
    if (argTag === VmTag.Audio) stack.push(VmTag.Audio, 0.0, argAux)
    else stack.push(argTag, argNum, argAux)
  }
}
