// dprint-ignore-file
import { Program } from '../../program'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { addAudio } from '../audio-ops'

// @ts-ignore
@inline
export function callOut(
  posCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
  left$: usize,
  right$: usize,
): void {
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }
  const aTag = posTags[0] as VmTag
  const aNum = posNums[0]
  const aAux = posAux[0]
  const aPtr$ = audio.toAudioPtr(aTag, aNum, aAux, length, program)
  addAudio(left$, left$, aPtr$, length)
  addAudio(right$, right$, aPtr$, length)
  // Return the input
  if (aTag === VmTag.Audio) stack.push(VmTag.Audio, 0.0, aAux)
  else stack.push(aTag, aNum, aAux)
}

