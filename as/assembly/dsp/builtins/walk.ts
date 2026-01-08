// dprint-ignore-file
import { Walk } from '../../gen/walk'
import { Program } from '../../program'
import { Op } from '../../shared'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { VmSym } from '../vm-sym'

// @ts-ignore
@inline
export function callArrayWalk(
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
  // arrayWalk(array, bar, swing?, offset?)
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

  // Get bar parameter (required positional)
  const barTag = posTags[1] as VmTag
  const barNum = posNums[1]
  const barAux = posAux[1]
  const bar$ = audio.toAudioPtr(barTag, barNum, barAux, length, program)

  // Get swing parameter (optional, can be positional or named)
  let swing$: usize = 0
  if (posCount >= 3) {
    // positional swing
    const swingTag = posTags[2] as VmTag
    const swingNum = posNums[2]
    const swingAux = posAux[2]
    swing$ = audio.toAudioPtr(swingTag, swingNum, swingAux, length, program)
  } else {
    // check for named swing
    for (let i = 0; i < namedCount; i++) {
      if (nameSyms[i] === VmSym.Swing) {
        swing$ = audio.toAudioPtr(nameTags[i] as VmTag, nameNums[i], nameAux[i], length, program)
        break
      }
    }
  }

  // Get offset parameter (optional, can be positional or named)
  let offset$: usize = 0
  if (posCount >= 4) {
    // positional offset
    const offsetTag = posTags[3] as VmTag
    const offsetNum = posNums[3]
    const offsetAux = posAux[3]
    offset$ = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
  } else {
    // check for named offset
    for (let i = 0; i < namedCount; i++) {
      if (nameSyms[i] === VmSym.Offset) {
        offset$ = audio.toAudioPtr(nameTags[i] as VmTag, nameNums[i], nameAux[i], length, program)
        break
      }
    }
  }

  // Calculate deterministic index based on current global sample count
  const barValue = Math.max(0.000001, load<f32>(bar$) as f64)
  const swingValue = load<f32>(swing$) as f64
  const offsetSeconds = load<f32>(offset$) as f64

  const rate: f64 = sampleRate as f64
  const safeBpm: f64 = Math.max(1.0, bpm as f64)
  const samplesPerWholeNote: f64 = (60.0 / safeBpm) * rate * 4.0
  const interval: f64 = barValue * samplesPerWholeNote
  const offsetSamples: f64 = offsetSeconds * rate

  // Calculate current beat position deterministically
  const globalSample: f64 = globalSampleCount as f64
  let sample: f64 = globalSample - offsetSamples

  // Apply swing if enabled (same logic as every gen)
  if (swingValue > 0.0) {
    const swingOffset: f64 = interval * Math.min(1.0, Math.max(0.0, swingValue)) * 0.5
    const beatIndex = i32(Math.floor(sample / interval))
    if ((beatIndex & 1) === 1) {
      sample -= swingOffset
    }
  }

  // Current beat cycle becomes our array index
  const currentBeatCycle = i32(Math.max(0, Math.floor(sample / interval)))
  let currentIndex = currentBeatCycle % n
  if (currentIndex < 0) {
    currentIndex = 0
  }

  // Push array and index onto stack, then call getIndex
  stack.push(VmTag.Arr, 0.0, arrId)
  stack.push(VmTag.Num, currentIndex as f64, 0)
  dsp.arrays.getIndex(stack, audio, program, length)
}
