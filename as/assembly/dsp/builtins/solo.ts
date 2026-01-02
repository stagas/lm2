// dprint-ignore-file
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { addAudio } from '../audio-ops'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
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

  let lPtr$: usize = 0
  let rPtr$: usize = 0
  let returnTag = VmTag.Undef
  let returnNum = 0.0
  let returnAux = 0

  // Handle array input case: solo([L, R])
  if (posTags[0] === VmTag.Arr) {
    const arrId: i32 = posAux[0]
    if (arrId < 0 || arrId >= dsp.arrays.count) {
      // Invalid array, output silence
      lPtr$ = audio.toAudioPtr(VmTag.Num, 0.0, 0, length, program)
      rPtr$ = lPtr$
      returnTag = VmTag.Num
      returnNum = 0.0
      returnAux = 0
    } else {
      const arrLen = dsp.arrays.len[arrId]
      const start: i32 = dsp.arrays.start[arrId]

      if (arrLen >= 2) {
        // Get left channel
        const lTag = dsp.arrays.elemTag[start] as VmTag
        const lNum = dsp.arrays.elemNum[start]
        const lAux = dsp.arrays.elemAux[start]
        lPtr$ = audio.toAudioPtr(lTag, lNum, lAux, length, program)

        // Get right channel
        const rTag = dsp.arrays.elemTag[start + 1] as VmTag
        const rNum = dsp.arrays.elemNum[start + 1]
        const rAux = dsp.arrays.elemAux[start + 1]
        rPtr$ = audio.toAudioPtr(rTag, rNum, rAux, length, program)

        returnTag = lTag
        returnNum = lNum
        returnAux = lAux
      } else if (arrLen >= 1) {
        // Single element array, use for both channels
        const elemTag = dsp.arrays.elemTag[start] as VmTag
        const elemNum = dsp.arrays.elemNum[start]
        const elemAux = dsp.arrays.elemAux[start]
        lPtr$ = audio.toAudioPtr(elemTag, elemNum, elemAux, length, program)
        rPtr$ = lPtr$

        returnTag = elemTag
        returnNum = elemNum
        returnAux = elemAux
      } else {
        // Empty array, output silence
        lPtr$ = audio.toAudioPtr(VmTag.Num, 0.0, 0, length, program)
        rPtr$ = lPtr$
        returnTag = VmTag.Num
        returnNum = 0.0
        returnAux = 0
      }
    }
  } else {
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

    lPtr$ = audio.toAudioPtr(lTag, lNum, lAux, length, program)
    returnTag = lTag
    returnNum = lNum
    returnAux = lAux
  }

  addAudio(dsp.soloLeft$, dsp.soloLeft$, lPtr$, length)

  if (posTags[0] !== VmTag.Arr && posCount >= 2) {
    // R channel from positional arg (only when not handling array)
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

    rPtr$ = audio.toAudioPtr(rTag, rNum, rAux, length, program)
  }
  else if (posTags[0] !== VmTag.Arr) {
    // Check for named R parameter only (only when not handling array)
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
      rPtr$ = audio.toAudioPtr(rTag, rNum, rAux, length, program)
    }
    else {
      rPtr$ = lPtr$
    }
  }

  addAudio(dsp.soloRight$, dsp.soloRight$, rPtr$, length)

  // Return the input value
  stack.push(returnTag, returnNum, returnAux)
}
