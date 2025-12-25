// dprint-ignore-file
import { Slicer } from '../../gen/slicer'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore

export function callSlicer(
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
  // slicer(sample, speed=1, offset=0, slice=0, threshold=0.5, repeat=false, trig=0)
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

  // offset (default 0)
  let offsetTag: VmTag = VmTag.Num
  let offsetNum: f64 = 0.0
  let offsetAux: i32 = 0
  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    offsetTag = posTags[2] as VmTag
    offsetNum = posNums[2]
    offsetAux = posAux[2]
  }

  // slice (default 0)
  let sliceTag: VmTag = VmTag.Num
  let sliceNum: f64 = 0.0
  let sliceAux: i32 = 0
  if (posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null) {
    sliceTag = posTags[3] as VmTag
    sliceNum = posNums[3]
    sliceAux = posAux[3]
  }

  // threshold (default 0.5)
  let thresholdTag: VmTag = VmTag.Num
  let thresholdNum: f64 = 0.5
  let thresholdAux: i32 = 0
  if (posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null) {
    thresholdTag = posTags[4] as VmTag
    thresholdNum = posNums[4]
    thresholdAux = posAux[4]
  }

  // repeat (default false)
  let repeatTag: VmTag = VmTag.Bool
  let repeatNum: f64 = 0.0
  let repeatAux: i32 = 0
  if (posCount >= 6 && posTags[5] !== VmTag.Undef && posTags[5] !== VmTag.Null) {
    repeatTag = posTags[5] as VmTag
    repeatNum = posNums[5]
    repeatAux = posAux[5]
  }

  // trig (default 0)
  let trigTag: VmTag = VmTag.Num
  let trigNum: f64 = 0.0
  let trigAux: i32 = 0
  if (posCount >= 7 && posTags[6] !== VmTag.Undef && posTags[6] !== VmTag.Null) {
    trigTag = posTags[6] as VmTag
    trigNum = posNums[6]
    trigAux = posAux[6]
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
    else if (nameSyms[i] === VmSym.Slice) {
      sliceTag = nameTags[i] as VmTag
      sliceNum = nameNums[i]
      sliceAux = nameAux[i]
    }
    else if (nameSyms[i] === VmSym.Threshold) {
      thresholdTag = nameTags[i] as VmTag
      thresholdNum = nameNums[i]
      thresholdAux = nameAux[i]
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
