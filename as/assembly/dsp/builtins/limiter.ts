// dprint-ignore-file
import { Limiter } from '../../gen/limiter'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callLimiter(
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
  ringBase: i32,
): void {
  // limiter(in, release=.1, threshold=-0)
  if (posCount < 1 && namedCount === 0) {
    stack.push(VmTag.Undef)
    return
  }

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let releaseTag: VmTag = VmTag.Num
  let releaseNum: f64 = 0.1
  let releaseAux: i32 = 0

  let thresholdTag: VmTag = VmTag.Num
  let thresholdNum: f64 = -0
  let thresholdAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    releaseTag = posTags[1] as VmTag
    releaseNum = posNums[1]
    releaseAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    thresholdTag = posTags[2] as VmTag
    thresholdNum = posNums[2]
    thresholdAux = posAux[2]
  }

  let index: i32 = 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.In) {
      inTag = nameTags[i] as VmTag
      inNum = nameNums[i]
      inAux = nameAux[i]
    }
    else if (k === VmSym.Release) {
      releaseTag = nameTags[i] as VmTag
      releaseNum = nameNums[i]
      releaseAux = nameAux[i]
    }
    else if (k === VmSym.Threshold) {
      thresholdTag = nameTags[i] as VmTag
      thresholdNum = nameNums[i]
      thresholdAux = nameAux[i]
    }
    else if (k === VmSym.Index && nameTags[i] === VmTag.Num) {
      index = i32(nameNums[i])
    }
  }

  if (index < 0) index = 0
  if (index > 63) index = 63

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const release$ = audio.toAudioPtr(releaseTag, releaseNum, releaseAux, length, program)
  const threshold$ = audio.toAudioPtr(thresholdTag, thresholdNum, thresholdAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const levelDb$ = program.limiterOutsPool.getLevelDb(index)
  const grDb$ = program.limiterOutsPool.getGrDb(index)

  const limiter = program.gensPool.get(Op.Limiter) as Limiter
  limiter.in$ = in$
  limiter.release$ = release$
  limiter.threshold$ = threshold$

  limiter.telemetryEnabled = 1
  limiter.telemetryRingBase = ringBase
  limiter.telemetryLevelDb$ = levelDb$
  limiter.telemetryGrDb$ = grDb$

  limiter.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}
