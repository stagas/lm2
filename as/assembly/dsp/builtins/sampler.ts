// dprint-ignore-file
import { Sampler } from '../../gen/sampler'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
// @inline
export function callSampler(
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
): void {
  // sampler(sample, speed=1, offset=0, repeat=false, trig=0)
  if (posCount < 1 || posTags[0] !== VmTag.Num) {
    stack.push(VmTag.Undef)
    return
  }

  const sampleIndex: i32 = i32(posNums[0])

  // speed (default 1.0)
  let speedTag: VmTag = VmTag.Num
  let speedNum: f64 = 1.0
  let speedAux: i32 = 0
  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    speedTag = posTags[1] as VmTag
    speedNum = posNums[1]
    speedAux = posAux[1]
  }

  // offset (default 0, but 1 if speed is negative constant)
  let offsetTag: VmTag = VmTag.Num
  let offsetNum: f64 = (speedTag === VmTag.Num && speedNum < 0.0) ? 1.0 : 0.0
  let offsetAux: i32 = 0
  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    offsetTag = posTags[2] as VmTag
    offsetNum = posNums[2]
    offsetAux = posAux[2]
  }

  // repeat (default false)
  let repeatTag: VmTag = VmTag.Bool
  let repeatNum: f64 = 0.0
  let repeatAux: i32 = 0
  if (posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null) {
    repeatTag = posTags[3] as VmTag
    repeatNum = posNums[3]
    repeatAux = posAux[3]
  }

  // trig (default 0)
  let trigTag: VmTag = VmTag.Num
  let trigNum: f64 = 0.0
  let trigAux: i32 = 0
  if (posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null) {
    trigTag = posTags[4] as VmTag
    trigNum = posNums[4]
    trigAux = posAux[4]
  }

  // Check for named parameters - iterate once through all named args
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Speed) {
      speedTag = nameTags[i] as VmTag
      speedNum = nameNums[i]
      speedAux = nameAux[i]
    }
    else if (nameSyms[i] === VmSym.Offset) {
      offsetTag = nameTags[i] as VmTag
      offsetNum = nameNums[i]
      offsetAux = nameAux[i]
    }
    else if (nameSyms[i] === VmSym.Repeat) {
      repeatTag = nameTags[i] as VmTag
      repeatNum = nameNums[i]
      repeatAux = nameAux[i]
    }
    else if (nameSyms[i] === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

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
