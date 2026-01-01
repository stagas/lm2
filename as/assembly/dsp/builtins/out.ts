// dprint-ignore-file
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { addAudio } from '../audio-ops'

// @ts-ignore
@inline
export function callOut(
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
  let lPtr$: usize = 0
  let rPtr$: usize = 0
  let returnTag = VmTag.Undef
  let returnNum = 0.0
  let returnAux = 0

  if (posCount >= 2) {
    // Handle old syntax: out(L, R)
    const lTag = posTags[0] as VmTag
    const lNum = posNums[0]
    const lAux = posAux[0]
    lPtr$ = audio.toAudioPtr(lTag, lNum, lAux, length, program)

    const rTag = posTags[1] as VmTag
    const rNum = posNums[1]
    const rAux = posAux[1]
    rPtr$ = audio.toAudioPtr(rTag, rNum, rAux, length, program)

    returnTag = lTag
    returnNum = lNum
    returnAux = lAux
  } else if (posCount >= 1) {
    // Get the first positional argument
    const argTag = posTags[0] as VmTag
    const argNum = posNums[0]
    const argAux = posAux[0]

    if (argTag === VmTag.Arr) {
      // Handle array case: out([L, R])
      const arrId: i32 = argAux
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
      // Handle single signal case: out(signal)
      lPtr$ = audio.toAudioPtr(argTag, argNum, argAux, length, program)
      rPtr$ = lPtr$ // Same signal to both channels
      returnTag = argTag
      returnNum = argNum
      returnAux = argAux
    }
  } else {
    // No arguments, output silence
    lPtr$ = audio.toAudioPtr(VmTag.Num, 0.0, 0, length, program)
    rPtr$ = lPtr$
    returnTag = VmTag.Num
    returnNum = 0.0
    returnAux = 0
  }

  // Add to output channels
  addAudio(dsp.outLeft$, dsp.outLeft$, lPtr$, length)
  addAudio(dsp.outRight$, dsp.outRight$, rPtr$, length)

  // Return the input value
  stack.push(returnTag, returnNum, returnAux)
}
