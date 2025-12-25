// dprint-ignore-file
import { Ad } from '../../gen/ad'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callAd(
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
  // attack (required, no default)
  let attackTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
  let attackNum = posCount >= 1 ? posNums[0] : 0.0
  let attackAux = posCount >= 1 ? posAux[0] : 0

  // decay (required, no default)
  let decayTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let decayNum = posCount >= 2 ? posNums[1] : 0.0
  let decayAux = posCount >= 2 ? posAux[1] : 0

  // trig (optional, default 0)
  let trigTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let trigNum = posCount >= 3 ? posNums[2] : 0.0
  let trigAux = posCount >= 3 ? posAux[2] : 0

  // Check for named parameters
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Attack) {
      attackTag = nameTags[i] as VmTag
      attackNum = nameNums[i]
      attackAux = nameAux[i]
    }
    else if (nameSyms[i] === VmSym.Decay) {
      decayTag = nameTags[i] as VmTag
      decayNum = nameNums[i]
      decayAux = nameAux[i]
    }
    else if (nameSyms[i] === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const attack$ = audio.toAudioPtr(attackTag, attackNum, attackAux, length, program)
  const decay$ = audio.toAudioPtr(decayTag, decayNum, decayAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const ad = program.gensPool.get(Op.Ad) as Ad
  ad.attack$ = attack$
  ad.decay$ = decay$
  ad.trig$ = trig$
  ad.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}
