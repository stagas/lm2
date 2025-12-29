// dprint-ignore-file
import { Adsr } from '../../gen/adsr'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
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
  let attackTag: VmTag = VmTag.Num
  let attackNum: f64 = 0.0
  let attackAux: i32 = 0

  let decayTag: VmTag = VmTag.Num
  let decayNum: f64 = 0.0
  let decayAux: i32 = 0

  let sustainTag: VmTag = VmTag.Num
  let sustainNum: f64 = 0.0
  let sustainAux: i32 = 0

  let releaseTag: VmTag = VmTag.Num
  let releaseNum: f64 = 0.0
  let releaseAux: i32 = 0

  let trigTag: VmTag = VmTag.Num
  let trigNum: f64 = 0.0
  let trigAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    attackTag = posTags[0] as VmTag
    attackNum = posNums[0]
    attackAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    decayTag = posTags[1] as VmTag
    decayNum = posNums[1]
    decayAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    sustainTag = posTags[2] as VmTag
    sustainNum = posNums[2]
    sustainAux = posAux[2]
  }

  if (posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null) {
    releaseTag = posTags[3] as VmTag
    releaseNum = posNums[3]
    releaseAux = posAux[3]
  }

  if (posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null) {
    trigTag = posTags[4] as VmTag
    trigNum = posNums[4]
    trigAux = posAux[4]
  }

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

