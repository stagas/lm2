import {
  addAudio,
  bitAndAudio,
  bitOrAudio,
  bitXorAudio,
  clearAudio,
  divAudio,
  eqAudio,
  gtAudio,
  gteAudio,
  ltAudio,
  lteAudio,
  modAudio,
  mulAudio,
  powAudio,
  shlAudio,
  shrAudio,
  subAudio,
  ushrAudio,
} from './audio-ops'
import { VmBinary, VmTag } from './types'
import { VmAudio } from './vm-audio'
import { VmStack } from './vm-stack'
import { Program } from '../program'

export function vmBinaryOp(
  code: VmBinary,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32
): void {
  const b = stack.pop()
  const a = stack.pop()

  const aTag = stack.tag[a] as VmTag
  const bTag = stack.tag[b] as VmTag
  const aNum = stack.num[a]
  const bNum = stack.num[b]
  const aAux = stack.aux[a]
  const bAux = stack.aux[b]

  if (aTag !== VmTag.Audio && bTag !== VmTag.Audio) {
    const aSmoothed = aTag === VmTag.Num && aAux < 0
    const bSmoothed = bTag === VmTag.Num && bAux < 0
    const promoteToAudio = (aSmoothed || bSmoothed)
      && (
        code === VmBinary.Add || code === VmBinary.Sub || code === VmBinary.Mul || code === VmBinary.Div
        || code === VmBinary.Mod || code === VmBinary.Pow
        || code === VmBinary.BitOr || code === VmBinary.BitXor || code === VmBinary.BitAnd
        || code === VmBinary.Shl || code === VmBinary.Shr || code === VmBinary.Ushr
      )

    if (promoteToAudio) {
      const aPtr$ = audio.toAudioPtr(aTag, aNum, aAux, length, program)
      const bPtr$ = audio.toAudioPtr(bTag, bNum, bAux, length, program)
      const outIndex = audio.allocOut(program)
      const out$ = program.getOutBuffer(outIndex)

      if (code === VmBinary.Add) addAudio(out$, aPtr$, bPtr$, length)
      else if (code === VmBinary.Sub) subAudio(out$, aPtr$, bPtr$, length)
      else if (code === VmBinary.Mul) mulAudio(out$, aPtr$, bPtr$, length)
      else if (code === VmBinary.Div) divAudio(out$, aPtr$, bPtr$, length)
      else if (code === VmBinary.Mod) modAudio(out$, aPtr$, bPtr$, length)
      else if (code === VmBinary.Pow) powAudio(out$, aPtr$, bPtr$, length)
      else if (code === VmBinary.BitOr) bitOrAudio(out$, aPtr$, bPtr$, length)
      else if (code === VmBinary.BitXor) bitXorAudio(out$, aPtr$, bPtr$, length)
      else if (code === VmBinary.BitAnd) bitAndAudio(out$, aPtr$, bPtr$, length)
      else if (code === VmBinary.Shl) shlAudio(out$, aPtr$, bPtr$, length)
      else if (code === VmBinary.Shr) shrAudio(out$, aPtr$, bPtr$, length)
      else if (code === VmBinary.Ushr) ushrAudio(out$, aPtr$, bPtr$, length)
      else clearAudio(out$, length)

      stack.push(VmTag.Audio, 0.0, outIndex)
      return
    }

    if (code === VmBinary.Add && aTag === VmTag.Num && bTag === VmTag.Num) {
      stack.push(VmTag.Num, aNum + bNum)
      return
    }
    if (code === VmBinary.Sub && aTag === VmTag.Num && bTag === VmTag.Num) {
      stack.push(VmTag.Num, aNum - bNum)
      return
    }
    if (code === VmBinary.Mul && aTag === VmTag.Num && bTag === VmTag.Num) {
      stack.push(VmTag.Num, aNum * bNum)
      return
    }
    if (code === VmBinary.Div && aTag === VmTag.Num && bTag === VmTag.Num) {
      stack.push(VmTag.Num, aNum / bNum)
      return
    }
    if (code === VmBinary.Mod && aTag === VmTag.Num && bTag === VmTag.Num) {
      stack.push(VmTag.Num, aNum % bNum)
      return
    }
    if (code === VmBinary.Pow && aTag === VmTag.Num && bTag === VmTag.Num) {
      stack.push(VmTag.Num, Mathf.pow(aNum as f32, bNum as f32) as f64)
      return
    }

    if (
      code === VmBinary.BitOr || code === VmBinary.BitXor || code === VmBinary.BitAnd || code === VmBinary.Shl
      || code === VmBinary.Shr || code === VmBinary.Ushr
    ) {
      const ai = i32(aTag === VmTag.Bool ? (aNum != 0.0 ? 1 : 0) : aNum)
      const bi = i32(bTag === VmTag.Bool ? (bNum != 0.0 ? 1 : 0) : bNum)
      if (code === VmBinary.BitOr) stack.push(VmTag.Num, f64(ai | bi))
      else if (code === VmBinary.BitXor) stack.push(VmTag.Num, f64(ai ^ bi))
      else if (code === VmBinary.BitAnd) stack.push(VmTag.Num, f64(ai & bi))
      else if (code === VmBinary.Shl) stack.push(VmTag.Num, f64(ai << (bi & 31)))
      else if (code === VmBinary.Shr) stack.push(VmTag.Num, f64(ai >> (bi & 31)))
      else stack.push(VmTag.Num, f64((<u32> ai) >>> ((<u32> bi) & 31)))
      return
    }

    if (
      code === VmBinary.Lt || code === VmBinary.Lte || code === VmBinary.Gt || code === VmBinary.Gte
      || code === VmBinary.Eq
    ) {
      if (code === VmBinary.Eq) {
        let eq = false
        if ((aTag === VmTag.Null || aTag === VmTag.Undef) && (bTag === VmTag.Null || bTag === VmTag.Undef)) eq = true
        else if (aTag === VmTag.Num && bTag === VmTag.Num) eq = aNum === bNum
        else if (aTag === VmTag.Bool && bTag === VmTag.Bool) eq = (aNum != 0.0) === (bNum != 0.0)
        else if (aTag === VmTag.Sym && bTag === VmTag.Sym) eq = stack.aux[a] === stack.aux[b]
        else if (aTag === VmTag.Bool && bTag === VmTag.Num) eq = (aNum != 0.0) === (bNum != 0.0)
        else if (aTag === VmTag.Num && bTag === VmTag.Bool) eq = (aNum != 0.0) === (bNum != 0.0)
        stack.push(VmTag.Bool, eq ? 1.0 : 0.0)
        return
      }

      if (aTag === VmTag.Num && bTag === VmTag.Num) {
        if (code === VmBinary.Lt) stack.push(VmTag.Bool, aNum < bNum ? 1.0 : 0.0)
        else if (code === VmBinary.Lte) stack.push(VmTag.Bool, aNum <= bNum ? 1.0 : 0.0)
        else if (code === VmBinary.Gt) stack.push(VmTag.Bool, aNum > bNum ? 1.0 : 0.0)
        else stack.push(VmTag.Bool, aNum >= bNum ? 1.0 : 0.0)
        return
      }

      stack.push(VmTag.Bool, 0.0)
      return
    }

    stack.push(VmTag.Undef)
    return
  }

  const aPtr$ = audio.toAudioPtr(aTag, aNum, stack.aux[a], length, program)
  const bPtr$ = audio.toAudioPtr(bTag, bNum, stack.aux[b], length, program)
  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  if (code === VmBinary.Add) addAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Sub) subAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Mul) mulAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Div) divAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Mod) modAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Pow) powAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Eq) eqAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Lt) ltAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Lte) lteAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Gt) gtAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Gte) gteAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.BitOr) bitOrAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.BitXor) bitXorAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.BitAnd) bitAndAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Shl) shlAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Shr) shrAudio(out$, aPtr$, bPtr$, length)
  else if (code === VmBinary.Ushr) ushrAudio(out$, aPtr$, bPtr$, length)
  else clearAudio(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

