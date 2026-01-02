// dprint-ignore-file
import { vmErrorCode } from '../../globals'
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { VmSym } from '../vm-sym'

class Downsample {
  process(
    input$: usize,
    output$: usize,
    outputSize: i32,
    factor: i32,
  ): void {
    // Simple boxcar (moving average) filter - naturally acts as low-pass
    // This preserves low frequencies perfectly (DC gain = 1.0)
    // The averaging itself provides anti-aliasing
    for (let i: i32 = 0; i < outputSize; i++) {
      let sum: f32 = 0.0
      const startIdx: i32 = i * factor
      for (let j: i32 = 0; j < factor; j++) {
        sum += load<f32>(input$ + ((startIdx + j) << 2))
      }
      store<f32>(output$ + (i << 2), sum / f32(factor))
    }
  }
}

// @ts-ignore
@inline
function numToInt(tag: VmTag, num: f64): i32 {
  if (tag === VmTag.Bool) return num != 0.0 ? 1 : 0
  if (tag === VmTag.Num) return i32(num)
  return 0
}

// @ts-ignore
@inline
function nyquistFromSampleRate(sr: f32): f32 {
  return sr * 0.5 - sr * 0.1
}

// @ts-ignore
@inline
export function callOversample(
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
  left$: usize,
  right$: usize,
  dsp: Dsp,
  cbArgTags: StaticArray<i32>,
  cbArgNums: StaticArray<f64>,
  cbArgAux: StaticArray<i32>,
  gens0: StaticArray<i32>,
  gens1: StaticArray<i32>,
): void {
  // oversample(times, cb)
  if (posCount < 2) {
    stack.push(VmTag.Undef)
    return
  }

  const timesTag = posTags[0] as VmTag
  const timesNum = posNums[0]
  let times: i32 = numToInt(timesTag, timesNum)

  let cbTag = posTags[1] as VmTag
  let cbAux = posAux[1]

  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Cb) {
      cbTag = nameTags[i] as VmTag
      cbAux = nameAux[i]
      break
    }
  }

  if (cbTag !== VmTag.Func) {
    stack.push(VmTag.Undef)
    return
  }

  if (times < 1) times = 1
  if (times > 16) times = 16

  const sr0: f32 = sampleRate
  const ny0: f32 = nyquist
  const sc0: i32 = globalSampleCount

  const savedTHas: i32 = audio.tHas
  const savedTOutIndex: i32 = audio.tOutIndex

  const outLIndex = audio.allocOut(program)
  const outRIndex = audio.allocOut(program)
  const outL$ = program.getOutBuffer(outLIndex)
  const outR$ = program.getOutBuffer(outRIndex)

  const bodyBufBase: i32 = audio.outCursor
  const srOs: f32 = sr0 * f32(times)

  program.gensPool.saveIndices(gens0)

  // Allocate temporary buffers for oversampled data
  const tempLIndex = audio.allocOut(program)
  const tempRIndex = audio.allocOut(program)
  const tempL$ = program.getOutBuffer(tempLIndex)
  const tempR$ = program.getOutBuffer(tempRIndex)

  let stereo: bool = false

  for (let c: i32 = 0; c < times; c++) {
    audio.outCursor = bodyBufBase
    stack.reset()
    audio.tHas = 0
    program.gensPool.restoreIndices(gens0)

    sampleRate = srOs
    nyquist = nyquistFromSampleRate(srOs)
    globalSampleCount = i32((sc0 as i64) * (times as i64) + (c as i64) * (length as i64))

    dsp.vmInvokeFunc(cbAux, 0, cbArgTags, cbArgNums, cbArgAux, length, left$, right$)
    if (vmErrorCode !== 0) break

    const resIdx = stack.pop()
    const resTag = stack.tag[resIdx] as VmTag

    let lTag: VmTag = resTag
    let lNum: f64 = stack.num[resIdx]
    let lAux: i32 = stack.aux[resIdx]
    let rTag: VmTag = VmTag.Undef
    let rNum: f64 = 0.0
    let rAux: i32 = 0

    if (resTag === VmTag.Arr) {
      const arrId = stack.aux[resIdx]
      if (arrId >= 0 && arrId < dsp.arrays.count) {
        const n = dsp.arrays.len[arrId]
        if (n >= 2) {
          stereo = true
          const start = dsp.arrays.start[arrId]
          lTag = dsp.arrays.elemTag[start + 0] as VmTag
          lNum = dsp.arrays.elemNum[start + 0]
          lAux = dsp.arrays.elemAux[start + 0]
          rTag = dsp.arrays.elemTag[start + 1] as VmTag
          rNum = dsp.arrays.elemNum[start + 1]
          rAux = dsp.arrays.elemAux[start + 1]
        }
      }
    }

    if (c === 0) program.gensPool.saveIndices(gens1)
    else program.gensPool.restoreIndices(gens1)

    const lSmoothed: bool = lTag === VmTag.Num && lAux < 0
    const lIsAudio: bool = lTag === VmTag.Audio || lSmoothed
    const l$ = lIsAudio ? (lTag === VmTag.Audio ? program.getOutBuffer(lAux) : audio.toAudioPtr(lTag, lNum, lAux, length, program)) : 0
    const lConst: f32 = lIsAudio ? 0.0 : (lTag === VmTag.Bool ? (lNum != 0.0 ? 1.0 : 0.0) : lTag === VmTag.Num ? (lNum as f32) : 0.0)

    const rSmoothed: bool = stereo && rTag === VmTag.Num && rAux < 0
    const rIsAudio: bool = stereo && (rTag === VmTag.Audio || rSmoothed)
    const r$ = rIsAudio ? (rTag === VmTag.Audio ? program.getOutBuffer(rAux) : audio.toAudioPtr(rTag, rNum, rAux, length, program)) : 0
    const rConst: f32 = stereo ? (rIsAudio ? 0.0 : (rTag === VmTag.Bool ? (rNum != 0.0 ? 1.0 : 0.0) : rTag === VmTag.Num ? (rNum as f32) : 0.0)) : 0.0

    // Store this callback's output in the temp buffer
    const offset = c * length
    for (let i: i32 = 0; i < length; i++) {
      const xL: f32 = lIsAudio ? load<f32>(l$ + (i << 2)) : lConst
      store<f32>(tempL$ + ((offset + i) << 2), xL)

      if (stereo) {
        const xR: f32 = rIsAudio ? load<f32>(r$ + (i << 2)) : rConst
        store<f32>(tempR$ + ((offset + i) << 2), xR)
      }
    }
  }

  // Now downsample the collected oversampled data
  const downsample = new Downsample()
  downsample.process(tempL$, outL$, length, times)
  if (stereo) {
    downsample.process(tempR$, outR$, length, times)
  }

  sampleRate = sr0
  nyquist = ny0
  globalSampleCount = sc0
  audio.tHas = savedTHas
  audio.tOutIndex = savedTOutIndex

  if (vmErrorCode !== 0) return

  if (!stereo) {
    stack.push(VmTag.Audio, 0.0, outLIndex)
    return
  }

  stack.push(VmTag.Audio, 0.0, outLIndex)
  stack.push(VmTag.Audio, 0.0, outRIndex)
  dsp.arrays.create(2, stack, 0, audio, program, length)
}


