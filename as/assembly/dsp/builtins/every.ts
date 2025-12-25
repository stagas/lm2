// dprint-ignore-file
import { Every } from '../../gen/every'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callEvery(
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
  // every(bar, prob=1, seed=1234, swing=0, offset=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let barTag: VmTag = posTags[0] as VmTag
  let barNum: f64 = posNums[0]
  let barAux: i32 = posAux[0]

  const probIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
  let probTag: VmTag = probIsSet ? (posTags[1] as VmTag) : VmTag.Num
  let probNum: f64 = probIsSet ? posNums[1] : 1.0
  let probAux: i32 = probIsSet ? posAux[1] : 0

  const seedIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
  let seedTag: VmTag = seedIsSet ? (posTags[2] as VmTag) : VmTag.Num
  let seedNum: f64 = seedIsSet ? posNums[2] : 1234.0
  let seedAux: i32 = seedIsSet ? posAux[2] : 0

  const swingIsSet = posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null
  let swingTag: VmTag = swingIsSet ? (posTags[3] as VmTag) : VmTag.Num
  let swingNum: f64 = swingIsSet ? posNums[3] : 0.0
  let swingAux: i32 = swingIsSet ? posAux[3] : 0

  const offsetIsSet = posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null
  let offsetTag: VmTag = offsetIsSet ? (posTags[4] as VmTag) : VmTag.Num
  let offsetNum: f64 = offsetIsSet ? posNums[4] : 0.0
  let offsetAux: i32 = offsetIsSet ? posAux[4] : 0

  // Named overrides (bar/prob/seed/swing/offset)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Bar) {
      barTag = nameTags[i] as VmTag
      barNum = nameNums[i]
      barAux = nameAux[i]
    }
    else if (k === VmSym.Prob) {
      probTag = nameTags[i] as VmTag
      probNum = nameNums[i]
      probAux = nameAux[i]
    }
    else if (k === VmSym.Seed) {
      seedTag = nameTags[i] as VmTag
      seedNum = nameNums[i]
      seedAux = nameAux[i]
    }
    else if (k === VmSym.Swing) {
      swingTag = nameTags[i] as VmTag
      swingNum = nameNums[i]
      swingAux = nameAux[i]
    }
    else if (k === VmSym.Offset) {
      offsetTag = nameTags[i] as VmTag
      offsetNum = nameNums[i]
      offsetAux = nameAux[i]
    }
  }

  const bar$: usize = audio.toAudioPtr(barTag, barNum, barAux, length, program)
  const prob$: usize = audio.toAudioPtr(probTag, probNum, probAux, length, program)
  const seed$: usize = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)
  const swing$: usize = audio.toAudioPtr(swingTag, swingNum, swingAux, length, program)
  const offset$: usize = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)

  const outIndex: i32 = audio.allocOut(program)
  const out$: usize = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.Every) as Every
  gen.bar$ = bar$
  gen.prob$ = prob$
  gen.seed$ = seed$
  gen.swing$ = swing$
  gen.offset$ = offset$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

