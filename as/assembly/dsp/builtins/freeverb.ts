// dprint-ignore-file
import { Freeverb } from '../../gen/freeverb'
import { FREEVERB_DATA_OFFSET, FREEVERB_ENTRY_SIZE, FREEVERB_HISTORY_SIZE, FREEVERB_WRITE_POS_OFFSET } from '../../constants'
import { globalSampleCount } from '../../globals'
import { Program } from '../../program'
import { Op } from '../../shared'
import { Dsp } from '../dsp'
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
  dsp: Dsp,
): void {
  // freeverb(in, size=0.5, damp=0.5)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  let freeverbIndex: i32 = 0

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let roomSizeTag: VmTag = VmTag.Num
  let roomSizeNum: f64 = 0.5
  let roomSizeAux: i32 = 0

  let dampTag: VmTag = VmTag.Num
  let dampNum: f64 = 0.5
  let dampAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    roomSizeTag = posTags[1] as VmTag
    roomSizeNum = posNums[1]
    roomSizeAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    dampTag = posTags[2] as VmTag
    dampNum = posNums[2]
    dampAux = posAux[2]
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
      roomSizeTag = nameTags[i] as VmTag
      roomSizeNum = nameNums[i]
      roomSizeAux = nameAux[i]
    }
    else if (k === VmSym.Damp) {
      dampTag = nameTags[i] as VmTag
      dampNum = nameNums[i]
      dampAux = nameAux[i]
    }
  }

  let inL$: usize = 0
  let inR$: usize = 0

  if (inTag === VmTag.Arr) {
    const arrId: i32 = inAux
    if (arrId < 0 || arrId >= dsp.arrays.count) {
      inL$ = audio.toAudioPtr(VmTag.Num, 0.0, 0, length, program)
      inR$ = inL$
    }
    else {
      const arrLen: i32 = dsp.arrays.len[arrId]
      const start: i32 = dsp.arrays.start[arrId]

      if (arrLen >= 2) {
        const lTag = dsp.arrays.elemTag[start] as VmTag
        const lNum = dsp.arrays.elemNum[start]
        const lAux = dsp.arrays.elemAux[start]
        inL$ = audio.toAudioPtr(lTag, lNum, lAux, length, program)

        const rTag = dsp.arrays.elemTag[start + 1] as VmTag
        const rNum = dsp.arrays.elemNum[start + 1]
        const rAux = dsp.arrays.elemAux[start + 1]
        inR$ = audio.toAudioPtr(rTag, rNum, rAux, length, program)
      }
      else if (arrLen >= 1) {
        const mTag = dsp.arrays.elemTag[start] as VmTag
        const mNum = dsp.arrays.elemNum[start]
        const mAux = dsp.arrays.elemAux[start]
        inL$ = audio.toAudioPtr(mTag, mNum, mAux, length, program)
        inR$ = inL$
      }
      else {
        inL$ = audio.toAudioPtr(VmTag.Num, 0.0, 0, length, program)
        inR$ = inL$
      }
    }
  }
  else {
    inL$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
    inR$ = inL$
  }

  const roomSize$ = audio.toAudioPtr(roomSizeTag, roomSizeNum, roomSizeAux, length, program)
  const damp$ = audio.toAudioPtr(dampTag, dampNum, dampAux, length, program)

  const outLIndex = audio.allocOut(program)
  const outRIndex = audio.allocOut(program)
  const outL$ = program.getOutBuffer(outLIndex)
  const outR$ = program.getOutBuffer(outRIndex)

  const gen = program.gensPool.get(Op.Freeverb) as Freeverb
  gen.inL$ = inL$
  gen.inR$ = inR$
  gen.roomSize$ = roomSize$
  gen.damp$ = damp$
  gen.processStereo(outL$, outR$, length)

  // Best-effort history for UI widgets (no atomics needed).
  {
    const hist = program.freeverbHistory
    const writePos = i32(hist[FREEVERB_WRITE_POS_OFFSET])
    const slot = writePos % FREEVERB_HISTORY_SIZE
    const base = FREEVERB_DATA_OFFSET + slot * FREEVERB_ENTRY_SIZE
    hist[base] = f32(freeverbIndex)
    hist[base + 1] = load<f32>(roomSize$)
    hist[base + 2] = load<f32>(damp$)
    hist[base + 3] = f32((globalSampleCount + length) & 0xfffff)
    hist[FREEVERB_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
  }

  stack.push(VmTag.Audio, 0.0, outLIndex)
  stack.push(VmTag.Audio, 0.0, outRIndex)
  dsp.arrays.create(2, stack, 0, audio, program, length)
}


