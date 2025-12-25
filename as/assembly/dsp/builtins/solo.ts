// dprint-ignore-file
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { addAudio } from '../audio-ops'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callSolo(
  posCount: i32,
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

  dsp.soloHas = 1

  const lTag = posTags[0] as VmTag
  const lNum = posNums[0]
  const lAux = posAux[0]
  const lPtr$ = audio.toAudioPtr(lTag, lNum, lAux, length, program)

  addAudio(dsp.soloLeft$, dsp.soloLeft$, lPtr$, length)
  if (posCount >= 2) {
    const rTag = posTags[1] as VmTag
    const rNum = posNums[1]
    const rAux = posAux[1]
    const rPtr$ = audio.toAudioPtr(rTag, rNum, rAux, length, program)
    addAudio(dsp.soloRight$, dsp.soloRight$, rPtr$, length)
  }
  else {
    addAudio(dsp.soloRight$, dsp.soloRight$, lPtr$, length)
  }

  // Return the left input
  if (lTag === VmTag.Audio) stack.push(VmTag.Audio, 0.0, lAux)
  else stack.push(lTag, lNum, lAux)
}


