// dprint-ignore-file
import { Compressor } from '../../gen/compressor'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore

export function callCompressor(
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
  // compressor(in, attack=.01, release=.1, threshold=-24, ratio=4, knee=6, key?)
  if (posCount < 1 && namedCount === 0) {
    stack.push(VmTag.Undef)
    return
  }

  let inTag: VmTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
  let inNum: f64 = posCount >= 1 ? posNums[0] : 0.0
  let inAux: i32 = posCount >= 1 ? posAux[0] : 0

  let attackTag: VmTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let attackNum: f64 = posCount >= 2 ? posNums[1] : 0.01
  let attackAux: i32 = posCount >= 2 ? posAux[1] : 0

  let releaseTag: VmTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let releaseNum: f64 = posCount >= 3 ? posNums[2] : 0.1
  let releaseAux: i32 = posCount >= 3 ? posAux[2] : 0

  let thresholdTag: VmTag = posCount >= 4 ? (posTags[3] as VmTag) : VmTag.Num
  let thresholdNum: f64 = posCount >= 4 ? posNums[3] : -24.0
  let thresholdAux: i32 = posCount >= 4 ? posAux[3] : 0

  let ratioTag: VmTag = posCount >= 5 ? (posTags[4] as VmTag) : VmTag.Num
  let ratioNum: f64 = posCount >= 5 ? posNums[4] : 4.0
  let ratioAux: i32 = posCount >= 5 ? posAux[4] : 0

  let kneeTag: VmTag = posCount >= 6 ? (posTags[5] as VmTag) : VmTag.Num
  let kneeNum: f64 = posCount >= 6 ? posNums[5] : 6.0
  let kneeAux: i32 = posCount >= 6 ? posAux[5] : 0

  let keyTag: VmTag = posCount >= 7 ? (posTags[6] as VmTag) : VmTag.Undef
  let keyNum: f64 = posCount >= 7 ? posNums[6] : 0.0
  let keyAux: i32 = posCount >= 7 ? posAux[6] : 0

  let index: i32 = 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.In) {
      inTag = nameTags[i] as VmTag
      inNum = nameNums[i]
      inAux = nameAux[i]
    }
    else if (k === VmSym.Attack) {
      attackTag = nameTags[i] as VmTag
      attackNum = nameNums[i]
      attackAux = nameAux[i]
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
    else if (k === VmSym.Ratio) {
      ratioTag = nameTags[i] as VmTag
      ratioNum = nameNums[i]
      ratioAux = nameAux[i]
    }
    else if (k === VmSym.Knee) {
      kneeTag = nameTags[i] as VmTag
      kneeNum = nameNums[i]
      kneeAux = nameAux[i]
    }
    else if (k === VmSym.Key) {
      keyTag = nameTags[i] as VmTag
      keyNum = nameNums[i]
      keyAux = nameAux[i]
    }
    else if (k === VmSym.Index && nameTags[i] === VmTag.Num) {
      index = i32(nameNums[i])
    }
  }

  if (index < 0) index = 0
  if (index > 63) index = 63

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const key$ = keyTag === VmTag.Undef ? in$ : audio.toAudioPtr(keyTag, keyNum, keyAux, length, program)
  const attack$ = audio.toAudioPtr(attackTag, attackNum, attackAux, length, program)
  const release$ = audio.toAudioPtr(releaseTag, releaseNum, releaseAux, length, program)
  const threshold$ = audio.toAudioPtr(thresholdTag, thresholdNum, thresholdAux, length, program)
  const ratio$ = audio.toAudioPtr(ratioTag, ratioNum, ratioAux, length, program)
  const knee$ = audio.toAudioPtr(kneeTag, kneeNum, kneeAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const levelDb$ = program.compressorOutsPool.getLevelDb(index)
  const grDb$ = program.compressorOutsPool.getGrDb(index)

  const comp = program.gensPool.get(Op.Compressor) as Compressor
  comp.in$ = in$
  comp.key$ = key$
  comp.attack$ = attack$
  comp.release$ = release$
  comp.threshold$ = threshold$
  comp.ratio$ = ratio$
  comp.knee$ = knee$

  comp.telemetryEnabled = 1
  comp.telemetryRingBase = ringBase
  comp.telemetryLevelDb$ = levelDb$
  comp.telemetryGrDb$ = grDb$

  comp.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}


