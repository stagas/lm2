// dprint-ignore-file
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { addAudio } from '../audio-ops'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
// @inline
export function callSolo(
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

  dsp.soloHas = 1

  // L channel (positional or named)
  let lTag = (posTags[0] as VmTag)
  let lNum = posNums[0]
  let lAux = posAux[0]

  // Check for named L parameter
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.L) {
      lTag = nameTags[i] as VmTag
      lNum = nameNums[i]
      lAux = nameAux[i]
      break
    }
  }

  const lPtr$ = audio.toAudioPtr(lTag, lNum, lAux, length, program)
  addAudio(dsp.soloLeft$, dsp.soloLeft$, lPtr$, length)

  if (posCount >= 2) {
    // R channel from positional arg
    let rTag = (posTags[1] as VmTag)
    let rNum = posNums[1]
    let rAux = posAux[1]

    // Check for named R parameter
    for (let i = 0; i < namedCount; i++) {
      if (nameSyms[i] === VmSym.R) {
        rTag = nameTags[i] as VmTag
        rNum = nameNums[i]
        rAux = nameAux[i]
        break
      }
    }

    const rPtr$ = audio.toAudioPtr(rTag, rNum, rAux, length, program)
    addAudio(dsp.soloRight$, dsp.soloRight$, rPtr$, length)
  }
  else {
    // Check for named R parameter only
    let rTag = VmTag.Undef
    let rNum = 0.0
    let rAux = 0

    for (let i = 0; i < namedCount; i++) {
      if (nameSyms[i] === VmSym.R) {
        rTag = nameTags[i] as VmTag
        rNum = nameNums[i]
        rAux = nameAux[i]
        break
      }
    }

    if (rTag !== VmTag.Undef) {
      const rPtr$ = audio.toAudioPtr(rTag, rNum, rAux, length, program)
      addAudio(dsp.soloRight$, dsp.soloRight$, rPtr$, length)
    }
    else {
      addAudio(dsp.soloRight$, dsp.soloRight$, lPtr$, length)
    }
  }

  // Return the left input
  if (lTag === VmTag.Audio) stack.push(VmTag.Audio, 0.0, lAux)
  else stack.push(lTag, lNum, lAux)
}
