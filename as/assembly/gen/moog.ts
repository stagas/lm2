import { Gen } from './gen'

export class Moog extends Gen {
  in$: usize = 0
  cut$: usize = 0
  q$: usize = 0

  m_azt1: f32 = 0
  m_azt2: f32 = 0
  m_azt3: f32 = 0
  m_azt4: f32 = 0
  m_az5: f32 = 0
  m_amf: f32 = 0

  v2: f32 = 0
  x1: f32 = 0
  az3: f32 = 0
  az4: f32 = 0
  amf: f32 = 0

  kVt: f32 = 1.2

  m_kacr: f32 = 0
  m_k2vg: f32 = 0
  m_postGain: f32 = 0

  lastFreq: f32 = -1
  lastQ: f32 = -1

  reset(): void {
    this.m_azt1 = 0
    this.m_azt2 = 0
    this.m_azt3 = 0
    this.m_azt4 = 0
    this.m_az5 = 0
    this.m_amf = 0
    this.v2 = 0
    this.x1 = 0
    this.az3 = 0
    this.az4 = 0
    this.amf = 0
    this.m_kacr = 0
    this.m_k2vg = 0
    this.m_postGain = 0
    this.lastFreq = -1
    this.lastQ = -1
  }

  copyFrom(other: Gen): void {
    const src = other as Moog
    this.m_azt1 = src.m_azt1
    this.m_azt2 = src.m_azt2
    this.m_azt3 = src.m_azt3
    this.m_azt4 = src.m_azt4
    this.m_az5 = src.m_az5
    this.m_amf = src.m_amf
    this.v2 = src.v2
    this.x1 = src.x1
    this.az3 = src.az3
    this.az4 = src.az4
    this.amf = src.amf
    this.m_kacr = src.m_kacr
    this.m_k2vg = src.m_k2vg
    this.m_postGain = src.m_postGain
    this.lastFreq = src.lastFreq
    this.lastQ = src.lastQ
  }

  @inline
  private tanha(x: f32): f32 {
    return x / (1.0 + (x * x) / (3.0 + (x * x) / 5.0))
  }

  @inline
  updateCoeffs(freq: f32, Q: f32): void {
    if (freq <= 0 || freq !== freq || Q <= 0 || Q !== Q) return
    if (freq === this.lastFreq && Q === this.lastQ) return

    this.lastFreq = freq
    this.lastQ = Q

    const freqClamped: f32 = Mathf.max(50, Mathf.min(freq, 22040))
    const QClamped: f32 = Mathf.max(0.01, Mathf.min(Q, 0.985))

    this.v2 = 2.0 + this.kVt
    const kfc: f32 = freqClamped / sampleRate
    const kf: f32 = kfc

    const kfcr: f32 = 1.873 * (kfc * kfc * kfc) + 0.4955 * (kfc * kfc) - 0.649 * kfc + 0.9988

    const x: f32 = -2.0 * Mathf.PI * kfcr * kf
    const exp_out: f32 = Mathf.exp(x)
    const m_k2vgNew: f32 = this.v2 * (1.0 - exp_out)
    const m_kacrNew: f32 = QClamped * (-3.9364 * (kfc * kfc) + 1.8409 * kfc + 0.9968)
    const m_postGainNew: f32 = 1.0001784074555027 + 0.9331585678097162 * QClamped

    this.m_postGain = m_postGainNew
    this.m_kacr = m_kacrNew
    this.m_k2vg = m_k2vgNew
  }

  @inline
  processSample(x0: f32): void {
    this.x1 = x0 - this.m_amf * this.m_kacr
    const az1: f32 = this.m_azt1 + this.m_k2vg * this.tanha(this.x1 / this.v2)
    const at1: f32 = this.m_k2vg * this.tanha(az1 / this.v2)
    this.m_azt1 = az1 - at1

    const az2: f32 = this.m_azt2 + at1
    const at2: f32 = this.m_k2vg * this.tanha(az2 / this.v2)
    this.m_azt2 = az2 - at2

    this.az3 = this.m_azt3 + at2
    const at3: f32 = this.m_k2vg * this.tanha(this.az3 / this.v2)
    this.m_azt3 = this.az3 - at3

    this.az4 = this.m_azt4 + at3
    const at4: f32 = this.m_k2vg * this.tanha(this.az4 / this.v2)
    this.m_azt4 = this.az4 - at4

    this.m_amf = this.az4
  }
}

export class Mlp extends Moog {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.updateCoeffs(load<f32>(cut$), load<f32>(q$))
      this.processSample(load<f32>(in$))
      store<f32>(out$, this.m_amf * this.m_postGain)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}

export class Mhp extends Moog {
  process(out$: usize, length: i32): void {
    let cut$ = this.cut$
    let q$ = this.q$
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      this.updateCoeffs(load<f32>(cut$), load<f32>(q$))
      this.processSample(load<f32>(in$))
      const output = (this.x1 - 3.0 * this.az3 + 2.0 * this.az4) * this.m_postGain
      store<f32>(out$, output)
      out$ += 4
      in$ += 4
      cut$ += 4
      q$ += 4
    }
  }
}
