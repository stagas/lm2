// dprint-ignore-file
import { Sampler } from '../../gen/sampler'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callSampler(
  posCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  // sampler(sample, speed=1, offset=0, trig=0, repeat=false)
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
  // If offset is omitted and speed is a constant negative number, default to "end".
  const defaultOffset: f64 = (!offsetIsSet && speedTag === VmTag.Num && speedNum < 0.0) ? 1.0 : 0.0
  const offsetTag: VmTag = offsetIsSet ? (posTags[2] as VmTag) : VmTag.Num
  const offsetNum: f64 = offsetIsSet ? posNums[2] : defaultOffset
  const offsetAux: i32 = offsetIsSet ? posAux[2] : 0

  const trigIsSet = posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null
  const trigTag: VmTag = trigIsSet ? (posTags[3] as VmTag) : VmTag.Num
  const trigNum: f64 = trigIsSet ? posNums[3] : 0.0
  const trigAux: i32 = trigIsSet ? posAux[3] : 0

  const repeatIsSet = posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null
  const repeatTag: VmTag = repeatIsSet ? (posTags[4] as VmTag) : VmTag.Bool
  const repeatNum: f64 = repeatIsSet ? posNums[4] : 0.0
  const repeatAux: i32 = repeatIsSet ? posAux[4] : 0

  const speed$: usize = audio.toAudioPtr(speedTag, speedNum, speedAux, length, program)
  const offset$: usize = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
  const trig$: usize = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)
  const repeat$: usize = audio.toAudioPtr(repeatTag, repeatNum, repeatAux, length, program)

  const outIndex: i32 = audio.allocOut(program)
  const out$: usize = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.Sampler) as Sampler
  gen.sampleIndex = sampleIndex
  gen.speed$ = speed$
  gen.offset$ = offset$
  gen.trig$ = trig$
  gen.repeat$ = repeat$
  gen.needleHistory$ = changetype<usize>(program.sampleNeedleHistory)
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

