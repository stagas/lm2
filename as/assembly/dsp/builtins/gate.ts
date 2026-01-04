// dprint-ignore-file
import { Gate } from '../../gen/gate'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callGate(
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
  // gate(in, attack=.001, release=.5, threshold=-24, knee=0, hold=.02, key?) - ratio is fixed at 100
  if (posCount < 1 && namedCount === 0) {
    stack.push(VmTag.Undef)
    return
  }

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let attackTag: VmTag = VmTag.Num
  let attackNum: f64 = 0.001  // Fast attack for gate
  let attackAux: i32 = 0

  let releaseTag: VmTag = VmTag.Num
  let releaseNum: f64 = 0.5  // Slow release for gate
  let releaseAux: i32 = 0

  let thresholdTag: VmTag = VmTag.Num
  let thresholdNum: f64 = -24.0
  let thresholdAux: i32 = 0

  let ratioTag: VmTag = VmTag.Num
  let ratioNum: f64 = 100.0  // Fixed ratio for gate
  let ratioAux: i32 = 0

  let kneeTag: VmTag = VmTag.Num
  let kneeNum: f64 = 0.0  // Sharp knee for gate
  let kneeAux: i32 = 0

  let holdTag: VmTag = VmTag.Num
  let holdNum: f64 = 0.02
  let holdAux: i32 = 0

  let keyTag: VmTag = VmTag.Undef
  let keyNum: f64 = 0.0
  let keyAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    attackTag = posTags[1] as VmTag
    attackNum = posNums[1]
    attackAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    releaseTag = posTags[2] as VmTag
    releaseNum = posNums[2]
    releaseAux = posAux[2]
  }

  if (posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null) {
    thresholdTag = posTags[3] as VmTag
    thresholdNum = posNums[3]
    thresholdAux = posAux[3]
  }


  if (posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null) {
    kneeTag = posTags[4] as VmTag
    kneeNum = posNums[4]
    kneeAux = posAux[4]
  }

  if (posCount >= 6 && posTags[5] !== VmTag.Undef && posTags[5] !== VmTag.Null) {
    holdTag = posTags[5] as VmTag
    holdNum = posNums[5]
    holdAux = posAux[5]
  }

  if (posCount >= 7 && posTags[6] !== VmTag.Undef && posTags[6] !== VmTag.Null) {
    keyTag = posTags[6] as VmTag
    keyNum = posNums[6]
    keyAux = posAux[6]
  }

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
    else if (k === VmSym.Knee) {
      kneeTag = nameTags[i] as VmTag
      kneeNum = nameNums[i]
      kneeAux = nameAux[i]
    }
    else if (k === VmSym.Hold) {
      holdTag = nameTags[i] as VmTag
      holdNum = nameNums[i]
      holdAux = nameAux[i]
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
  const hold$ = audio.toAudioPtr(holdTag, holdNum, holdAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const levelDb$ = program.gateOutsPool.getLevelDb(index)
  const grDb$ = program.gateOutsPool.getGrDb(index)

  const gate = program.gensPool.get(Op.Gate) as Gate
  gate.in$ = in$
  gate.key$ = key$
  gate.attack$ = attack$
  gate.release$ = release$
  gate.threshold$ = threshold$
  gate.ratio$ = ratio$
  gate.knee$ = knee$
  gate.hold$ = hold$

  gate.telemetryEnabled = 1
  gate.telemetryRingBase = ringBase
  gate.telemetryLevelDb$ = levelDb$
  gate.telemetryGrDb$ = grDb$

  gate.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}
