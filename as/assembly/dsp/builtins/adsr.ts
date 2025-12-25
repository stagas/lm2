// dprint-ignore-file
import { Adsr } from '../../gen/adsr'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore

export function callAdsr(
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
  // Positional fallback: (attack, decay, sustain, release, trig)
  let attackTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
  let attackNum = posCount >= 1 ? posNums[0] : 0.0
  let attackAux = posCount >= 1 ? posAux[0] : 0
  let decayTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let decayNum = posCount >= 2 ? posNums[1] : 0.0
  let decayAux = posCount >= 2 ? posAux[1] : 0
  let sustainTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let sustainNum = posCount >= 3 ? posNums[2] : 0.0
  let sustainAux = posCount >= 3 ? posAux[2] : 0
  let releaseTag = posCount >= 4 ? (posTags[3] as VmTag) : VmTag.Num
  let releaseNum = posCount >= 4 ? posNums[3] : 0.0
  let releaseAux = posCount >= 4 ? posAux[3] : 0
  let trigTag = posCount >= 5 ? (posTags[4] as VmTag) : VmTag.Num
  let trigNum = posCount >= 5 ? posNums[4] : 0.0
  let trigAux = posCount >= 5 ? posAux[4] : 0

  // Named overrides (attack/decay/sustain/release/trig)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Attack) {
      attackTag = nameTags[i] as VmTag
      attackNum = nameNums[i]
      attackAux = nameAux[i]
    }
    else if (k === VmSym.Decay) {
      decayTag = nameTags[i] as VmTag
      decayNum = nameNums[i]
      decayAux = nameAux[i]
    }
    else if (k === VmSym.Sustain) {
      sustainTag = nameTags[i] as VmTag
      sustainNum = nameNums[i]
      sustainAux = nameAux[i]
    }
    else if (k === VmSym.Release) {
      releaseTag = nameTags[i] as VmTag
      releaseNum = nameNums[i]
      releaseAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const attack$ = audio.toAudioPtr(attackTag, attackNum, attackAux, length, program)
  const decay$ = audio.toAudioPtr(decayTag, decayNum, decayAux, length, program)
  const sustain$ = audio.toAudioPtr(sustainTag, sustainNum, sustainAux, length, program)
  const release$ = audio.toAudioPtr(releaseTag, releaseNum, releaseAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const adsr = program.gensPool.get(Op.Adsr) as Adsr
  adsr.attack$ = attack$
  adsr.decay$ = decay$
  adsr.sustain$ = sustain$
  adsr.release$ = release$
  adsr.trig$ = trig$
  adsr.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

