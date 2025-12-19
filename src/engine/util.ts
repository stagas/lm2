import { SCROLL_SMOOTHING } from './constants.ts'
import { useEngineStore } from './store.ts'

export function applySmoothing(target: number, value: number) {
  const diff = value - target
  const isPlaying = useEngineStore.getState().playbackState === 'running'
  return target + diff * SCROLL_SMOOTHING * (diff < 100 && !isPlaying ? 1.8 : 1)
}
