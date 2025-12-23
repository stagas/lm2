// dprint-ignore-file
import { Slicer } from '../../gen/slicer'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callSlicer(
  posCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  // slicer(sample, speed=1, offset=0, slice=0, threshold=0.5, trig=0, repeat=false)
  if (posCount < 1 || posTags[0] !== VmTag.Num) {
    stack.push(VmTag.Undef)
    return
  }

  const sampleIndex: i32 = i32(posNums[0])

  const speedIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
  const speedTag: VmTag = speedIsSet ? (posTags[1] as VmTag) : VmTag.Num
  const speedNum: f64 = speedIsSet ? posNums[1] : 1.0
  const speedAux: i32 = speedIsSet ? posAux[1] : 0

  const offsetIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
  const offsetTag: VmTag = offsetIsSet ? (posTags[2] as VmTag) : VmTag.Num
  const offsetNum: f64 = offsetIsSet ? posNums[2] : 0.0
  const offsetAux: i32 = offsetIsSet ? posAux[2] : 0

  const sliceIsSet = posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null
  const sliceTag: VmTag = sliceIsSet ? (posTags[3] as VmTag) : VmTag.Num
  const sliceNum: f64 = sliceIsSet ? posNums[3] : 0.0
  const sliceAux: i32 = sliceIsSet ? posAux[3] : 0

  const thresholdIsSet = posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null
  const thresholdTag: VmTag = thresholdIsSet ? (posTags[4] as VmTag) : VmTag.Num
  const thresholdNum: f64 = thresholdIsSet ? posNums[4] : 0.5
  const thresholdAux: i32 = thresholdIsSet ? posAux[4] : 0

  const trigIsSet = posCount >= 6 && posTags[5] !== VmTag.Undef && posTags[5] !== VmTag.Null
  const trigTag: VmTag = trigIsSet ? (posTags[5] as VmTag) : VmTag.Num
  const trigNum: f64 = trigIsSet ? posNums[5] : 0.0
  const trigAux: i32 = trigIsSet ? posAux[5] : 0

  const repeatIsSet = posCount >= 7 && posTags[6] !== VmTag.Undef && posTags[6] !== VmTag.Null
  const repeatTag: VmTag = repeatIsSet ? (posTags[6] as VmTag) : VmTag.Bool
  const repeatNum: f64 = repeatIsSet ? posNums[6] : 0.0
  const repeatAux: i32 = repeatIsSet ? posAux[6] : 0

  const speed$: usize = audio.toAudioPtr(speedTag, speedNum, speedAux, length, program)
  const offset$: usize = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
  const slice$: usize = audio.toAudioPtr(sliceTag, sliceNum, sliceAux, length, program)
  const threshold$: usize = audio.toAudioPtr(thresholdTag, thresholdNum, thresholdAux, length, program)
  const trig$: usize = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)
  const repeat$: usize = audio.toAudioPtr(repeatTag, repeatNum, repeatAux, length, program)

  const outIndex: i32 = audio.allocOut(program)
  const out$: usize = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.Slicer) as Slicer
  gen.sampleIndex = sampleIndex
  gen.speed$ = speed$
  gen.offset$ = offset$
  gen.slice$ = slice$
  gen.threshold$ = threshold$
  gen.trig$ = trig$
  gen.repeat$ = repeat$
  gen.needleHistory$ = changetype<usize>(program.sampleNeedleHistory)
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

