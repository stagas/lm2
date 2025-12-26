// dprint-ignore-file
import { At } from '../../gen/at'
import { TRIG_DATA_OFFSET, TRIG_ENTRY_SIZE, TRIG_HISTORY_SIZE, TRIG_WRITE_POS_OFFSET } from '../../constants'
import { globalSampleCount } from '../../globals'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmBuiltin, VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore

function clampIndex(v: i32): i32 {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

export function callAt(
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
  // at(bar, every=0, prob=1, seed=1234)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let trigIndex: i32 = 0

  let barTag: VmTag = posTags[0] as VmTag
  let barNum: f64 = posNums[0]
  let barAux: i32 = posAux[0]

  const everyIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
  let everyTag: VmTag = everyIsSet ? (posTags[1] as VmTag) : VmTag.Num
  let everyNum: f64 = everyIsSet ? posNums[1] : 0.0
  let everyAux: i32 = everyIsSet ? posAux[1] : 0

  const probIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
  let probTag: VmTag = probIsSet ? (posTags[2] as VmTag) : VmTag.Num
  let probNum: f64 = probIsSet ? posNums[2] : 1.0
  let probAux: i32 = probIsSet ? posAux[2] : 0

  const seedIsSet = posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null
  let seedTag: VmTag = seedIsSet ? (posTags[3] as VmTag) : VmTag.Num
  let seedNum: f64 = seedIsSet ? posNums[3] : 1234.0
  let seedAux: i32 = seedIsSet ? posAux[3] : 0

  // Named overrides (bar/every/prob/seed)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      trigIndex = clampIndex(i32(Math.floor(nameNums[i])))
    }
    else if (k === VmSym.Bar) {
      barTag = nameTags[i] as VmTag
      barNum = nameNums[i]
      barAux = nameAux[i]
    }
    else if (k === VmBuiltin.Every) {
      everyTag = nameTags[i] as VmTag
      everyNum = nameNums[i]
      everyAux = nameAux[i]
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
  }

  const bar$: usize = audio.toAudioPtr(barTag, barNum, barAux, length, program)
  const every$: usize = audio.toAudioPtr(everyTag, everyNum, everyAux, length, program)
  const prob$: usize = audio.toAudioPtr(probTag, probNum, probAux, length, program)
  const seed$: usize = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)

  const outIndex: i32 = audio.allocOut(program)
  const out$: usize = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.At) as At
  gen.bar$ = bar$
  gen.every$ = every$
  gen.prob$ = prob$
  gen.seed$ = seed$
  gen.process(out$, length)

  // Best-effort impulse history for UI widgets (no atomics needed).
  {
    const hist = program.trigHistory
    let writePos = i32(hist[TRIG_WRITE_POS_OFFSET])
    for (let i: i32 = 0; i < length; i++) {
      const v: f32 = load<f32>(out$ + (i << 2))
      if (v > 0.0) {
        const slot = writePos % TRIG_HISTORY_SIZE
        const base = TRIG_DATA_OFFSET + slot * TRIG_ENTRY_SIZE
        hist[base] = f32(trigIndex)
        hist[base + 1] = v
        hist[base + 2] = f32((globalSampleCount + i) & 0xfffff)
        writePos = (writePos + 1) & 0xfffff
      }
    }
    hist[TRIG_WRITE_POS_OFFSET] = f32(writePos)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}

