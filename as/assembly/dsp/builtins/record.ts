// dprint-ignore-file
import { recordContentHash } from '../../lib/record-hash'
import { Program } from '../../program'
import { hostRecordCacheLoad, hostRecordCacheStore, hostSampleLen, hostSampleSet } from '../../sample-host'
import { Dsp } from '../dsp'
import { VM_FUNC_HEADER, VmOp, VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { VmSym } from '../vm-sym'

// @ts-ignore
@inline
export function callRecord(
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
): void {

  // seconds (pos0 or named seconds)
  let secondsTag: VmTag = VmTag.Num
  let secondsNum: f64 = 0.0
  let secondsAux: i32 = 0
  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    secondsTag = posTags[0] as VmTag
    secondsNum = posNums[0]
    secondsAux = posAux[0]
  }

  // callback (pos1 or named cb/callback)
  let cbTag: VmTag = VmTag.Undef
  let cbAux: i32 = 0
  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    cbTag = posTags[1] as VmTag
    cbAux = posAux[1]
  }

  // injected sample index + key
  let hasIndex: bool = false
  let sampleIndex: i32 = -1
  let hasKey: bool = false
  let keyU32: u32 = 0

  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Seconds) {
      secondsTag = nameTags[i] as VmTag
      secondsNum = nameNums[i]
      secondsAux = nameAux[i]
    }
    else if (k === VmSym.Cb) {
      cbTag = nameTags[i] as VmTag
      cbAux = nameAux[i]
    }
    else if (k === VmSym.Index) {
      const t = nameTags[i] as VmTag
      if (t === VmTag.Num) {
        sampleIndex = i32(nameNums[i])
        hasIndex = true
      }
    }
    else if (k === VmSym.Key) {
      const t = nameTags[i] as VmTag
      if (t === VmTag.Num) {
        const v = nameNums[i]
        keyU32 = u32(i64(v))
        hasKey = true
      }
    }
  }

  if (!hasIndex || sampleIndex < 0 || sampleIndex >= program.recordKey.length) {
    stack.push(VmTag.Num, f64(-1))
    return
  }

  if (cbTag !== VmTag.Func) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }
  if (!hasKey) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }

  // Resolve seconds to a scalar
  let sec: f32 = 0.0
  if (secondsTag === VmTag.Num) {
    sec = f32(secondsNum)
  }
  else if (secondsTag === VmTag.Audio) {
    const in$ = audio.toAudioPtr(secondsTag, secondsNum, secondsAux, length, program)
    sec = load<f32>(in$)
  }
  else if (secondsTag === VmTag.Bool) {
    sec = secondsNum !== 0.0 ? 1.0 : 0.0
  }

  if (sec < 0.0) sec = 0.0
  if (sec > 1.0) sec = 1.0

  const framesF: f64 = (sec as f64) * (sampleRate as f64)
  let frames: i32 = i32(framesF)
  if (frames < 0) frames = 0
  if (frames > i32(sampleRate)) frames = i32(sampleRate)

  const existingLen: i32 = hostSampleLen(sampleIndex)
  let storedKey: u32 = program.recordKey[sampleIndex]
  let storedSec: f32 = program.recordSeconds[sampleIndex]
  let storedLen: i32 = program.recordLen[sampleIndex]

  let buf$: usize = program.recordBuf$[sampleIndex]
  let pos: i32 = program.recordPos[sampleIndex]
  let curLen: i32 = storedLen
  const recording: bool = buf$ !== 0 || pos > 0

  // Compute dependency hash: scan callback bytecode for Load operations and hash captured variables
  // Do this early so we can check if dependencies changed
  // We need to recursively scan nested function bodies (e.g. callbacks inside oversample)
  let depsHash: u32 = 0x811c9dc5 // FNV-1a offset basis
  const ops = program.data.ops
  const seenSyms = program.recordSeenSyms
  let seenSymsCount: i32 = 0
  const storedSyms = program.recordStoredSyms
  let storedSymsCount: i32 = 0
  const seenFuncs = program.recordSeenFuncs
  let seenFuncsCount: i32 = 0
  const funcStack = program.recordFuncStack
  let funcStackTop: i32 = 0

  // Start with the main callback
  if (cbAux >= 0 && cbAux < ops.length && ops[cbAux] === VM_FUNC_HEADER) {
    funcStack[funcStackTop++] = cbAux
  }

  while (funcStackTop > 0) {
    const funcPc: i32 = funcStack[--funcStackTop]

    // Mark this function as seen
    let funcSeen: bool = false
    for (let i = 0; i < seenFuncsCount; i++) {
      if (seenFuncs[i] === funcPc) {
        funcSeen = true
        break
      }
    }
    if (funcSeen) continue
    if (seenFuncsCount < seenFuncs.length) {
      seenFuncs[seenFuncsCount++] = funcPc
    }

    if (funcPc < 0 || funcPc >= ops.length || ops[funcPc] !== VM_FUNC_HEADER) continue

    // Hash this function's bytecode
    const paramCount: i32 = ops[funcPc + 1]
    depsHash = depsHash ^ u32(paramCount)
    depsHash = depsHash * 16777619
    for (let p = 0; p < paramCount; p++) {
      if (funcPc + 2 + p < ops.length) {
        depsHash = depsHash ^ u32(ops[funcPc + 2 + p])
        depsHash = depsHash * 16777619
      }
    }

    let pc: i32 = funcPc + 2 + paramCount

    while (pc >= 0 && pc < ops.length) {
      const op = ops[pc++] as VmOp
      if (op === VmOp.Load) {
        // Hash the Load opcode
        depsHash = depsHash ^ u32(op)
        depsHash = depsHash * 16777619
        const sym: i32 = ops[pc++]
        // Hash the symbol
        depsHash = depsHash ^ u32(sym)
        depsHash = depsHash * 16777619

        // Check if this symbol has been stored locally (if so, it's not a dependency)
        let symStored: bool = false
        for (let i = 0; i < storedSymsCount; i++) {
          if (storedSyms[i] === sym) {
            symStored = true
            break
          }
        }

        let symSeen: bool = false
        for (let i = 0; i < seenSymsCount; i++) {
          if (seenSyms[i] === sym) {
            symSeen = true
            break
          }
        }
        if (!symSeen) {
          if (seenSymsCount < seenSyms.length) {
            seenSyms[seenSymsCount++] = sym
          }
          // Only hash as dependency if symbol exists in environment and hasn't been stored locally
          const envIdx: i32 = dsp.vmEnvFind(sym)
          if (envIdx >= 0 && !symStored) {
            const tag: VmTag = dsp.vmEnvTagAt(envIdx)
            const num: f64 = dsp.vmEnvNumAt(envIdx)
            const aux: i32 = dsp.vmEnvAuxAt(envIdx)
            // Hash: combine symbol, tag, and value using FNV-1a
            depsHash = depsHash ^ u32(sym)
            depsHash = depsHash * 16777619
            depsHash = depsHash ^ u32(tag)
            depsHash = depsHash * 16777619
            if (tag === VmTag.Num || tag === VmTag.Bool) {
              // Hash float bits directly to detect any change in value
              const numBits = reinterpret<u64>(num)
              depsHash = depsHash ^ u32(numBits)
              depsHash = depsHash * 16777619
              depsHash = depsHash ^ u32(numBits >> 32)
              depsHash = depsHash * 16777619
            }
            else if (tag === VmTag.Audio) {
              depsHash = depsHash ^ u32(aux)
              depsHash = depsHash * 16777619
            }
            else if (tag === VmTag.Func) {
              // Treat function references as dependencies by scanning their bodies,
              // but do NOT hash the function PC (PC changes across recompiles).
              const funcPc: i32 = aux
              if (funcPc >= 0 && funcPc < ops.length && ops[funcPc] === VM_FUNC_HEADER) {
                if (funcStackTop < funcStack.length) {
                  funcStack[funcStackTop++] = funcPc
                }
              }
            }
          }
          else if (envIdx < 0) {
            // Symbol not found in environment - hash it to detect when it appears
            depsHash = depsHash ^ u32(sym)
            depsHash = depsHash * 16777619
            depsHash = depsHash ^ 0xffffffff
            depsHash = depsHash * 16777619
          }
        }
        continue
      }
      // Hash all opcodes we encounter
      depsHash = depsHash ^ u32(op)
      depsHash = depsHash * 16777619
      if (op === VmOp.Store) {
        const storeSym: i32 = ops[pc++]
        depsHash = depsHash ^ u32(storeSym)
        depsHash = depsHash * 16777619
        // Track that this symbol is stored locally (not a dependency)
        let symStored: bool = false
        for (let i = 0; i < storedSymsCount; i++) {
          if (storedSyms[i] === storeSym) {
            symStored = true
            break
          }
        }
        if (!symStored && storedSymsCount < storedSyms.length) {
          storedSyms[storedSymsCount++] = storeSym
        }
        continue
      }
      if (op === VmOp.PushNum || op === VmOp.PushNumSmoothed) {
        const litIdx: i32 = ops[pc++]
        depsHash = depsHash ^ u32(litIdx)
        depsHash = depsHash * 16777619
        // Hash the actual literal value
        if (litIdx >= 0 && litIdx < program.data.literals.length) {
          const litVal: f64 = program.data.literals[litIdx]
          const litBits = reinterpret<u64>(litVal)
          depsHash = depsHash ^ u32(litBits)
          depsHash = depsHash * 16777619
          depsHash = depsHash ^ u32(litBits >> 32)
          depsHash = depsHash * 16777619
        }
        continue
      }
      if (op === VmOp.PushBool) {
        const boolVal: i32 = ops[pc++]
        depsHash = depsHash ^ u32(boolVal)
        depsHash = depsHash * 16777619
        continue
      }
      if (op === VmOp.PushSym) {
        const pushSym: i32 = ops[pc++]
        depsHash = depsHash ^ u32(pushSym)
        depsHash = depsHash * 16777619
        continue
      }
      if (op === VmOp.Unary || op === VmOp.Binary) {
        const opCode: i32 = ops[pc++]
        depsHash = depsHash ^ u32(opCode)
        depsHash = depsHash * 16777619
        continue
      }
      if (op === VmOp.Call) {
        const callPos: i32 = ops[pc++]
        const callNamed: i32 = ops[pc++]
        depsHash = depsHash ^ u32(callPos)
        depsHash = depsHash * 16777619
        depsHash = depsHash ^ u32(callNamed)
        depsHash = depsHash * 16777619
        continue
      }
      if (op === VmOp.Jump || op === VmOp.JumpIfFalse) {
        // Do NOT hash jump targets (absolute PCs change across recompiles).
        pc++
        continue
      }
      if (op === VmOp.Func) {
        // This is a nested function reference - add it to the stack to scan
        // Bytecode will be hashed when the function is popped from the stack
        const nestedFuncPc: i32 = ops[pc++]
        // Do NOT hash nested function PC (PC changes across recompiles).
        if (nestedFuncPc >= 0 && nestedFuncPc < ops.length && ops[nestedFuncPc] === VM_FUNC_HEADER) {
          if (funcStackTop < funcStack.length) {
            funcStack[funcStackTop++] = nestedFuncPc
          }
        }
        continue
      }
      if (op === VmOp.Array) {
        const arrayLen: i32 = ops[pc++]
        depsHash = depsHash ^ u32(arrayLen)
        depsHash = depsHash * 16777619
        continue
      }
      if (op === VmOp.Return || op === VmOp.Throw || op === VmOp.End) {
        break
      }
    }
  }

  let storedDepsHash: u32 = program.recordDepsHash[sampleIndex]

  // Check content-hash lookup for matching recording from previous program (when indices differ)
  // This allows recordings to be preserved across swaps even when programs have different numbers of recordings
  // Check this BEFORE computing paramsChanged/depsChanged so we can match even when stored values are empty
  const currentHash = recordContentHash(keyU32, sec, depsHash)
  const lookupCount = program.recordContentHashCount
  for (let i = 0; i < lookupCount; i++) {
    if (program.recordContentHashLookup[i] === currentHash) {
      // Found matching recording from source - copy its state to current index
      program.recordKey[sampleIndex] = program.recordContentHashKey[i]
      program.recordSeconds[sampleIndex] = program.recordContentHashSeconds[i]
      program.recordLen[sampleIndex] = program.recordContentHashLen[i]
      program.recordDepsHash[sampleIndex] = program.recordContentHashDepsHash[i]
      // Update stored values
      storedKey = program.recordKey[sampleIndex]
      storedSec = program.recordSeconds[sampleIndex]
      storedLen = program.recordLen[sampleIndex]
      storedDepsHash = program.recordDepsHash[sampleIndex]
      // Also update buf$, pos, curLen from stored state
      buf$ = program.recordBuf$[sampleIndex]
      pos = program.recordPos[sampleIndex]
      curLen = storedLen
      break
    }
  }

  // Now compute paramsChanged and depsChanged with potentially updated stored values
  let paramsChanged: bool = storedKey !== keyU32 || storedLen !== frames || storedSec !== sec
  let depsChanged: bool = depsHash !== storedDepsHash
  if (depsChanged) console.log(`${depsHash} ${storedDepsHash}`)

  // Try to satisfy from the host cache when this index is missing or wrong.
  // This allows instant reuse across program swaps even when indices differ, and also overwrites
  // stale samples that happen to sit at the same index.
  if (!recording && (existingLen <= 0 || paramsChanged || depsChanged)) {
    const loadedLen: i32 = hostRecordCacheLoad(currentHash, sampleIndex)
    if (loadedLen > 0) {
      // Seed local state so subsequent blocks treat it as stable.
      program.recordKey[sampleIndex] = keyU32
      program.recordSeconds[sampleIndex] = sec
      program.recordLen[sampleIndex] = frames
      program.recordDepsHash[sampleIndex] = depsHash
      stack.push(VmTag.Num, f64(sampleIndex))
      return
    }
  }

  if (paramsChanged) {
    console.log('params changed')
    const oldBuf$ = program.recordBuf$[sampleIndex]
    if (oldBuf$ !== 0) {
      program.releaseRecordBuf(oldBuf$)
    }
    program.recordKey[sampleIndex] = keyU32
    program.recordSeconds[sampleIndex] = sec
    program.recordLen[sampleIndex] = frames
    program.recordPos[sampleIndex] = 0
    program.recordBuf$[sampleIndex] = 0
    buf$ = 0
    pos = 0
    curLen = frames
  }

  // Always update deps hash, and if it changed, invalidate the recording
  if (depsChanged) {
    console.warn('deps changed')
    const oldBuf$ = program.recordBuf$[sampleIndex]
    if (oldBuf$ !== 0) {
      program.releaseRecordBuf(oldBuf$)
    }
    program.recordDepsHash[sampleIndex] = depsHash
    // Force re-recording by clearing buffer and position
    program.recordPos[sampleIndex] = 0
    program.recordBuf$[sampleIndex] = 0
    buf$ = 0
    pos = 0
    curLen = frames
    program.recordLen[sampleIndex] = frames
  }
  else {
    // Even if deps didn't change, update the stored hash (handles initialization case)
    program.recordDepsHash[sampleIndex] = depsHash
  }

  if (frames <= 0) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }
  // If we already have a published sample, params and deps didn't change, and we're not mid-recording, keep it.
  // IMPORTANT: If depsChanged is true, we must re-record even if existingLen > 0
  if (existingLen > 0 && !paramsChanged && !depsChanged && !recording) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }

  if (buf$ === 0) {
    buf$ = program.getRecordBuf()
    program.recordBuf$[sampleIndex] = buf$
    pos = 0
    program.recordPos[sampleIndex] = 0
    curLen = frames
    program.recordLen[sampleIndex] = frames
  }

  // Serialize recordings so callback DSP state cannot interleave across different record() calls.
  const lock = program.recordLockSample
  if (lock !== -1 && lock !== sampleIndex) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }
  program.recordLockSample = sampleIndex

  // Record progressively across blocks (never blocks the audio thread).
  program.recordActive = 1

  const remaining: i32 = curLen - pos
  if (remaining <= 0) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }
  const take: i32 = remaining < length ? remaining : length

  program.pushHistoryWriteEnabled(0)
  const savedSampleCount: i32 = globalSampleCount
  const savedTHas: i32 = audio.tHas
  const savedTOutIndex: i32 = audio.tOutIndex
  const savedPool = program.gensPool

  if (paramsChanged || depsChanged || pos === 0) {
    program.recordGensPool.reset()
  }
  else {
    // Deterministic get() order per block, while keeping generator internal state for continuity.
    program.recordGensPool.resetIndices()
  }
  program.gensPool = program.recordGensPool

  audio.tHas = 0
  globalSampleCount = pos
  dsp.vmInvokeFunc(cbAux, 0, cbArgTags, cbArgNums, cbArgAux, take, left$, right$)

  globalSampleCount = savedSampleCount
  audio.tHas = savedTHas
  audio.tOutIndex = savedTOutIndex
  program.gensPool = savedPool
  program.popHistoryWriteEnabled()

  if (vmErrorCode !== 0) {
    stack.push(VmTag.Num, f64(sampleIndex))
    return
  }

  const resIdx = stack.pop()
  const rTag = stack.tag[resIdx] as VmTag

  if (rTag === VmTag.Audio) {
    const outIndex: i32 = stack.aux[resIdx]
    const src$ = program.getOutBuffer(outIndex)
    for (let i = 0; i < take; i++) {
      const v = load<f32>(src$ + (i << 2) as usize)
      store<f32>(buf$ + ((pos + i) << 2) as usize, v)
    }
  }
  else if (rTag === VmTag.Num || rTag === VmTag.Bool) {
    const v = rTag === VmTag.Bool ? (stack.num[resIdx] !== 0.0 ? 1.0 : 0.0) : stack.num[resIdx]
    const f = f32(v)
    for (let i = 0; i < take; i++) {
      store<f32>(buf$ + ((pos + i) << 2) as usize, f)
    }
  }
  else {
    for (let i = 0; i < take; i++) {
      store<f32>(buf$ + ((pos + i) << 2) as usize, 0.0)
    }
  }

  pos += take
  program.recordPos[sampleIndex] = pos

  if (pos >= curLen) {
    console.log(`record ${sampleIndex}`)
    hostSampleSet(sampleIndex, sampleRate, curLen, buf$)
    hostRecordCacheStore(currentHash, sampleIndex)
    program.releaseRecordBuf(buf$)
    program.recordBuf$[sampleIndex] = 0
    program.recordPos[sampleIndex] = 0
    program.recordLockSample = -1
  }

  stack.push(VmTag.Num, f64(sampleIndex))
}

