import { SCROLL_SMOOTHING } from './constants.ts'
import { useEngineRuntimeStore } from './store.ts'

export function applySmoothing(target: number, value: number, crossover = 100) {
  const diff = value - target
  const isPlaying = useEngineRuntimeStore.getState().playbackState === 'running'
  return target
    + diff * SCROLL_SMOOTHING * (isPlaying && Math.abs(diff) > crossover ? 4 : (!isPlaying ? 1.8 : 1))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

// Shared maximum index for all generators (envelopes, LFOs, filters, reverbs)
export const MAX_GEN_INDEX = 255

export function applyCurve(t: number, curve: number): number {
  if (curve > 0.0) return Math.pow(t, curve)
  if (curve < 0.0) {
    const base = -curve
    // mirrored complement: make e-<n> be the exact opposite of e< n >
    // so e-10(t) == 1 - (1 - t)^10
    if (base > 0.0) {
      return 1.0 - Math.pow(1.0 - t, base)
    }
  }
  return t
}
