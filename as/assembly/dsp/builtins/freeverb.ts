// dprint-ignore-file
import { Freeverb } from '../../gen/freeverb'
import { FREEVERB_DATA_OFFSET, FREEVERB_ENTRY_SIZE, FREEVERB_HISTORY_SIZE, FREEVERB_WRITE_POS_OFFSET } from '../../constants'
import { globalSampleCount } from '../../globals'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
function clampIndex(v: i32): i32 {
  return v < 0 ? 0 : v > 63 ? 63 : v
}

// @ts-ignore
@inline
export function callFreeverb(
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
  // freeverb(in, size=0.5, damp=0.5, width=1, freeze=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let freeverbIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let sizeTag: VmTag = VmTag.Num
  let sizeNum: f64 = 0.5
  let sizeAux: i32 = 0

  let dampTag: VmTag = VmTag.Num
  let dampNum: f64 = 0.5
  let dampAux: i32 = 0

  let widthTag: VmTag = VmTag.Num
  let widthNum: f64 = 1.0
  let widthAux: i32 = 0

  let freezeTag: VmTag = VmTag.Num
  let freezeNum: f64 = 0.0
  let freezeAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    sizeTag = posTags[1] as VmTag
    sizeNum = posNums[1]
    sizeAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    dampTag = posTags[2] as VmTag
    dampNum = posNums[2]
    dampAux = posAux[2]
  }

  if (posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null) {
    widthTag = posTags[3] as VmTag
    widthNum = posNums[3]
    widthAux = posAux[3]
  }

  if (posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null) {
    freezeTag = posTags[4] as VmTag
    freezeNum = posNums[4]
    freezeAux = posAux[4]
  }

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Index) {
      freeverbIndex = clampIndex(i32(Math.floor(nameNums[i])))
    }
    else if (k === VmSym.In) {
      inTag = nameTags[i] as VmTag
      inNum = nameNums[i]
      inAux = nameAux[i]
    }
    else if (k === VmSym.Size) {
      sizeTag = nameTags[i] as VmTag
      sizeNum = nameNums[i]
      sizeAux = nameAux[i]
    }
    else if (k === VmSym.Damp) {
      dampTag = nameTags[i] as VmTag
      dampNum = nameNums[i]
      dampAux = nameAux[i]
    }
    else if (k === VmSym.Width) {
      widthTag = nameTags[i] as VmTag
      widthNum = nameNums[i]
      widthAux = nameAux[i]
    }
    else if (k === VmSym.Freeze) {
      freezeTag = nameTags[i] as VmTag
      freezeNum = nameNums[i]
      freezeAux = nameAux[i]
    }
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const size$ = audio.toAudioPtr(sizeTag, sizeNum, sizeAux, length, program)
  const damp$ = audio.toAudioPtr(dampTag, dampNum, dampAux, length, program)
  const width$ = audio.toAudioPtr(widthTag, widthNum, widthAux, length, program)
  const freeze$ = audio.toAudioPtr(freezeTag, freezeNum, freezeAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.Freeverb) as Freeverb
  gen.in$ = in$
  gen.size$ = size$
  gen.damp$ = damp$
  gen.width$ = width$
  gen.freeze$ = freeze$
  gen.process(out$, length)

  // Best-effort history for UI widgets (no atomics needed).
  {
    const hist = program.freeverbHistory
    const writePos = i32(hist[FREEVERB_WRITE_POS_OFFSET])
    const slot = writePos % FREEVERB_HISTORY_SIZE
    const base = FREEVERB_DATA_OFFSET + slot * FREEVERB_ENTRY_SIZE
    hist[base] = f32(freeverbIndex)
    hist[base + 1] = load<f32>(size$)
    hist[base + 2] = load<f32>(damp$)
    hist[base + 3] = load<f32>(width$)
    hist[base + 4] = f32((globalSampleCount + length) & 0xfffff)
    hist[FREEVERB_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}


