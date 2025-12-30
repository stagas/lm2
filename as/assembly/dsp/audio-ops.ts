// dprint-ignore-file

// @ts-ignore
// @inline
export function clearAudio(out$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    store<f32>(out$, 0)
    out$ += 4
  }
}

// @ts-ignore
// @inline
export function addAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 + s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function subAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 - s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function mulAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 * s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function divAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 / s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function modAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 % s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function powAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = Mathf.pow(s1, s2)
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function eqAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 == s2 ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function ltAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 < s2 ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function lteAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 <= s2 ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function gtAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 > s2 ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function gteAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 >= s2 ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function logicOrAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 != (0.0 as f32) ? s1 : s2)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function logicAndAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 != (0.0 as f32) ? s2 : s1)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function bitOrAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(a1$))
    const b = i32(load<f32>(a2$))
    store<f32>(out$, f32(a | b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function bitXorAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(a1$))
    const b = i32(load<f32>(a2$))
    store<f32>(out$, f32(a ^ b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function bitAndAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(a1$))
    const b = i32(load<f32>(a2$))
    store<f32>(out$, f32(a & b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function shlAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(a1$))
    const b = i32(load<f32>(a2$)) & 31
    store<f32>(out$, f32(a << b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function shrAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(a1$))
    const b = i32(load<f32>(a2$)) & 31
    store<f32>(out$, f32(a >> b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function ushrAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = <u32> i32(load<f32>(a1$))
    const b = (<u32> i32(load<f32>(a2$))) & 31
    store<f32>(out$, f32(a >>> b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

// @ts-ignore
// @inline
export function notAudio(out$: usize, in$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s = load<f32>(in$)
    store<f32>(out$, s == (0.0 as f32) ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    in$ += 4
  }
}

// @ts-ignore
// @inline
export function bitNotAudio(out$: usize, in$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(in$))
    store<f32>(out$, f32(~a))
    out$ += 4
    in$ += 4
  }
}

// @ts-ignore
// @inline
export function selectAudio(out$: usize, cond$: usize, then$: usize, else$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const c = load<f32>(cond$)
    const t = load<f32>(then$)
    const e = load<f32>(else$)
    store<f32>(out$, c != (0.0 as f32) ? t : e)
    out$ += 4
    cond$ += 4
    then$ += 4
    else$ += 4
  }
}

// @ts-ignore
// @inline
export function copyAudio(out$: usize, in$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    store<f32>(out$, load<f32>(in$))
    out$ += 4
    in$ += 4
  }
}

// @ts-ignore
// @inline
export function fillAudio(out$: usize, value: f32, length: i32): void {
  for (let i = 0; i < length; i++) {
    store<f32>(out$, value)
    out$ += 4
  }
}
