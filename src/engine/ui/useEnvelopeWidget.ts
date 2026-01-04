import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import { ENVELOPE_DATA_OFFSET, ENVELOPE_ENTRY_SIZE, ENVELOPE_HISTORY_SIZE } from '../../../as/assembly/constants.ts'
import type { AdRef, AdsrRef, EnvfollowRef, SlewRef } from '../bytecode/types.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { applyCurve, clamp01 } from '../util.ts'
import { getCurrentTheme } from './theme.ts'

const SMOOTHING_FACTOR = 0.3

type UseEnvelopeVisualizationParams = {
  program1: ProgramInstance | undefined
  adRefs: AdRef[] | undefined
  adsrRefs: AdsrRef[] | undefined
  envfollowRefs: EnvfollowRef[] | undefined
  slewRefs: SlewRef[] | undefined
  dspSource: string
  showWidgets: boolean
  isLive: boolean
  playbackState: 'stopped' | 'running' | 'paused'
}

export function useEnvelopeWidget({
  program1,
  adRefs,
  adsrRefs,
  envfollowRefs,
  slewRefs,
  dspSource,
  showWidgets,
  isLive,
  playbackState,
}: UseEnvelopeVisualizationParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const refs = [...(adRefs ?? []), ...(adsrRefs ?? []), ...(envfollowRefs ?? []), ...(slewRefs ?? [])]

  type EnvParams = { attack: number; decay: number; sustain: number; release: number; exponent: number }
  type Pt = { tsMod: number; phase: number; phase01: number; value: number }
  type Play = { pts: Pt[]; phase: number; phase01: number; value: number }
  type Smooth = { x: number }

  const lastWritePosRef = useRef<number>(0)
  const stRef = useRef<
    {
      ad: Array<EnvParams | undefined>
      adsr: Array<EnvParams | undefined>
      envfollow: Array<{ attack: number; release: number } | undefined>
      slew: Array<EnvParams | undefined>
      adPlay: Array<Play | undefined>
      adsrPlay: Array<Play | undefined>
      envfollowPlay: Array<Play | undefined>
      slewPlay: Array<Play | undefined>
    }
  >({ ad: [], adsr: [], envfollow: [], slew: [], adPlay: [], adsrPlay: [], envfollowPlay: [], slewPlay: [] })
  const smoothRef = useRef<{
    ad: Array<Smooth | undefined>
    adsr: Array<Smooth | undefined>
    envfollow: Array<Smooth | undefined>
    slew: Array<Smooth | undefined>
  }>({ ad: [], adsr: [], envfollow: [], slew: [] })

  useEffect(() => {
    lastWritePosRef.current = 0
    stRef.current.ad = []
    stRef.current.adsr = []
    stRef.current.envfollow = []
    stRef.current.slew = []
    stRef.current.adPlay = []
    stRef.current.adsrPlay = []
    stRef.current.envfollowPlay = []
    stRef.current.slewPlay = []
    smoothRef.current.ad = []
    smoothRef.current.adsr = []
    smoothRef.current.envfollow = []
    smoothRef.current.slew = []
  }, [dspSource])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!refs.length) return
    if (!isLive) return

    const history = program1?.program.envelopeHistory
    if (!history) return

    const writePos = Math.floor(history.writePos) >>> 0
    if (playbackState !== 'running') {
      lastWritePosRef.current = writePos
      return
    }

    const pred = useEngineRuntimeStore.getState().predictedSampleCountResult
    if (!pred) return

    const MOD = 1 << 20
    const nowMod = (Math.floor(pred.sampleCount) >>> 0) & (MOD - 1)
    const prevWritePos = lastWritePosRef.current >>> 0
    lastWritePosRef.current = writePos

    if (writePos === prevWritePos) return

    const raw = history.raw
    const deltaRaw = (writePos - prevWritePos + MOD) % MOD
    const delta = Math.min(deltaRaw, ENVELOPE_HISTORY_SIZE)

    for (let k = delta; k > 0; k--) {
      const p = (writePos - k) >>> 0
      const slot = p % ENVELOPE_HISTORY_SIZE
      const base = ENVELOPE_DATA_OFFSET + slot * ENVELOPE_ENTRY_SIZE

      const idxRaw = raw[base]
      const kindRaw = raw[base + 1]
      if (!Number.isFinite(idxRaw) || !Number.isFinite(kindRaw)) continue

      const idx = Math.floor(idxRaw)
      const kind = Math.floor(kindRaw)
      if (idx < 0 || idx > 255) continue
      if (kind !== 0 && kind !== 1 && kind !== 2 && kind !== 3) continue

      const attackRaw = raw[base + 2]
      const decayRaw = raw[base + 3]
      const sustainRaw = raw[base + 4]
      const releaseRaw = raw[base + 5]
      const exponentRaw = raw[base + 6]
      const phaseRaw = raw[base + 7]
      const phase01Raw = raw[base + 8]
      const valueRaw = raw[base + 9]
      const tsMod = (Math.floor(raw[base + 10] ?? 0) >>> 0) & (MOD - 1)

      const pushPt = (arr: Array<Play | undefined>) => {
        if (!Number.isFinite(phaseRaw) || !Number.isFinite(phase01Raw) || !Number.isFinite(valueRaw)) return
        let st = arr[idx]
        if (!st) {
          st = { pts: [], phase: Math.floor(phaseRaw), phase01: phase01Raw, value: valueRaw }
          arr[idx] = st
        }
        st.pts.push({ tsMod, phase: Math.floor(phaseRaw), phase01: phase01Raw, value: valueRaw })
        const keep = 256
        if (st.pts.length > keep) st.pts.splice(0, st.pts.length - keep)
      }

      if (kind === 2) {
        // Slew: up, down, exponent
        if (!Number.isFinite(attackRaw) || !Number.isFinite(decayRaw) || !Number.isFinite(exponentRaw)) continue
        const up = Math.max(0, attackRaw)
        const down = Math.max(0, decayRaw) || up
        const exponent = exponentRaw
        stRef.current.slew[idx] = { attack: up, decay: down, sustain: 0, release: 0, exponent }
        pushPt(stRef.current.slewPlay)
      }
      else if (kind === 3) {
        // Envfollow: attack, release
        if (!Number.isFinite(attackRaw) || !Number.isFinite(decayRaw)) continue
        const attack = Math.max(0, attackRaw)
        const release = Math.max(0, decayRaw)
        stRef.current.envfollow[idx] = { attack, release }
        pushPt(stRef.current.envfollowPlay)
      }
      else {
        // AD or ADSR
        if (!Number.isFinite(attackRaw) || !Number.isFinite(decayRaw)) continue
        if (kind === 1 && (!Number.isFinite(sustainRaw) || !Number.isFinite(releaseRaw))) continue
        if (!Number.isFinite(exponentRaw)) continue

        const attack = Math.max(0, attackRaw)
        const decay = Math.max(0, decayRaw)
        const sustain = kind === 1 ? Math.max(0, Math.min(1, sustainRaw)) : 0
        const release = kind === 1 ? Math.max(0, releaseRaw) : 0
        const exponent = exponentRaw

        if (kind === 1) stRef.current.adsr[idx] = { attack, decay, sustain, release, exponent }
        else stRef.current.ad[idx] = { attack, decay, sustain: 0, release: 0, exponent }
        pushPt(kind === 1 ? stRef.current.adsrPlay : stRef.current.adPlay)
      }
    }

    const applyBest = (arr: Array<Play | undefined>) => {
      for (let idx = 0; idx < arr.length; idx++) {
        const st = arr[idx]
        if (!st) continue
        const pts = st.pts
        if (!pts.length) continue

        let best: Pt | null = null
        for (let i = pts.length - 1; i >= 0; i--) {
          const p = pts[i]!
          const ahead = (p.tsMod - nowMod + MOD) % MOD
          if (ahead !== 0 && ahead < MOD / 2) continue
          best = p
          break
        }
        best ??= pts[0]!

        st.phase = best.phase
        st.phase01 = best.phase01
        st.value = best.value
      }
    }

    applyBest(stRef.current.adPlay)
    applyBest(stRef.current.adsrPlay)
    applyBest(stRef.current.envfollowPlay)
    applyBest(stRef.current.slewPlay)
  }, [showWidgets, refs.length, isLive, playbackState, program1?.program.envelopeHistory])

  const widgets = useMemo(() => {
    const out: EditorWidget[] = []

    for (const ref of refs) {
      const isAdsr = 'sustain' in ref.params
      const isEnvfollow = 'envfollowIndex' in ref
      const isSlew = 'slewIndex' in ref
      const height = 40

      out.push({
        type: 'above',
        line: ref.aboveLoc.line,
        column: ref.aboveLoc.column,
        length: Math.max(1, ref.aboveLoc.length),
        height,
        render: (c, x, y, w, h, _vx, _vw) => {
          c.save()
          c.translate(x, y)

          // Enable smooth curves
          c.lineCap = 'round'
          c.lineJoin = 'round'

          const theme = getCurrentTheme()
          c.fillStyle = theme.background
          c.fillRect(0, 0, w, h)

          // Draw envelope curve
          c.strokeStyle = theme.colors.function
          c.lineWidth = 1.35
          c.beginPath()

          const padding = 0
          const plotW = w
          const plotH = h // - padding * 3.2
          const plotX = 0
          const plotY = padding
          let playX: number | null = null
          let playY: number | null = null
          let targetX: number | null = null

          const invertCurve = (y: number, curve: number): number => {
            const yy = clamp01(y)
            if (curve > 0) return Math.pow(yy, 1 / curve)
            if (curve < 0) {
              const base = -curve
              const t = 1 - Math.pow(1 - yy, 1 / base)
              return clamp01(t)
            }
            return yy
          }

          if (isAdsr) {
            // ADSR envelope: Attack -> Decay -> Sustain -> Release
            const adsrRef = ref as AdsrRef
            const rt = (isLive || playbackState !== 'running') ? stRef.current.adsr[adsrRef.adsrIndex] : undefined
            const pl = stRef.current.adsrPlay[adsrRef.adsrIndex]
            const attack = Math.max(0, rt?.attack ?? adsrRef.params.attack)
            const decay = Math.max(0, rt?.decay ?? adsrRef.params.decay)
            const exponent = rt?.exponent ?? adsrRef.params.exponent ?? 1
            const sustain = applyCurve(rt?.sustain ?? adsrRef.params.sustain, exponent)
            const release = Math.max(0, rt?.release ?? adsrRef.params.release)
            const adTotal = attack + decay
            let sustainW = plotW * 0.25
            let attackW = 0
            let decayW = 0
            let releaseW = 0

            if (adTotal > 0) {
              // Release width: scales with release value
              const remainingW = plotW - sustainW
              const releaseRatio = release * 0.5
              releaseW = releaseRatio * remainingW
              const adW = remainingW - releaseW

              attackW = (attack / adTotal) * adW
              decayW = (decay / adTotal) * adW

              // Attack phase (curved)
              const attackX = attackW
              c.moveTo(plotX, plotY + plotH)
              const attackPoints = Math.max(2, Math.ceil(attackW))
              for (let i = 0; i <= attackPoints; i++) {
                const t = i / attackPoints
                const x = plotX + t * attackX
                const y = plotY + plotH - applyCurve(t, exponent) * plotH
                if (i === 0) c.moveTo(x, y)
                else c.lineTo(x, y)
              }

              // Decay phase (curved)
              const decayX = attackW + decayW
              const sustainY = plotY + plotH - (sustain * plotH)
              const decayPoints = Math.max(2, Math.ceil(decayW))
              for (let i = 0; i <= decayPoints; i++) {
                const t = i / decayPoints
                const x = plotX + attackX + t * decayW
                const y = plotY + plotH - (applyCurve(1 - t, exponent) * (1 - sustain) + sustain) * plotH
                c.lineTo(x, y)
              }

              // Sustain phase (horizontal line)
              const sustainEndX = decayX + sustainW
              c.lineTo(plotX + sustainEndX, sustainY)

              // Release phase (curved)
              const releasePoints = Math.max(2, Math.ceil(releaseW))
              for (let i = 0; i <= releasePoints; i++) {
                const t = i / releasePoints
                const x = plotX + sustainEndX + t * releaseW
                const y = plotY + plotH - (applyCurve(1 - t, exponent) * sustain) * plotH
                c.lineTo(x, y)
              }

              if (pl) {
                const phase = pl.phase | 0
                const t = clamp01(pl.phase01)
                targetX = phase === 0
                  ? plotX
                  : (phase === 1)
                  ? (plotX + t * attackW)
                  : (phase === 2)
                  ? (plotX + attackW + t * decayW)
                  : (phase === 3)
                  ? (plotX + attackW + decayW + t * sustainW)
                  : (phase === 4)
                  ? (plotX + attackW + decayW + sustainW + t * releaseW)
                  : plotX
              }
            }

            if (pl) {
              const idx = adsrRef.adsrIndex | 0
              if (targetX !== null) {
                let sm = smoothRef.current.adsr[idx]
                if (!sm) {
                  sm = { x: targetX }
                  smoothRef.current.adsr[idx] = sm
                }
                const a = playbackState === 'running' ? SMOOTHING_FACTOR : 1.0
                if (targetX < sm.x) sm.x = targetX
                else sm.x += (targetX - sm.x) * a
                playX = sm.x

                const x = playX
                const attackX = attackW
                const decayX = attackW + decayW
                const sustainEndX = decayX + sustainW
                let lvl = 0
                if (x <= plotX) lvl = 0
                else if (x < plotX + attackX) {
                  const tt = (x - plotX) / Math.max(1e-6, attackX)
                  lvl = applyCurve(tt, exponent)
                }
                else if (x < plotX + decayX) {
                  const tt = (x - (plotX + attackX)) / Math.max(1e-6, decayW)
                  lvl = applyCurve(1 - tt, exponent) * (1 - sustain) + sustain
                }
                else if (x < plotX + sustainEndX) {
                  lvl = sustain
                }
                else {
                  const tt = (x - (plotX + sustainEndX)) / Math.max(1e-6, releaseW)
                  lvl = applyCurve(1 - tt, exponent) * sustain
                }
                playY = plotY + plotH - lvl * plotH
              }
            }
          }
          else if (isEnvfollow) {
            // Envfollow envelope: rise + fall, exponential easing (width encodes attack vs release proportion)
            const envfollowRef = ref as EnvfollowRef
            const rt = (isLive || playbackState !== 'running')
              ? stRef.current.envfollow[envfollowRef.envfollowIndex]
              : undefined
            const pl = stRef.current.envfollowPlay[envfollowRef.envfollowIndex]
            const attack = rt?.attack ?? envfollowRef.params.attack
            const release = rt?.release ?? envfollowRef.params.release

            if (attack + release > 0) {
              // Keep the transfer function stable and readable: time proportions are shown by width,
              // while the curve inside each segment is a normalized exponential easing.
              const k = 3.0
              const den = 1 - Math.exp(-k)

              // Attack phase (exponential rise; normalized so it ends exactly at 1)
              const attackW = (attack / (attack + release)) * plotW
              c.moveTo(plotX, plotY + plotH)
              const attackPoints = Math.max(2, Math.ceil(attackW))
              for (let i = 0; i <= attackPoints; i++) {
                const t = i / attackPoints
                const x = plotX + t * attackW
                const lvl = den > 0 ? (1 - Math.exp(-k * t)) / den : t
                const y = plotY + plotH - lvl * plotH
                if (i === 0) c.moveTo(x, y)
                else c.lineTo(x, y)
              }

              // Release phase (exponential fall; starts exactly at 1 where attack ends)
              const releaseW = plotW - attackW
              const releasePoints = Math.max(2, Math.ceil(releaseW))
              for (let i = 1; i <= releasePoints; i++) {
                const t = i / releasePoints
                const x = plotX + attackW + t * releaseW
                const lvl = den > 0 ? (Math.exp(-k * t) - Math.exp(-k)) / den : 1 - t
                const y = plotY + plotH - lvl * plotH
                c.lineTo(x, y)
              }

              if (pl) {
                const phase = pl.phase | 0
                const v = clamp01(pl.value)
                const t = phase === 1
                  ? (den > 0 ? (-Math.log(1 - v * den) / k) : v)
                  : (den > 0 ? (-Math.log(v * den + Math.exp(-k)) / k) : (1 - v))
                const idx = envfollowRef.envfollowIndex | 0

                targetX = phase === 2
                  ? plotX
                  : phase === 1
                  ? (plotX + clamp01(t) * attackW)
                  : (plotX + attackW + clamp01(t) * releaseW)

                if (targetX !== null) {
                  let sm = smoothRef.current.envfollow[idx]
                  if (!sm) {
                    sm = { x: targetX }
                    smoothRef.current.envfollow[idx] = sm
                  }
                  const a = playbackState === 'running' ? SMOOTHING_FACTOR : 1.0
                  if (targetX < sm.x) sm.x = targetX
                  else sm.x += (targetX - sm.x) * a
                  playX = sm.x

                  const x = playX
                  const isAttack = x < plotX + attackW
                  let lvl = 0
                  if (x <= plotX) lvl = 0
                  else if (isAttack) {
                    const tt = (x - plotX) / Math.max(1e-6, attackW)
                    lvl = den > 0 ? (1 - Math.exp(-k * tt)) / den : tt
                  }
                  else {
                    const tt = (x - (plotX + attackW)) / Math.max(1e-6, releaseW)
                    lvl = den > 0 ? (Math.exp(-k * tt) - Math.exp(-k)) / den : 1 - tt
                  }
                  playY = plotY + plotH - lvl * plotH
                }
              }
            }
          }
          else if (isSlew) {
            // Slew envelope: shows the slew rate curve
            const slewRef = ref as SlewRef
            const rt = (isLive || playbackState !== 'running') ? stRef.current.slew[slewRef.slewIndex] : undefined
            const pl = stRef.current.slewPlay[slewRef.slewIndex]
            const up = rt?.attack ?? slewRef.params.up
            const down = rt?.decay ?? slewRef.params.down
            const exponent = rt?.exponent ?? slewRef.params.exponent ?? 1

            const invUp = up > 0 ? 1 / up : 1e6
            const invDown = down > 0 ? 1 / down : 1e6
            const invTotal = invUp + invDown
            const upW = invTotal > 0 ? (invUp / invTotal) * plotW : plotW * 0.5
            const downW = plotW - upW

            c.beginPath()
            c.moveTo(plotX, plotY + plotH)

            const upPoints = Math.max(2, Math.ceil(upW))
            for (let i = 1; i <= upPoints; i++) {
              const t = i / upPoints
              const x = plotX + t * upW
              const y = applyCurve(t, exponent)
              c.lineTo(x, plotY + plotH - y * plotH)
            }

            const downPoints = Math.max(2, Math.ceil(downW))
            for (let i = 1; i <= downPoints; i++) {
              const t = i / downPoints
              const x = plotX + upW + t * downW
              const y = applyCurve(1 - t, exponent)
              c.lineTo(x, plotY + plotH - y * plotH)
            }

            if (pl) {
              const v = clamp01(pl.value)
              const targetPhase = pl.phase | 0
              const targetT = invertCurve(v, exponent)
              const idx = slewRef.slewIndex | 0
              const t = clamp01(targetT)
              targetX = targetPhase === 2
                ? plotX
                : targetPhase === 1
                ? (plotX + t * upW)
                : (plotX + upW + t * downW)

              if (targetX !== null) {
                let sm = smoothRef.current.slew[idx]
                if (!sm) {
                  sm = { x: targetX }
                  smoothRef.current.slew[idx] = sm
                }
                const a = playbackState === 'running' ? SMOOTHING_FACTOR : 1.0
                if (targetX < sm.x) sm.x = targetX
                else sm.x += (targetX - sm.x) * a
                playX = sm.x

                const x = playX
                let lvl = 0
                if (x <= plotX) lvl = 0
                else if (x < plotX + upW) {
                  const tt = (x - plotX) / Math.max(1e-6, upW)
                  lvl = applyCurve(tt, exponent)
                }
                else {
                  const tt = (x - (plotX + upW)) / Math.max(1e-6, downW)
                  lvl = applyCurve(1 - tt, exponent)
                }
                playY = plotY + plotH - lvl * plotH
              }
            }
          }
          else {
            // AD envelope: Attack -> Decay
            const adRef = ref as AdRef
            const rt = (isLive || playbackState !== 'running') ? stRef.current.ad[adRef.adIndex] : undefined
            const pl = stRef.current.adPlay[adRef.adIndex]
            const attack = rt?.attack ?? adRef.params.attack
            const decay = rt?.decay ?? adRef.params.decay
            const exponent = rt?.exponent ?? adRef.params.exponent ?? 1
            const total = attack + decay

            if (total > 0) {
              // Attack phase (curved)
              const attackX = (attack / total) * plotW
              c.moveTo(plotX, plotY + plotH)
              const attackPoints = Math.max(2, Math.ceil(attackX))
              for (let i = 0; i <= attackPoints; i++) {
                const t = i / attackPoints
                const x = plotX + t * attackX
                const y = plotY + plotH - applyCurve(t, exponent) * plotH
                if (i === 0) c.moveTo(x, y)
                else c.lineTo(x, y)
              }

              // Decay phase (curved)
              const decayW = plotW - attackX
              const decayPoints = Math.max(2, Math.ceil(decayW))
              for (let i = 1; i <= decayPoints; i++) {
                const t = i / decayPoints
                const x = plotX + attackX + t * decayW
                const y = plotY + plotH - applyCurve(1 - t, exponent) * plotH
                c.lineTo(x, y)
              }

              if (pl) {
                const phase = pl.phase | 0
                const t = clamp01(pl.phase01)
                if (phase === 0) {
                  playX = plotX
                  playY = plotY + plotH
                }
                else {
                  playX = (phase === 1) ? (plotX + t * attackX) : (plotX + attackX + t * decayW)
                  const lvl = (phase === 1) ? applyCurve(t, exponent) : applyCurve(1 - t, exponent)
                  playY = plotY + plotH - lvl * plotH
                }
              }
            }

            if (pl) {
              const phase = pl.phase | 0
              const t = clamp01(pl.phase01)
              const attackX = total > 0 ? (attack / total) * plotW : plotW
              const decayW = plotW - attackX
              targetX = phase === 0
                ? plotX
                : phase === 1
                ? (plotX + t * attackX)
                : (plotX + attackX + t * decayW)

              const idx = adRef.adIndex | 0
              if (targetX !== null) {
                let sm = smoothRef.current.ad[idx]
                if (!sm) {
                  sm = { x: targetX }
                  smoothRef.current.ad[idx] = sm
                }
                const a = playbackState === 'running' ? SMOOTHING_FACTOR : 1.0
                if (targetX < sm.x) sm.x = targetX
                else sm.x += (targetX - sm.x) * a
                playX = sm.x

                const x = playX
                let lvl = 0
                if (x <= plotX) lvl = 0
                else if (x < plotX + attackX) {
                  const tt = (x - plotX) / Math.max(1e-6, attackX)
                  lvl = applyCurve(tt, exponent)
                }
                else {
                  const tt = (x - (plotX + attackX)) / Math.max(1e-6, decayW)
                  lvl = applyCurve(1 - tt, exponent)
                }
                playY = plotY + plotH - lvl * plotH
              }
            }
          }

          c.fillStyle = theme.colors.function
          c.globalAlpha = 0.29
          c.fill()
          c.globalAlpha = 1.0
          c.stroke()

          if (playX !== null && playY !== null) {
            c.save()
            c.strokeStyle = 'rgba(255,255,0,0.9)'
            c.lineWidth = 1.35
            c.beginPath()
            c.moveTo(playX, plotY)
            c.lineTo(playX, plotY + plotH)
            c.stroke()
            c.fillStyle = 'rgba(255,255,0,0.9)'
            c.beginPath()
            c.arc(playX, playY, 2.2, 0, Math.PI * 2)
            c.fill()
            c.restore()
          }

          c.font = '9px "Outfit"'
          c.textAlign = 'center'
          c.fillStyle = theme.colors.comment

          // Draw phase labels for ADSR
          // if (isAdsr) {
          //   c.fillStyle = theme.colors.comment

          //   const adsrRef = ref as AdsrRef
          //   const rt = (isLive || playbackState !== 'running') ? stRef.current.adsr[adsrRef.adsrIndex] : undefined
          //   const attack = Math.max(0, rt?.attack ?? adsrRef.params.attack)
          //   const decay = Math.max(0, rt?.decay ?? adsrRef.params.decay)
          //   const release = Math.max(0, rt?.release ?? adsrRef.params.release)
          //   const adrTotal = attack + decay + release

          //   if (adrTotal > 0) {
          //     const sustainW = plotW * 0.28
          //     const adrW = Math.max(1e-6, plotW - sustainW)
          //     const attackW = (attack / adrTotal) * adrW
          //     const decayW = (decay / adrTotal) * adrW
          //     const releaseW = (release / adrTotal) * adrW

          //     const attackX = attackW
          //     const decayX = attackW + decayW
          //     const sustainEndX = decayX + sustainW

          //     const minX = plotX + 3
          //     const maxX = plotX + plotW - 3
          //     const minGap = 10

          //     let ax = plotX + attackX / 2
          //     let dx = plotX + (attackW + decayW / 2)
          //     let sx = plotX + (decayX + sustainW / 2)
          //     let rx = plotX + (sustainEndX + releaseW / 2)

          //     ax = Math.max(minX, Math.min(maxX, ax))
          //     dx = Math.max(minX, Math.min(maxX, dx))
          //     sx = Math.max(minX, Math.min(maxX, sx))
          //     rx = Math.max(minX, Math.min(maxX, rx))

          //     // Keep labels readable in extreme parameter ratios (best-effort spacing).
          //     if (dx < ax + minGap) dx = ax + minGap
          //     if (sx < dx + minGap) sx = dx + minGap
          //     if (rx < sx + minGap) rx = sx + minGap

          //     if (rx > maxX) {
          //       const over = rx - maxX
          //       rx -= over
          //       sx -= over
          //       dx -= over
          //       ax -= over
          //     }

          //     ax = Math.max(minX, Math.min(maxX, ax))
          //     dx = Math.max(minX, Math.min(maxX, dx))
          //     sx = Math.max(minX, Math.min(maxX, sx))
          //     rx = Math.max(minX, Math.min(maxX, rx))

          //     const y0 = plotY + plotH + 1.35

          //     c.fillText('A', ax, y0)
          //     c.fillText('D', dx, y0)
          //     c.fillText('S', sx, y0)
          //     c.fillText('R', rx, y0)
          //   }
          // }
          // else {
          //   // Draw phase labels for AD
          //   const adRef = ref as AdRef
          //   const rt = (isLive || playbackState !== 'running') ? stRef.current.ad[adRef.adIndex] : undefined
          //   const attack = rt?.attack ?? adRef.params.attack
          //   const decay = rt?.decay ?? adRef.params.decay
          //   const total = attack + decay

          //   if (total > 0) {
          //     const attackX = (attack / total) * plotW

          //     const minX = plotX + 3
          //     const maxX = plotX + plotW - 3
          //     const minGap = 10

          //     let ax = plotX + attackX / 2
          //     let dx = plotX + (attackX + plotW) / 2

          //     ax = Math.max(minX, Math.min(maxX, ax))
          //     dx = Math.max(minX, Math.min(maxX, dx))

          //     const y0 = plotY + plotH + 1.35

          //     c.fillText('A', ax, y0)
          //     c.fillText('D', dx, y0)
          //   }
          // }

          c.restore()
        },
      })
    }

    return out
  }, [adRefs, adsrRefs, envfollowRefs, slewRefs, isLive, playbackState])

  return { widgets, onBeforeDraw }
}
