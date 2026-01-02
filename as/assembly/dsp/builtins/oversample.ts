// dprint-ignore-file
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { VM_FUNC_HEADER, VmOp, VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { VmSym } from '../vm-sym'

// @ts-ignore
@inline
function downsample(
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

// Upsample a base-rate block buffer into an oversampled tick buffer.
// Uses linear interpolation for better continuity when the source came from the outer scope.
// @ts-ignore
@inline
function upsampleTickLinear(
  src$: usize,
  dst$: usize,
  length: i32,
  factor: i32,
  tick: i32,
): void {
  const inv: f32 = 1.0 / f32(factor)
  const baseOs: i32 = tick * length
  const last: i32 = length - 1
  for (let i: i32 = 0; i < length; i++) {
    const os: i32 = baseOs + i
    const b: i32 = os / factor
    const frac: f32 = f32(os - b * factor) * inv
    const b1: i32 = b < last ? (b + 1) : last
    const x0: f32 = load<f32>(src$ + (b << 2))
    const x1: f32 = load<f32>(src$ + (b1 << 2))
    store<f32>(dst$ + (i << 2), x0 + (x1 - x0) * frac)
  }
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
  capSyms: StaticArray<i32>,
  capEnvIdx: StaticArray<i32>,
  capTag0: StaticArray<i32>,
  capNum0: StaticArray<f64>,
  capAux0: StaticArray<i32>,
  savedSmoothedKeys: StaticArray<i32>,
  savedSmoothedOutIndex: StaticArray<i32>,
  tempL$: usize,
  tempR$: usize,
  tempCap: i32,
): void {
  // oversample(times, cb)
  const baseSp: i32 = stack.sp
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

  // Fast path: if times=1, just run the callback without oversampling
  if (times === 1) {
    program.pushHistoryWriteEnabled(program.historyWriteEnabled !== 0 ? 1 : 0)
    dsp.vmInvokeFunc(cbAux, 0, cbArgTags, cbArgNums, cbArgAux, length, left$, right$)
    program.popHistoryWriteEnabled()
    return
  }

  const sr0: f32 = sampleRate
  const bsr0: f32 = baseSampleRate
  const ny0: f32 = nyquist
  const sc0: i32 = globalSampleCount

  const savedTHas: i32 = audio.tHas
  const savedTOutIndex: i32 = audio.tOutIndex

  // Detect which outer-scope symbols the callback loads (captures).
  // If any of those are audio buffers, we need to "lift" them to the oversampled timeline
  // (otherwise the callback replays the same base-rate block each tick).
  const capMax: i32 = capSyms.length
  let capCount: i32 = 0

  const ops = program.data.ops
  if (cbAux >= 0 && cbAux < ops.length && ops[cbAux] === VM_FUNC_HEADER) {
    const paramCount: i32 = ops[cbAux + 1]
    let pc: i32 = cbAux + 2 + paramCount
    while (pc >= 0 && pc < ops.length) {
      const op = ops[pc++] as VmOp
      if (op === VmOp.Load) {
        const sym: i32 = ops[pc++]
        let seen: bool = false
        for (let i: i32 = 0; i < capCount; i++) {
          if (capSyms[i] === sym) {
            seen = true
            break
          }
        }
        if (!seen && capCount < capMax) {
          const envIdx: i32 = dsp.vmEnvFind(sym)
          if (envIdx >= 0) {
            capSyms[capCount] = sym
            capEnvIdx[capCount] = envIdx
            capTag0[capCount] = dsp.vmEnvTagAt(envIdx) as i32
            capNum0[capCount] = dsp.vmEnvNumAt(envIdx)
            capAux0[capCount] = dsp.vmEnvAuxAt(envIdx)
            capCount++
          }
        }
        continue
      }
      if (op === VmOp.Store) {
        pc++
        continue
      }
      if (op === VmOp.PushNum || op === VmOp.PushNumSmoothed || op === VmOp.PushBool || op === VmOp.PushSym) {
        pc++
        continue
      }
      if (op === VmOp.Unary || op === VmOp.Binary) {
        pc++
        continue
      }
      if (op === VmOp.Call) {
        pc += 2
        continue
      }
      if (op === VmOp.Jump || op === VmOp.JumpIfFalse || op === VmOp.Func || op === VmOp.Array) {
        pc++
        continue
      }
      if (op === VmOp.Return || op === VmOp.Throw || op === VmOp.End) break
      // Other ops have no immediates.
    }
  }

  // Oversampling changes sampleRate/globalSampleCount within the callback. If the callback pulls
  // smoothed (aux<0) values from the surrounding scope, VmAudio caches those as out-buffers per
  // block. We temporarily clear that cache so scoped smoothed values are re-materialized at the
  // oversampled rate, then restore the outer cache afterwards.
  let savedSmoothedCount: i32 = audio.smoothedCount
  if (savedSmoothedCount > savedSmoothedKeys.length) savedSmoothedCount = savedSmoothedKeys.length
  for (let i: i32 = 0; i < savedSmoothedCount; i++) {
    const k: i32 = audio.smoothedKeys[i]
    savedSmoothedKeys[i] = k
    savedSmoothedOutIndex[i] = audio.smoothedOutIndex[k]
    audio.smoothedHas[k] = 0
  }
  audio.smoothedCount = 0

  const outLIndex = audio.allocOut(program)
  const outRIndex = audio.allocOut(program)
  const outL$ = program.getOutBuffer(outLIndex)
  const outR$ = program.getOutBuffer(outRIndex)

  const bodyBufBase: i32 = audio.outCursor
  const srOs: f32 = sr0 * f32(times)

  program.gensPool.saveIndices(gens0)

  const tempSize: i32 = length * times
  if (tempSize > tempCap) {
    stack.push(VmTag.Undef)
    return
  }

  let stereo: bool = false

  for (let c: i32 = 0; c < times; c++) {
    // Clear smoothed buffers created during the previous oversample tick so values are
    // re-materialized with the updated (oversampled) timebase.
    const nSmoothed: i32 = audio.smoothedCount
    for (let i: i32 = 0; i < nSmoothed; i++) {
      const k: i32 = audio.smoothedKeys[i]
      audio.smoothedHas[k] = 0
    }
    audio.smoothedCount = 0

    audio.outCursor = bodyBufBase
    stack.sp = baseSp
    audio.tHas = 0
    program.gensPool.restoreIndices(gens0)

    sampleRate = srOs
    nyquist = nyquistFromSampleRate(srOs)
    globalSampleCount = i32((sc0 as i64) * (times as i64) + (c as i64) * (length as i64))

    // Lift captured outer-scope audio buffers to the oversampled tick timeline.
    for (let i: i32 = 0; i < capCount; i++) {
      const tag0: VmTag = capTag0[i] as VmTag
      if (tag0 !== VmTag.Audio) continue
      const srcIndex: i32 = capAux0[i]
      const src$ = program.getOutBuffer(srcIndex)
      const outIndex: i32 = audio.allocOut(program)
      const out$ = program.getOutBuffer(outIndex)
      upsampleTickLinear(src$, out$, length, times, c)
      dsp.vmEnvSetAt(capEnvIdx[i], VmTag.Audio, 0.0, outIndex)
    }

    const allowHistory: i32 = c === 0 ? 1 : 0
    program.pushHistoryWriteEnabled(program.historyWriteEnabled !== 0 && allowHistory !== 0 ? 1 : 0)
    dsp.vmInvokeFunc(cbAux, 0, cbArgTags, cbArgNums, cbArgAux, length, left$, right$)
    program.popHistoryWriteEnabled()

    // Restore captured env bindings (even if the callback errored).
    for (let i: i32 = 0; i < capCount; i++) {
      dsp.vmEnvSetAt(capEnvIdx[i], capTag0[i] as VmTag, capNum0[i], capAux0[i])
    }

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
    const offset: i32 = c * length
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
  downsample(tempL$, outL$, length, times)
  if (stereo) {
    downsample(tempR$, outR$, length, times)
  }

  // Clear smoothed buffers created during the final oversample tick.
  const nSmoothedFinal: i32 = audio.smoothedCount
  for (let i: i32 = 0; i < nSmoothedFinal; i++) {
    const k: i32 = audio.smoothedKeys[i]
    audio.smoothedHas[k] = 0
  }

  // Restore caller smoothed cache.
  const restoreCount: i32 = savedSmoothedCount < audio.smoothedKeys.length ? savedSmoothedCount : audio.smoothedKeys.length
  for (let i: i32 = 0; i < restoreCount; i++) {
    const k: i32 = savedSmoothedKeys[i]
    audio.smoothedKeys[i] = k
    audio.smoothedOutIndex[k] = savedSmoothedOutIndex[i]
    audio.smoothedHas[k] = 1
  }
  audio.smoothedCount = restoreCount

  sampleRate = sr0
  baseSampleRate = bsr0
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


