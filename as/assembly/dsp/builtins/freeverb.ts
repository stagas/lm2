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
  // freeverb(in, roomsize=0.5, damp=0.5, wet=0.33, dry=0.7, width=1, freeze=0)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let freeverbIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let roomsizeTag: VmTag = VmTag.Num
  let roomsizeNum: f64 = 0.5
  let roomsizeAux: i32 = 0

  let dampTag: VmTag = VmTag.Num
  let dampNum: f64 = 0.5
  let dampAux: i32 = 0

  let wetTag: VmTag = VmTag.Num
  let wetNum: f64 = 0.33
  let wetAux: i32 = 0

  let dryTag: VmTag = VmTag.Num
  let dryNum: f64 = 0.7
  let dryAux: i32 = 0

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
    roomsizeTag = posTags[1] as VmTag
    roomsizeNum = posNums[1]
    roomsizeAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    dampTag = posTags[2] as VmTag
    dampNum = posNums[2]
    dampAux = posAux[2]
  }

  if (posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null) {
    wetTag = posTags[3] as VmTag
    wetNum = posNums[3]
    wetAux = posAux[3]
  }

  if (posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null) {
    dryTag = posTags[4] as VmTag
    dryNum = posNums[4]
    dryAux = posAux[4]
  }

  if (posCount >= 6 && posTags[5] !== VmTag.Undef && posTags[5] !== VmTag.Null) {
    widthTag = posTags[5] as VmTag
    widthNum = posNums[5]
    widthAux = posAux[5]
  }

  if (posCount >= 7 && posTags[6] !== VmTag.Undef && posTags[6] !== VmTag.Null) {
    freezeTag = posTags[6] as VmTag
    freezeNum = posNums[6]
    freezeAux = posAux[6]
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
    else if (k === VmSym.Roomsize) {
      roomsizeTag = nameTags[i] as VmTag
      roomsizeNum = nameNums[i]
      roomsizeAux = nameAux[i]
    }
    else if (k === VmSym.Damp) {
      dampTag = nameTags[i] as VmTag
      dampNum = nameNums[i]
      dampAux = nameAux[i]
    }
    else if (k === VmSym.Wet) {
      wetTag = nameTags[i] as VmTag
      wetNum = nameNums[i]
      wetAux = nameAux[i]
    }
    else if (k === VmSym.Dry) {
      dryTag = nameTags[i] as VmTag
      dryNum = nameNums[i]
      dryAux = nameAux[i]
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
  const roomsize$ = audio.toAudioPtr(roomsizeTag, roomsizeNum, roomsizeAux, length, program)
  const damp$ = audio.toAudioPtr(dampTag, dampNum, dampAux, length, program)
  const wet$ = audio.toAudioPtr(wetTag, wetNum, wetAux, length, program)
  const dry$ = audio.toAudioPtr(dryTag, dryNum, dryAux, length, program)
  const width$ = audio.toAudioPtr(widthTag, widthNum, widthAux, length, program)
  const freeze$ = audio.toAudioPtr(freezeTag, freezeNum, freezeAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.Freeverb) as Freeverb
  gen.in$ = in$
  gen.roomsize$ = roomsize$
  gen.damp$ = damp$
  gen.wet$ = wet$
  gen.dry$ = dry$
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
    hist[base + 1] = load<f32>(roomsize$)
    hist[base + 2] = load<f32>(damp$)
    hist[base + 3] = load<f32>(wet$)
    hist[base + 4] = load<f32>(dry$)
    hist[base + 5] = load<f32>(width$)
    hist[base + 6] = f32((globalSampleCount + length) & 0xfffff)
    hist[FREEVERB_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outIndex)
}


