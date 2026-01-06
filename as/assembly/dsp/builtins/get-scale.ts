// dprint-ignore-file
import { Program } from '../../program'
import { midiToFrequency, scaleInterval, scaleLength } from '../../mini/scales'
import { VmTag } from '../types'
import { VmArrays } from '../vm-arrays'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { Dsp } from '../dsp'

// getScale() -> array of scale intervals (semitones from root)
// Returns the current scale as defined by the `scale` directive
// For example, if scale='dorian', returns [0, 2, 3, 5, 7, 9, 10]
//
// @ts-ignore
@inline
export function callGetScale(
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
  arrays: VmArrays,
): void {
  const scaleIndex = dsp.scaleIndex
  const len = scaleLength(scaleIndex)

  if (len <= 0) {
    // Return empty array if scale is invalid
    // Push 0 elements to create an empty array
    arrays.create(0, stack, 0, audio, program, length)
    return
  }

  // Push scale intervals onto stack in forward order
  // arrays.create loops i from n-1 down to 0, popping and storing at start+i
  // So first pushed ends up at index 0, last pushed at index n-1
  for (let i: i32 = 0; i < len; i++) {
    const interval = scaleInterval(scaleIndex, i)
    stack.push(VmTag.Num, f64(midiToFrequency(interval)), 0)
  }

  // Create array from stack elements
  arrays.create(len, stack, 0, audio, program, length)
}

