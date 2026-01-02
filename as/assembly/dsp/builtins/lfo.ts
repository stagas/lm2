// dprint-ignore-file
import { LfoRamp, LfoSah, LfoSaw, LfoSine, LfoSqr, LfoTri } from '../../gen/lfo'
import { LFO_DATA_OFFSET, LFO_ENTRY_SIZE, LFO_HISTORY_SIZE, LFO_WRITE_POS_OFFSET } from '../../constants'
import { globalSampleCount } from '../../globals'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
function writeHistory(program: Program, lfoIndex: i32, lfoType: i32, bar$: usize, offset$: usize, phase01: f32, out$: usize,
  length: i32): void {
  if (program.historyWriteEnabled === 0) return
  const hist = program.lfoHistory
  const writePos = i32(hist[LFO_WRITE_POS_OFFSET])
  const slot = writePos % LFO_HISTORY_SIZE
  const base = LFO_DATA_OFFSET + slot * LFO_ENTRY_SIZE

  const lastSample$: usize = out$ + ((length - 1) << 2)
  hist[base] = f32(lfoIndex)
  hist[base + 1] = f32(lfoType)
  hist[base + 2] = load<f32>(bar$)
  hist[base + 3] = load<f32>(offset$)
  hist[base + 4] = phase01
  hist[base + 5] = load<f32>(lastSample$)
  hist[base + 6] = f32((globalSampleCount + length) & 0xfffff)
  hist[LFO_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
}

// @ts-ignore
@inline
export function callLfoSine(
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
  // lfosine(bar, offset=0, trig=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let lfoIndex: i32 = 0

  const barIsSet = posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null
  let barTag: VmTag = barIsSet ? (posTags[0] as VmTag) : VmTag.Num
  let barNum: f64 = barIsSet ? posNums[0] : 1.0
  let barAux: i32 = barIsSet ? posAux[0] : 0

  const offsetIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
  let offsetTag: VmTag = offsetIsSet ? (posTags[1] as VmTag) : VmTag.Num
  let offsetNum: f64 = offsetIsSet ? posNums[1] : 0.0
  let offsetAux: i32 = offsetIsSet ? posAux[1] : 0

  const trigIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
  let trigTag: VmTag = trigIsSet ? (posTags[2] as VmTag) : VmTag.Num
  let trigNum: f64 = trigIsSet ? posNums[2] : 0.0
  let trigAux: i32 = trigIsSet ? posAux[2] : 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      lfoIndex = i32(Math.floor(nameNums[i]))
    }
    else if (k === VmSym.Bar) {
      barTag = nameTags[i] as VmTag
      barNum = nameNums[i]
      barAux = nameAux[i]
    }
    else if (k === VmSym.Offset) {
      offsetTag = nameTags[i] as VmTag
      offsetNum = nameNums[i]
      offsetAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const bar$ = audio.toAudioPtr(barTag, barNum, barAux, length, program)
  const offset$ = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoSine) as LfoSine
  gen.bar$ = bar$
  gen.offset$ = offset$
  gen.trig$ = trig$
  gen.process(out$, length)

  writeHistory(program, lfoIndex, 0, bar$, offset$, gen.phase01, out$, length)
  stack.push(VmTag.Audio, 0.0, outIndex)
}

// @ts-ignore
@inline
export function callLfoTri(
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
  // lfotri(bar, offset=0, trig=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let lfoIndex: i32 = 0

  const barIsSet = posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null
  let barTag: VmTag = barIsSet ? (posTags[0] as VmTag) : VmTag.Num
  let barNum: f64 = barIsSet ? posNums[0] : 1.0
  let barAux: i32 = barIsSet ? posAux[0] : 0

  const offsetIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
  let offsetTag: VmTag = offsetIsSet ? (posTags[1] as VmTag) : VmTag.Num
  let offsetNum: f64 = offsetIsSet ? posNums[1] : 0.0
  let offsetAux: i32 = offsetIsSet ? posAux[1] : 0

  const trigIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
  let trigTag: VmTag = trigIsSet ? (posTags[2] as VmTag) : VmTag.Num
  let trigNum: f64 = trigIsSet ? posNums[2] : 0.0
  let trigAux: i32 = trigIsSet ? posAux[2] : 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      lfoIndex = i32(Math.floor(nameNums[i]))
    }
    else if (k === VmSym.Bar) {
      barTag = nameTags[i] as VmTag
      barNum = nameNums[i]
      barAux = nameAux[i]
    }
    else if (k === VmSym.Offset) {
      offsetTag = nameTags[i] as VmTag
      offsetNum = nameNums[i]
      offsetAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const bar$ = audio.toAudioPtr(barTag, barNum, barAux, length, program)
  const offset$ = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoTri) as LfoTri
  gen.bar$ = bar$
  gen.offset$ = offset$
  gen.trig$ = trig$
  gen.process(out$, length)

  writeHistory(program, lfoIndex, 1, bar$, offset$, gen.phase01, out$, length)
  stack.push(VmTag.Audio, 0.0, outIndex)
}

// @ts-ignore
@inline
export function callLfoSaw(
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
  // lfosaw(bar, offset=0, trig=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let lfoIndex: i32 = 0

  const barIsSet = posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null
  let barTag: VmTag = barIsSet ? (posTags[0] as VmTag) : VmTag.Num
  let barNum: f64 = barIsSet ? posNums[0] : 1.0
  let barAux: i32 = barIsSet ? posAux[0] : 0

  const offsetIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
  let offsetTag: VmTag = offsetIsSet ? (posTags[1] as VmTag) : VmTag.Num
  let offsetNum: f64 = offsetIsSet ? posNums[1] : 0.0
  let offsetAux: i32 = offsetIsSet ? posAux[1] : 0

  const trigIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
  let trigTag: VmTag = trigIsSet ? (posTags[2] as VmTag) : VmTag.Num
  let trigNum: f64 = trigIsSet ? posNums[2] : 0.0
  let trigAux: i32 = trigIsSet ? posAux[2] : 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      lfoIndex = i32(Math.floor(nameNums[i]))
    }
    else if (k === VmSym.Bar) {
      barTag = nameTags[i] as VmTag
      barNum = nameNums[i]
      barAux = nameAux[i]
    }
    else if (k === VmSym.Offset) {
      offsetTag = nameTags[i] as VmTag
      offsetNum = nameNums[i]
      offsetAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const bar$ = audio.toAudioPtr(barTag, barNum, barAux, length, program)
  const offset$ = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoSaw) as LfoSaw
  gen.bar$ = bar$
  gen.offset$ = offset$
  gen.trig$ = trig$
  gen.process(out$, length)

  writeHistory(program, lfoIndex, 2, bar$, offset$, gen.phase01, out$, length)
  stack.push(VmTag.Audio, 0.0, outIndex)
}

// @ts-ignore
@inline
export function callLfoRamp(
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
  // lforamp(bar, offset=0, trig=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let lfoIndex: i32 = 0

  const barIsSet = posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null
  let barTag: VmTag = barIsSet ? (posTags[0] as VmTag) : VmTag.Num
  let barNum: f64 = barIsSet ? posNums[0] : 1.0
  let barAux: i32 = barIsSet ? posAux[0] : 0

  const offsetIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
  let offsetTag: VmTag = offsetIsSet ? (posTags[1] as VmTag) : VmTag.Num
  let offsetNum: f64 = offsetIsSet ? posNums[1] : 0.0
  let offsetAux: i32 = offsetIsSet ? posAux[1] : 0

  const trigIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
  let trigTag: VmTag = trigIsSet ? (posTags[2] as VmTag) : VmTag.Num
  let trigNum: f64 = trigIsSet ? posNums[2] : 0.0
  let trigAux: i32 = trigIsSet ? posAux[2] : 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      lfoIndex = i32(Math.floor(nameNums[i]))
    }
    else if (k === VmSym.Bar) {
      barTag = nameTags[i] as VmTag
      barNum = nameNums[i]
      barAux = nameAux[i]
    }
    else if (k === VmSym.Offset) {
      offsetTag = nameTags[i] as VmTag
      offsetNum = nameNums[i]
      offsetAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const bar$ = audio.toAudioPtr(barTag, barNum, barAux, length, program)
  const offset$ = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoRamp) as LfoRamp
  gen.bar$ = bar$
  gen.offset$ = offset$
  gen.trig$ = trig$
  gen.process(out$, length)

  writeHistory(program, lfoIndex, 3, bar$, offset$, gen.phase01, out$, length)
  stack.push(VmTag.Audio, 0.0, outIndex)
}

// @ts-ignore
@inline
export function callLfoSqr(
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
  // lfosqr(bar, offset=0, trig=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let lfoIndex: i32 = 0

  const barIsSet = posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null
  let barTag: VmTag = barIsSet ? (posTags[0] as VmTag) : VmTag.Num
  let barNum: f64 = barIsSet ? posNums[0] : 1.0
  let barAux: i32 = barIsSet ? posAux[0] : 0

  const offsetIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
  let offsetTag: VmTag = offsetIsSet ? (posTags[1] as VmTag) : VmTag.Num
  let offsetNum: f64 = offsetIsSet ? posNums[1] : 0.0
  let offsetAux: i32 = offsetIsSet ? posAux[1] : 0

  const trigIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
  let trigTag: VmTag = trigIsSet ? (posTags[2] as VmTag) : VmTag.Num
  let trigNum: f64 = trigIsSet ? posNums[2] : 0.0
  let trigAux: i32 = trigIsSet ? posAux[2] : 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      lfoIndex = i32(Math.floor(nameNums[i]))
    }
    else if (k === VmSym.Bar) {
      barTag = nameTags[i] as VmTag
      barNum = nameNums[i]
      barAux = nameAux[i]
    }
    else if (k === VmSym.Offset) {
      offsetTag = nameTags[i] as VmTag
      offsetNum = nameNums[i]
      offsetAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const bar$ = audio.toAudioPtr(barTag, barNum, barAux, length, program)
  const offset$ = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoSqr) as LfoSqr
  gen.bar$ = bar$
  gen.offset$ = offset$
  gen.trig$ = trig$
  gen.process(out$, length)

  writeHistory(program, lfoIndex, 4, bar$, offset$, gen.phase01, out$, length)
  stack.push(VmTag.Audio, 0.0, outIndex)
}

// @ts-ignore
@inline
export function callLfoSah(
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
  // lfosah(bar, seed=1234, offset=0, trig=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let lfoIndex: i32 = 0

  const barIsSet = posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null
  let barTag: VmTag = barIsSet ? (posTags[0] as VmTag) : VmTag.Num
  let barNum: f64 = barIsSet ? posNums[0] : 1.0
  let barAux: i32 = barIsSet ? posAux[0] : 0

  const seedIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
  let seedTag: VmTag = seedIsSet ? (posTags[1] as VmTag) : VmTag.Num
  let seedNum: f64 = seedIsSet ? posNums[1] : 111111
  let seedAux: i32 = seedIsSet ? posAux[1] : 0

  const offsetIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
  let offsetTag: VmTag = offsetIsSet ? (posTags[2] as VmTag) : VmTag.Num
  let offsetNum: f64 = offsetIsSet ? posNums[2] : 0.0
  let offsetAux: i32 = offsetIsSet ? posAux[2] : 0

  const trigIsSet = posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null
  let trigTag: VmTag = trigIsSet ? (posTags[3] as VmTag) : VmTag.Num
  let trigNum: f64 = trigIsSet ? posNums[3] : 0.0
  let trigAux: i32 = trigIsSet ? posAux[3] : 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      lfoIndex = i32(Math.floor(nameNums[i]))
    }
    else if (k === VmSym.Bar) {
      barTag = nameTags[i] as VmTag
      barNum = nameNums[i]
      barAux = nameAux[i]
    }
    else if (k === VmSym.Seed) {
      seedTag = nameTags[i] as VmTag
      seedNum = nameNums[i]
      seedAux = nameAux[i]
    }
    else if (k === VmSym.Offset) {
      offsetTag = nameTags[i] as VmTag
      offsetNum = nameNums[i]
      offsetAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const bar$ = audio.toAudioPtr(barTag, barNum, barAux, length, program)
  const offset$ = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const seed$ = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.LfoSah) as LfoSah
  gen.bar$ = bar$
  gen.offset$ = offset$
  gen.trig$ = trig$
  gen.seed$ = seed$
  gen.process(out$, length)

  writeHistory(program, lfoIndex, 5, bar$, offset$, gen.phase01, out$, length)
  stack.push(VmTag.Audio, 0.0, outIndex)
}


