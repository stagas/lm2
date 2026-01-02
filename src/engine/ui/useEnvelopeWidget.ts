import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import { ENVELOPE_DATA_OFFSET, ENVELOPE_ENTRY_SIZE, ENVELOPE_HISTORY_SIZE } from '../../../as/assembly/constants.ts'
import type { AdRef, AdsrRef } from '../bytecode/types.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { getCurrentTheme } from './theme.ts'

type UseEnvelopeVisualizationParams = {
  program1: ProgramInstance | undefined
  adRefs: AdRef[] | undefined
  adsrRefs: AdsrRef[] | undefined
  dspSource: string
  showWidgets: boolean
  isLive: boolean
  playbackState: 'stopped' | 'running' | 'paused'
}

export function useEnvelopeWidget({
  program1,
  adRefs,
  adsrRefs,
  dspSource,
  showWidgets,
  isLive,
  playbackState,
}: UseEnvelopeVisualizationParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const refs = [...(adRefs ?? []), ...(adsrRefs ?? [])]

  type EnvParams = { attack: number; decay: number; sustain: number; release: number }

  const lastWritePosRef = useRef<number>(0)
  const stRef = useRef<{ ad: Array<EnvParams | undefined>; adsr: Array<EnvParams | undefined> }>({ ad: [], adsr: [] })

  useEffect(() => {
    lastWritePosRef.current = 0
    stRef.current.ad.length = 0
    stRef.current.adsr.length = 0
  }, [dspSource])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!refs.length) return
    if (!isLive) return

    const history = program1?.program.envelopeHistory
    if (!history) return

    const writePos = Math.floor(history.writePos) >>> 0
    if (playbackState !== 'running') {
      return
    }

    const MOD = 1 << 20
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
      if (idx < 0 || idx > 63) continue
      if (kind !== 0 && kind !== 1) continue

      const attackRaw = raw[base + 2]
      const decayRaw = raw[base + 3]
      const sustainRaw = raw[base + 4]
      const releaseRaw = raw[base + 5]

      if (!Number.isFinite(attackRaw) || !Number.isFinite(decayRaw)) continue
      if (kind === 1 && (!Number.isFinite(sustainRaw) || !Number.isFinite(releaseRaw))) continue

      const attack = Math.max(0, attackRaw)
      const decay = Math.max(0, decayRaw)
      const sustain = kind === 1 ? Math.max(0, Math.min(1, sustainRaw)) : 0
      const release = kind === 1 ? Math.max(0, releaseRaw) : 0

      if (kind === 1) stRef.current.adsr[idx] = { attack, decay, sustain, release }
      else stRef.current.ad[idx] = { attack, decay, sustain: 0, release: 0 }
    }
  }, [showWidgets, refs.length, isLive, playbackState, program1?.program.envelopeHistory])

  const widgets = useMemo(() => {
    const out: EditorWidget[] = []

    for (const ref of refs) {
      const isAdsr = 'sustain' in ref.params
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

          if (isAdsr) {
            // ADSR envelope: Attack -> Decay -> Sustain -> Release
            const adsrRef = ref as AdsrRef
            const rt = (isLive || playbackState !== 'running') ? stRef.current.adsr[adsrRef.adsrIndex] : undefined
            const attack = Math.max(0, rt?.attack ?? adsrRef.params.attack)
            const decay = Math.max(0, rt?.decay ?? adsrRef.params.decay)
            const sustain = rt?.sustain ?? adsrRef.params.sustain
            const release = Math.max(0, rt?.release ?? adsrRef.params.release)
            const adrTotal = attack + decay + release

            if (adrTotal > 0) {
              const sustainW = plotW * 0.28
              const adrW = Math.max(1e-6, plotW - sustainW)
              const attackW = (attack / adrTotal) * adrW
              const decayW = (decay / adrTotal) * adrW
              const releaseW = (release / adrTotal) * adrW

              // Attack phase
              const attackX = attackW
              c.moveTo(plotX, plotY + plotH)
              c.lineTo(plotX + attackX, plotY)

              // Decay phase
              const decayX = attackW + decayW
              const sustainY = plotY + plotH - (sustain * plotH)
              c.lineTo(plotX + decayX, sustainY)

              // Sustain phase (horizontal line)
              const sustainEndX = decayX + sustainW
              c.lineTo(plotX + sustainEndX, sustainY)

              // Release phase
              c.lineTo(plotX + (sustainEndX + releaseW), plotY + plotH)
            }
          }
          else {
            // AD envelope: Attack -> Decay
            const adRef = ref as AdRef
            const rt = (isLive || playbackState !== 'running') ? stRef.current.ad[adRef.adIndex] : undefined
            const attack = rt?.attack ?? adRef.params.attack
            const decay = rt?.decay ?? adRef.params.decay
            const total = attack + decay

            if (total > 0) {
              // Attack phase
              const attackX = (attack / total) * plotW
              c.moveTo(plotX, plotY + plotH)
              c.lineTo(plotX + attackX, plotY)

              // Decay phase
              c.lineTo(plotX + plotW, plotY + plotH)
            }
          }

          c.fillStyle = theme.colors.function
          c.globalAlpha = 0.29
          c.fill()
          c.globalAlpha = 1.0
          c.stroke()

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
  }, [adRefs, adsrRefs, isLive, playbackState])

  return { widgets, onBeforeDraw }
}
