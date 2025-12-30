// dprint-ignore-file
import { Program } from '../../program'
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
): void {
  // analyser(audio, index=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  const aTag = posTags[0] as VmTag
  const aNum = posNums[0]
  const aAux = posAux[0]
  const aPtr$ = audio.toAudioPtr(aTag, aNum, aAux, length, program)

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

  const analyser$ = program.analyserOutsPool.get(analyserIndex)
  const baseOffset = analyserRingBase
  // Copy samples into the analyser ring buffer at current base
  for (let i = 0; i < length; i++) {
    const s = load<f32>(aPtr$ + (i * 4) as usize)
    store<f32>(analyser$ + ((baseOffset + i) * 4) as usize, s)
  }

  // Return the input unchanged
  if (aTag === VmTag.Audio) stack.push(VmTag.Audio, 0.0, aAux)
  else stack.push(aTag, aNum, aAux)
}
